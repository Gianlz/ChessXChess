import { NextRequest } from 'next/server'
import { gameStore } from '@/lib/gameStore'
import { getClientIdentifier } from '@/lib/security'
import { checkRateLimit } from '@/lib/ratelimit'
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
    return new Response(
      JSON.stringify({ error: 'Too many connections. Please wait.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': Math.ceil((rateLimitResult.reset - Date.now()) / 1000).toString(),
        },
      }
    )
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
        sendEvent({ game, queue })
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
