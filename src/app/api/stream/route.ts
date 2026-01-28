import { gameStore } from '@/lib/gameStore'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Vercel serverless function timeout

export async function GET() {
  const encoder = new TextEncoder()
  let isClosed = false
  let lastVersion = -1

  const stream = new ReadableStream({
    async start(controller) {
      const sendUpdate = async () => {
        if (isClosed) return
        
        try {
          const [gameState, queueState] = await Promise.all([
            gameStore.getGameState(),
            gameStore.getQueueState(),
          ])
          const data = JSON.stringify({ game: gameState, queue: queueState })
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        } catch (err) {
          console.error('Error sending update:', err)
        }
      }

      const checkForUpdates = async () => {
        if (isClosed) return
        
        try {
          const currentVersion = await gameStore.getVersion()
          if (currentVersion !== lastVersion) {
            lastVersion = currentVersion
            await sendUpdate()
          }
        } catch (err) {
          console.error('Error checking for updates:', err)
        }
      }

      // Send initial state immediately
      await sendUpdate()
      lastVersion = await gameStore.getVersion()

      // Poll for changes every 500ms
      const pollInterval = setInterval(async () => {
        if (isClosed) {
          clearInterval(pollInterval)
          return
        }
        await checkForUpdates()
      }, 500)

      // Heartbeat every 30 seconds to keep connection alive
      const heartbeatInterval = setInterval(() => {
        if (isClosed) {
          clearInterval(heartbeatInterval)
          return
        }
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch {
          isClosed = true
          clearInterval(pollInterval)
          clearInterval(heartbeatInterval)
        }
      }, 30000)

      // Clean up after max duration (slightly before Vercel timeout)
      setTimeout(() => {
        isClosed = true
        clearInterval(pollInterval)
        clearInterval(heartbeatInterval)
        try {
          controller.close()
        } catch {
          // Already closed
        }
      }, 55000) // Close before 60s timeout
    },
    cancel() {
      isClosed = true
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
