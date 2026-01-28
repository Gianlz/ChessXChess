import { NextRequest } from 'next/server'
import { gameStore } from '@/lib/gameStore'
import { isRedisAvailable } from '@/lib/redis'
import { withRateLimit, secureJsonResponse, getClientIdentifier } from '@/lib/security'
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

export async function GET(request: NextRequest) {
  // Rate limit check
  const rateLimitResult = await withRateLimit(request, 'general')
  if (!rateLimitResult.allowed) {
    return rateLimitResult.response!
  }

  try {
    const [gameState, queueState] = await Promise.all([
      gameStore.getGameState(),
      gameStore.getQueueState(),
    ])
    
    return secureJsonResponse(
      { game: gameState, queue: queueState },
      200,
      rateLimitResult.headers
    )
  } catch {
    return secureJsonResponse(
      { error: 'Failed to get game state' },
      500,
      rateLimitResult.headers
    )
  }
}

export async function POST(request: NextRequest) {
  const clientId = getClientIdentifier(request)

  // General rate limit for all POST requests
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
    return secureJsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const action = validateAction(body.action)
  if (!action) {
    return secureJsonResponse({ error: 'Invalid or missing action' }, 400)
  }

  const headers = getRateLimitHeaders(generalLimit)

  switch (action) {
    case 'join': {
      // Stricter rate limit for joins
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
        const success = await gameStore.joinQueue(
          { id: playerId, name: playerName, joinedAt: Date.now() },
          color
        )
        return secureJsonResponse({ success }, 200, headers)
      } catch {
        return secureJsonResponse(
          { success: false, error: 'Failed to join queue' },
          500,
          headers
        )
      }
    }

    case 'leave': {
      const playerId = validatePlayerId(body.playerId)
      if (!playerId) {
        return secureJsonResponse({ error: 'Invalid player ID' }, 400, headers)
      }
      await gameStore.leaveQueue(playerId)
      return secureJsonResponse({ success: true }, 200, headers)
    }

    case 'move': {
      // Stricter rate limit for moves
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
      return secureJsonResponse(result, result.success ? 200 : 400, headers)
    }

    case 'reset': {
      // Admin action requires password
      if (!validateAdminPassword(body.pass)) {
        return secureJsonResponse({ error: 'Unauthorized' }, 401, headers)
      }

      const adminLimit = await checkRateLimit(clientId, 'admin')
      if (!adminLimit.success) {
        return secureJsonResponse({ error: 'Too many admin actions' }, 429, headers)
      }

      await gameStore.resetGame()
      return secureJsonResponse({ success: true }, 200, headers)
    }

    case 'clearAll': {
      // Admin action requires password
      if (!validateAdminPassword(body.pass)) {
        return secureJsonResponse({ error: 'Unauthorized' }, 401, headers)
      }

      const adminLimit = await checkRateLimit(clientId, 'admin')
      if (!adminLimit.success) {
        return secureJsonResponse({ error: 'Too many admin actions' }, 429, headers)
      }

      await gameStore.clearAllQueues()
      return secureJsonResponse({ success: true, message: 'All queues cleared and game reset' }, 200, headers)
    }

    case 'kickPlayer': {
      // Admin action requires password
      if (!validateAdminPassword(body.pass)) {
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
      const found = await gameStore.kickPlayerByName(name)
      return secureJsonResponse(
        { success: found, message: found ? `Player ${name} removed` : `Player ${name} not found` },
        200,
        headers
      )
    }

    case 'validMoves': {
      const from = validateSquare(body.from)
      if (!from) {
        return secureJsonResponse({ error: 'Invalid square' }, 400, headers)
      }
      const moves = await gameStore.getValidMoves(from)
      return secureJsonResponse({ moves }, 200, headers)
    }

    case 'confirmReady': {
      const playerId = validatePlayerId(body.playerId)
      if (!playerId) {
        return secureJsonResponse({ error: 'Invalid player ID' }, 400, headers)
      }
      const result = await gameStore.confirmReady(playerId)
      return secureJsonResponse(result, result.success ? 200 : 400, headers)
    }

    default:
      return secureJsonResponse({ error: 'Unknown action' }, 400, headers)
  }
}
