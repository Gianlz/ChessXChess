import { NextRequest } from 'next/server'
import { gameStore } from '@/lib/gameStore'
import { getClientIdentifier } from '@/lib/security'
import { checkRateLimit } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  // Rate limit check for stream connections
  const clientId = getClientIdentifier(request)
  const rateLimitResult = await checkRateLimit(clientId, 'general')
  
  if (!rateLimitResult.success) {
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
  let lastVersion = -1
  let isActive = true
  let pollTimeout: NodeJS.Timeout | null = null

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

      // Send initial state immediately
      try {
        const [gameState, queueState, version] = await Promise.all([
          gameStore.getGameState(),
          gameStore.getQueueState(),
          gameStore.getVersion(),
        ])
        lastVersion = version
        sendEvent({ game: gameState, queue: queueState })
      } catch {
        sendEvent({ error: 'Failed to get initial state' })
      }

      // Adaptive poll: start fast, back off when idle
      let pollDelayMs = 200  // Start faster for better responsiveness
      let idleStreak = 0
      const maxPollDelayMs = 2000  // Max 2 seconds when idle
      const idleThreshold = 5

      const schedulePoll = () => {
        if (!isActive) return
        
        pollTimeout = setTimeout(async () => {
          if (!isActive) return

          try {
            // Check and expire any timed-out turns
            await gameStore.checkAndExpireTurns()
            
            const currentVersion = await gameStore.getVersion()

            if (currentVersion !== lastVersion) {
              lastVersion = currentVersion
              idleStreak = 0
              pollDelayMs = 500

              const [gameState, queueState] = await Promise.all([
                gameStore.getGameState(),
                gameStore.getQueueState(),
              ])

              sendEvent({ game: gameState, queue: queueState })
            } else {
              idleStreak += 1
              if (idleStreak >= idleThreshold) {
                pollDelayMs = Math.min(maxPollDelayMs, pollDelayMs * 2)
                idleStreak = 0
              }
            }
          } catch {
            // Silent fail - don't spam errors
          } finally {
            schedulePoll()
          }
        }, pollDelayMs)
      }

      schedulePoll()

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

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        isActive = false
        if (pollTimeout) clearTimeout(pollTimeout)
        clearInterval(heartbeatInterval)
      })

      // Clean up before Vercel timeout
      setTimeout(() => {
        isActive = false
        if (pollTimeout) clearTimeout(pollTimeout)
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
