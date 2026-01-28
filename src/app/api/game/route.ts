import { NextRequest, NextResponse } from 'next/server'
import { gameStore } from '@/lib/gameStore'
import { Square } from 'chess.js'
import { isRedisAvailable } from '@/lib/redis'

export async function GET() {
  try {
    const [gameState, queueState] = await Promise.all([
      gameStore.getGameState(),
      gameStore.getQueueState(),
    ])
    
    return NextResponse.json({
      game: gameState,
      queue: queueState,
    })
  } catch (err) {
    console.error('GET /api/game error:', err)
    return NextResponse.json(
      { error: 'Failed to get game state', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, playerId, playerName, color, from, to, promotion, pass } = body
    const adminPass = '1234'

    console.log(`POST /api/game action=${action} redisAvailable=${isRedisAvailable()}`)

    switch (action) {
      case 'join': {
        if (!playerId || !playerName || !color) {
          return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }
        
        console.log(`[API] Join request: ${playerName} (${playerId}) -> ${color}`)
        console.log(`[API] Redis available: ${isRedisAvailable()}`)
        
        if (!isRedisAvailable()) {
          console.error('[API] Redis not available for join action')
          return NextResponse.json(
            { error: 'Game server not configured. Redis is required for multiplayer.', redisAvailable: false },
            { status: 503 }
          )
        }
        
        try {
          const success = await gameStore.joinQueue(
            { id: playerId, name: playerName, joinedAt: Date.now() },
            color
          )
          console.log(`[API] Join result: ${success}`)
          return NextResponse.json({ success })
        } catch (err) {
          console.error('[API] Join error:', err)
          return NextResponse.json(
            { success: false, error: err instanceof Error ? err.message : 'Failed to join queue' },
            { status: 500 }
          )
        }
      }

      case 'leave': {
        if (!playerId) {
          return NextResponse.json({ error: 'Missing playerId' }, { status: 400 })
        }
        await gameStore.leaveQueue(playerId)
        return NextResponse.json({ success: true })
      }

      case 'move': {
        if (!playerId || !from || !to) {
          return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }
        const result = await gameStore.makeMove(playerId, from as Square, to as Square, promotion)
        return NextResponse.json(result)
      }

      case 'reset': {
        await gameStore.resetGame()
        return NextResponse.json({ success: true })
      }

      case 'clearAll': {
        if (pass !== adminPass) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        await gameStore.clearAllQueues()
        return NextResponse.json({ success: true, message: 'All queues cleared and game reset' })
      }

      case 'kickPlayer': {
        const { name } = body
        if (!name) {
          return NextResponse.json({ error: 'Missing player name' }, { status: 400 })
        }
        const found = await gameStore.kickPlayerByName(name)
        return NextResponse.json({ success: found, message: found ? `Player ${name} removed` : `Player ${name} not found` })
      }

      case 'validMoves': {
        if (!from) {
          return NextResponse.json({ error: 'Missing square' }, { status: 400 })
        }
        const moves = await gameStore.getValidMoves(from as Square)
        return NextResponse.json({ moves })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (err) {
    console.error('POST /api/game error:', err)
    return NextResponse.json(
      { error: 'Server error', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
