import { NextRequest } from 'next/server'
import { createHash } from 'crypto'
import { gameStore } from '@/lib/gameStore'
import type { Player, QueueState } from '@/lib/gameStore'
import { isRedisAvailable } from '@/lib/redis'
import { PLAYER_ID_HEADER, isCrossSiteRequest, getClientIdentifier, secureJsonResponse, withRateLimit } from '@/lib/security'
import {
  validatePlayerId,
  sanitizePlayerName,
  validateSquare,
  validatePromotion,
  validateColor,
  validateAdminPassword,
  validateAction,
} from '@/lib/validation'
import { checkRateLimit, getRateLimitHeaders } from '@/lib/ratelimit'
import { logger } from '@/lib/logger'
import {
  getCachedGameState,
  getCachedQueueState,
  getCachedVersion,
  onMutationSuccess,
} from '@/lib/stateManager'

export const runtime = 'nodejs'

function toPublicPlayerId(playerId: string): string {
  const digest = createHash('sha256').update(playerId).digest('base64url').slice(0, 16)
  return `anon_${digest}`
}

function getViewerTag(viewerPlayerId: string | null): string {
  if (!viewerPlayerId) return 'public'
  return createHash('sha256').update(viewerPlayerId).digest('base64url').slice(0, 8)
}

function toPublicPlayer(player: Player, viewerPlayerId: string | null): Player {
  if (viewerPlayerId && player.id === viewerPlayerId) return { ...player }
  return { ...player, id: toPublicPlayerId(player.id) }
}

function toPublicQueueState(queue: QueueState, viewerPlayerId: string | null): QueueState {
  return {
    whiteQueue: queue.whiteQueue.map((p) => toPublicPlayer(p, viewerPlayerId)),
    blackQueue: queue.blackQueue.map((p) => toPublicPlayer(p, viewerPlayerId)),
    currentWhitePlayer: queue.currentWhitePlayer ? toPublicPlayer(queue.currentWhitePlayer, viewerPlayerId) : null,
    currentBlackPlayer: queue.currentBlackPlayer ? toPublicPlayer(queue.currentBlackPlayer, viewerPlayerId) : null,
    whiteTurnState: queue.whiteTurnState,
    blackTurnState: queue.blackTurnState,
  }
}

// GET: Read from in-memory cache only (NO Redis calls)
// This is for fallback polling - primary updates come via SSE
export async function GET(request: NextRequest) {
  const rateLimitResult = await withRateLimit(request, 'general')
  if (!rateLimitResult.allowed) {
    return rateLimitResult.response!
  }

  const viewerPlayerId = validatePlayerId(request.headers.get(PLAYER_ID_HEADER))

  try {
    // Read from in-memory cache - NO Redis call
    const [game, queue, version] = await Promise.all([
      getCachedGameState(),
      getCachedQueueState(),
      getCachedVersion(),
    ])

    const safeQueue = toPublicQueueState(queue, viewerPlayerId)
    const etag = `W/"${version}.${getViewerTag(viewerPlayerId)}"`

    // Check ETag for conditional response
    const ifNoneMatch = request.headers.get('if-none-match')
    if (ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ...rateLimitResult.headers,
          ETag: etag,
          'Cache-Control': 'private, max-age=0, must-revalidate',
          Vary: `${PLAYER_ID_HEADER}, If-None-Match`,
        },
      })
    }

    return secureJsonResponse(
      { game, queue: safeQueue, version },
      200,
      {
        ...rateLimitResult.headers,
        Vary: `${PLAYER_ID_HEADER}, If-None-Match`,
        ETag: etag,
        'Cache-Control': 'private, max-age=0, must-revalidate',
      }
    )
  } catch (err) {
    logger.error('GET /api/game failed', { error: String(err) })
    return secureJsonResponse(
      { error: 'Failed to get game state' },
      500,
      { ...rateLimitResult.headers, Vary: PLAYER_ID_HEADER }
    )
  }
}

