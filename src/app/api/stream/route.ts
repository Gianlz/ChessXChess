import { NextRequest } from 'next/server'
import { getSnapshot, subscribeToSnapshot } from '@/lib/gameSnapshot'
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
  let isActive = true
  let unsubscribe: (() => void) | null = null

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

      // Send initial state immediately if available (no Redis read here)
      const snapshot = getSnapshot()
      if (snapshot) {
        sendEvent({ game: snapshot.game, queue: snapshot.queue })
      }

      unsubscribe = subscribeToSnapshot((nextSnapshot) => {
        if (!isActive) return
        sendEvent({ game: nextSnapshot.game, queue: nextSnapshot.queue })
      })

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
        if (unsubscribe) unsubscribe()
        clearInterval(heartbeatInterval)
      })

      // Clean up before Vercel timeout
      setTimeout(() => {
        isActive = false
        if (unsubscribe) unsubscribe()
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
      if (unsubscribe) unsubscribe()
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
