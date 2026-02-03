import { NextRequest } from 'next/server'
import { createHash } from 'crypto'
import type { Player, QueueState } from '@/lib/gameStore'
import { PLAYER_ID_HEADER, getClientIdentifier, rateLimitedResponse } from '@/lib/security'
import { checkRateLimit } from '@/lib/ratelimit'
import { validatePlayerId } from '@/lib/validation'
import { logger } from '@/lib/logger'
import {
  registerSSEClient,
  unregisterSSEClient,
  getCachedGameState,
  getCachedQueueState,
  getCachedVersion,
} from '@/lib/stateManager'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// Event-driven SSE endpoint
// - Sends initial state from cache (no Redis read after hydration)
// - Receives broadcasts when mutations happen
// - No polling - purely event-driven

export async function GET(request: NextRequest) {
  const clientId = getClientIdentifier(request)
  const rateLimitResult = await checkRateLimit(clientId, 'general')

  if (!rateLimitResult.success) {
    logger.warn('Stream rate limited', { clientId })
    return rateLimitedResponse(rateLimitResult, clientId)
  }

  const viewerPlayerId = validatePlayerId(request.headers.get(PLAYER_ID_HEADER))

  const toPublicPlayerId = (playerId: string): string => {
    const digest = createHash('sha256').update(playerId).digest('base64url').slice(0, 16)
    return `anon_${digest}`
  }

  const toPublicPlayer = (player: Player): Player => {
    if (viewerPlayerId && player.id === viewerPlayerId) return { ...player }
    return { ...player, id: toPublicPlayerId(player.id) }
  }

  const toPublicQueueState = (queue: QueueState): QueueState => {
    return {
      whiteQueue: queue.whiteQueue.map(toPublicPlayer),
      blackQueue: queue.blackQueue.map(toPublicPlayer),
      currentWhitePlayer: queue.currentWhitePlayer ? toPublicPlayer(queue.currentWhitePlayer) : null,
      currentBlackPlayer: queue.currentBlackPlayer ? toPublicPlayer(queue.currentBlackPlayer) : null,
      whiteTurnState: queue.whiteTurnState,
      blackTurnState: queue.blackTurnState,
    }
  }

  let sseClientId: string | null = null
  let isActive = true

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      const sendEvent = (data: object) => {
        if (!isActive) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          isActive = false
        }
      }

      // Register this client for broadcasts
      sseClientId = registerSSEClient(controller)

      // Send initial state from cache (NO Redis call - uses in-memory cache)
      try {
        const [game, queue, version] = await Promise.all([
          getCachedGameState(),
          getCachedQueueState(),
          getCachedVersion(),
        ])
        sendEvent({ game, queue: toPublicQueueState(queue), version })
        logger.debug('Stream: sent initial state from cache', { clientId: sseClientId, version })
      } catch (err) {
        logger.error('Stream: failed to get cached state', { error: String(err) })
        sendEvent({ error: 'Failed to fetch initial state' })
      }

      // Heartbeat to keep connection alive (no state fetching)
      const heartbeatInterval = setInterval(() => {
        if (!isActive) {
          clearInterval(heartbeatInterval)
          return
        }
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch {
          isActive = false
        }
      }, 30000)

      // Cleanup on abort
      request.signal.addEventListener('abort', () => {
        isActive = false
        clearInterval(heartbeatInterval)
        if (sseClientId) {
          unregisterSSEClient(sseClientId)
        }
      })

      // Clean up before Vercel timeout (55s to be safe)
      setTimeout(() => {
        isActive = false
        clearInterval(heartbeatInterval)
        if (sseClientId) {
          unregisterSSEClient(sseClientId)
        }
        try {
          controller.close()
        } catch {
          // Already closed
        }
      }, 55000)
    },
    cancel() {
      isActive = false
      if (sseClientId) {
        unregisterSSEClient(sseClientId)
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    },
  })
}
