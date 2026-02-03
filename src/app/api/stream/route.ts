import { NextRequest } from 'next/server'
import { createHash } from 'crypto'
import { gameStore } from '@/lib/gameStore'
import type { Player, QueueState } from '@/lib/gameStore'
import { PLAYER_ID_HEADER, getClientIdentifier, rateLimitedResponse } from '@/lib/security'
import { checkRateLimit } from '@/lib/ratelimit'
import { validatePlayerId } from '@/lib/validation'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// DEPRECATED: This SSE endpoint is kept for backward compatibility.
// The recommended approach is client-side polling of GET /api/game
// which achieves true event-only Redis operations.

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

  const encoder = new TextEncoder()
  let isActive = true

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: object) => {
        if (!isActive) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          isActive = false
        }
      }

      // Send initial state only - no polling
      // Clients should use GET /api/game for updates
      try {
        const [game, queue] = await Promise.all([
          gameStore.getGameState(),
          gameStore.getQueueState(),
        ])
        sendEvent({ game, queue: toPublicQueueState(queue) })
        logger.debug('Stream: sent initial state')
      } catch (err) {
        logger.error('Stream: failed to fetch initial state', { error: String(err) })
        sendEvent({ error: 'Failed to fetch initial state' })
      }

      // Heartbeat only - no polling for updates
      // This keeps the connection alive for clients still using SSE
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

      request.signal.addEventListener('abort', () => {
        isActive = false
        clearInterval(heartbeatInterval)
      })

      // Clean up before Vercel timeout
      setTimeout(() => {
        isActive = false
        clearInterval(heartbeatInterval)
        try {
          controller.close()
        } catch {
          // Already closed
        }
      }, 55000)
    },
    cancel() {
      isActive = false
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
