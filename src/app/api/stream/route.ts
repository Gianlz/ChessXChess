import { NextRequest } from 'next/server'
import { gameStore } from '@/lib/gameStore'
import { isRedisAvailable } from '@/lib/redis'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60 // Vercel serverless function timeout

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder()
  let lastVersion = -1
  let isActive = true

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: object) => {
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
      } catch (err) {
        console.error('Stream initial state error:', err)
        sendEvent({ error: 'Failed to get initial state' })
      }

      // Poll for updates every 500ms
      const pollInterval = setInterval(async () => {
        if (!isActive) {
          clearInterval(pollInterval)
          return
        }

        try {
          const currentVersion = await gameStore.getVersion()
          
          if (currentVersion !== lastVersion) {
            lastVersion = currentVersion
            
            const [gameState, queueState] = await Promise.all([
              gameStore.getGameState(),
              gameStore.getQueueState(),
            ])
            
            sendEvent({ game: gameState, queue: queueState })
          }
        } catch (err) {
          console.error('Stream poll error:', err)
        }
      }, 500)

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
        clearInterval(pollInterval)
        clearInterval(heartbeatInterval)
      })

      // Clean up before Vercel timeout
      setTimeout(() => {
        isActive = false
        clearInterval(pollInterval)
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
    },
  })
}
