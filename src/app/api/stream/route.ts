import { NextRequest } from 'next/server'
import { gameStore } from '@/lib/gameStore'
import { getClientIdentifier } from '@/lib/security'
import { checkRateLimit } from '@/lib/ratelimit'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// Polling interval in ms - balance between responsiveness and server load
const POLL_INTERVAL_MS = 2000

export async function GET(request: NextRequest) {
  // Rate limit check for stream connections
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
  let lastVersion = -1

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

      // Fetch and send initial state immediately from Redis
      try {
        const [game, queue, version] = await Promise.all([
          gameStore.getGameState(),
          gameStore.getQueueState(),
          gameStore.getVersion(),
        ])
        lastVersion = version
        sendEvent({ game, queue })
        logger.debug('Stream: sent initial state', { version })
      } catch (err) {
        logger.error('Stream: failed to fetch initial state', { error: String(err) })
        // Send empty state so client knows connection is working
        sendEvent({ error: 'Failed to fetch initial state' })
      }

      // Poll for updates - this is the serverless-compatible approach
      const pollInterval = setInterval(async () => {
        if (!isActive) {
          clearInterval(pollInterval)
          return
        }

        try {
          const currentVersion = await gameStore.getVersion()
          
          // Only fetch and send full state if version changed
          if (currentVersion !== lastVersion) {
            const [game, queue] = await Promise.all([
              gameStore.getGameState(),
              gameStore.getQueueState(),
            ])
            lastVersion = currentVersion
            sendEvent({ game, queue })
            logger.debug('Stream: sent update', { version: currentVersion })
          }
        } catch (err) {
          logger.error('Stream: poll error', { error: String(err) })
          // Don't kill the stream on transient errors
        }
      }, POLL_INTERVAL_MS)

      // Heartbeat every 30 seconds to keep connection alive
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

      // Cleanup on client disconnect
      request.signal.addEventListener('abort', () => {
        isActive = false
        clearInterval(pollInterval)
        clearInterval(heartbeatInterval)
        logger.debug('Stream: client disconnected')
      })

      // Clean up before Vercel timeout (60s max, close at 55s)
      setTimeout(() => {
        isActive = false
        clearInterval(pollInterval)
        clearInterval(heartbeatInterval)
        try {
          controller.close()
        } catch {
          // Already closed
        }
        logger.debug('Stream: timeout cleanup')
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
