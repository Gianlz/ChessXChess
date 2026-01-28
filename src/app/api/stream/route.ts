import { gameStore } from '@/lib/gameStore'

export const dynamic = 'force-dynamic'

export async function GET() {
  const encoder = new TextEncoder()
  let isClosed = false
  let unsubscribe: (() => void) | null = null
  let heartbeat: NodeJS.Timeout | null = null

  const stream = new ReadableStream({
    start(controller) {
      const sendUpdate = () => {
        if (isClosed) return
        try {
          const gameState = gameStore.getGameState()
          const queueState = gameStore.getQueueState()
          const data = JSON.stringify({ game: gameState, queue: queueState })
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        } catch {
          // Stream was closed, clean up
          cleanup()
        }
      }

      const cleanup = () => {
        isClosed = true
        if (unsubscribe) {
          unsubscribe()
          unsubscribe = null
        }
        if (heartbeat) {
          clearInterval(heartbeat)
          heartbeat = null
        }
      }

      // Send initial state
      sendUpdate()

      // Subscribe to updates
      unsubscribe = gameStore.subscribe(sendUpdate)

      // Keep connection alive with heartbeat
      heartbeat = setInterval(() => {
        if (isClosed) {
          cleanup()
          return
        }
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch {
          cleanup()
        }
      }, 30000)
    },
    cancel() {
      isClosed = true
      if (unsubscribe) {
        unsubscribe()
        unsubscribe = null
      }
      if (heartbeat) {
        clearInterval(heartbeat)
        heartbeat = null
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