// POST: Write to Redis + update cache + broadcast to SSE clients
export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request)) {
    return secureJsonResponse({ error: 'Cross-site requests are not allowed' }, 403)
  }

  const clientId = getClientIdentifier(request)

  const generalLimit = await checkRateLimit(clientId, 'general')
  if (!generalLimit.success) {
    return secureJsonResponse(
      { error: 'Too many requests. Please slow down.' },
      429,
      { ...getRateLimitHeaders(generalLimit), 'Retry-After': Math.ceil((generalLimit.reset - Date.now()) / 1000).toString() }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return secureJsonResponse({ error: 'Invalid JSON body' }, 400, getRateLimitHeaders(generalLimit))
  }

  const action = validateAction(body.action)
  if (!action) {
    return secureJsonResponse({ error: 'Invalid or missing action' }, 400, getRateLimitHeaders(generalLimit))
  }

  const headers = getRateLimitHeaders(generalLimit)

  switch (action) {
    case 'join': {
      const joinLimit = await checkRateLimit(clientId, 'join')
      if (!joinLimit.success) {
        return secureJsonResponse(
          { error: 'Too many join attempts. Please wait.' },
          429,
          { ...getRateLimitHeaders(joinLimit), 'Retry-After': Math.ceil((joinLimit.reset - Date.now()) / 1000).toString() }
        )
      }

      const playerId = validatePlayerId(body.playerId)
      const playerName = sanitizePlayerName(body.playerName)
      const color = validateColor(body.color)

      if (!playerId) {
        return secureJsonResponse({ error: 'Invalid player ID format' }, 400, headers)
      }
      if (!playerName) {
        return secureJsonResponse({ error: 'Invalid player name. Use 1-30 alphanumeric characters.' }, 400, headers)
      }
      if (!color) {
        return secureJsonResponse({ error: 'Invalid color. Must be "w" or "b".' }, 400, headers)
      }

      if (!isRedisAvailable()) {
        return secureJsonResponse(
          { error: 'Game server not configured. Redis is required for multiplayer.', redisAvailable: false },
          503,
          headers
        )
      }

      try {
        const result = await gameStore.joinQueue(
          { id: playerId, name: playerName, joinedAt: Date.now() },
          color
        )
        if (result.success && result.state) {
          // Update cache and broadcast to all SSE clients
          await onMutationSuccess(result.state)
          logger.info('Player joined queue', { playerName, color })
        }
        return secureJsonResponse({ success: result.success, error: result.error }, result.success ? 200 : 400, headers)
      } catch (err) {
        logger.error('Join queue failed', { error: String(err), playerName })
        return secureJsonResponse({ success: false, error: 'Failed to join queue' }, 500, headers)
      }
    }

    case 'leave': {
      const playerId = validatePlayerId(body.playerId)
      if (!playerId) {
        return secureJsonResponse({ error: 'Invalid player ID' }, 400, headers)
      }
      try {
        const result = await gameStore.leaveQueue(playerId)
        if (result.success && result.state) {
          // Update cache and broadcast to all SSE clients
          await onMutationSuccess(result.state)
        }
        return secureJsonResponse({ success: true }, 200, headers)
      } catch (err) {
        logger.error('Leave queue failed', { error: String(err) })
        return secureJsonResponse({ success: false, error: 'Failed to leave queue' }, 500, headers)
      }
    }

    case 'move': {
      const moveLimit = await checkRateLimit(clientId, 'move')
      if (!moveLimit.success) {
        return secureJsonResponse(
          { error: 'Too many move attempts. Please slow down.' },
          429,
          { ...getRateLimitHeaders(moveLimit), 'Retry-After': Math.ceil((moveLimit.reset - Date.now()) / 1000).toString() }
        )
      }

      const playerId = validatePlayerId(body.playerId)
      const from = validateSquare(body.from)
      const to = validateSquare(body.to)
      const promotion = validatePromotion(body.promotion)

      if (!playerId) {
        return secureJsonResponse({ error: 'Invalid player ID' }, 400, headers)
      }
      if (!from || !to) {
        return secureJsonResponse({ error: 'Invalid square format' }, 400, headers)
      }

      const result = await gameStore.makeMove(playerId, from, to, promotion)
      if (result.success && result.state) {
        // Update cache and broadcast to all SSE clients
        await onMutationSuccess(result.state)
        logger.info('Move made', { from, to, promotion })
      }
      return secureJsonResponse({ success: result.success, error: result.error }, result.success ? 200 : 400, headers)
    }

    case 'reset': {
      if (!validateAdminPassword(body.pass)) {
        logger.warn('Unauthorized reset attempt', { clientId })
        return secureJsonResponse({ error: 'Unauthorized' }, 401, headers)
      }

      const adminLimit = await checkRateLimit(clientId, 'admin')
      if (!adminLimit.success) {
        return secureJsonResponse({ error: 'Too many admin actions' }, 429, headers)
      }

      const result = await gameStore.resetGame()
      if (result.success && result.state) {
        await onMutationSuccess(result.state)
        logger.info('Game reset by admin')
      }
      return secureJsonResponse({ success: true }, 200, headers)
    }

    case 'clearAll': {
      if (!validateAdminPassword(body.pass)) {
        logger.warn('Unauthorized clearAll attempt', { clientId })
        return secureJsonResponse({ error: 'Unauthorized' }, 401, headers)
      }

      const adminLimit = await checkRateLimit(clientId, 'admin')
      if (!adminLimit.success) {
        return secureJsonResponse({ error: 'Too many admin actions' }, 429, headers)
      }

      const result = await gameStore.clearAllQueues()
      if (result.success && result.state) {
        await onMutationSuccess(result.state)
        logger.info('All queues cleared by admin')
      }
      return secureJsonResponse({ success: true, message: 'All queues cleared and game reset' }, 200, headers)
    }

    case 'kickPlayer': {
      if (!validateAdminPassword(body.pass)) {
        logger.warn('Unauthorized kickPlayer attempt', { clientId })
        return secureJsonResponse({ error: 'Unauthorized' }, 401, headers)
      }

      const adminLimit = await checkRateLimit(clientId, 'admin')
      if (!adminLimit.success) {
        return secureJsonResponse({ error: 'Too many admin actions' }, 429, headers)
      }

      const name = sanitizePlayerName(body.name)
      if (!name) {
        return secureJsonResponse({ error: 'Invalid player name' }, 400, headers)
      }
      const result = await gameStore.kickPlayerByName(name)
      if (result.found && result.state) {
        await onMutationSuccess(result.state)
        logger.info('Player kicked', { playerName: name })
      }
      return secureJsonResponse(
        { success: result.found, message: result.found ? `Player ${name} removed` : `Player ${name} not found` },
        200,
        headers
      )
    }

    case 'confirmReady': {
      const playerId = validatePlayerId(body.playerId)
      if (!playerId) {
        return secureJsonResponse({ error: 'Invalid player ID' }, 400, headers)
      }
      const result = await gameStore.confirmReady(playerId)
      if (result.success && result.state) {
        // Update cache and broadcast to all SSE clients
        await onMutationSuccess(result.state)
      }
      return secureJsonResponse({ success: result.success, error: result.error }, result.success ? 200 : 400, headers)
    }

    default:
      return secureJsonResponse({ error: 'Unknown action' }, 400, headers)
  }
}
