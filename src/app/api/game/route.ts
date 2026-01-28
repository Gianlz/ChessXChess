import { NextRequest, NextResponse } from 'next/server'
import { gameStore } from '@/lib/gameStore'
import { Square } from 'chess.js'

export async function GET() {
  const [gameState, queueState] = await Promise.all([
    gameStore.getGameState(),
    gameStore.getQueueState(),
  ])
  
  return NextResponse.json({
    game: gameState,
    queue: queueState,
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { action, playerId, playerName, color, from, to, promotion } = body

  switch (action) {
    case 'join': {
      if (!playerId || !playerName || !color) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
      }
      const success = await gameStore.joinQueue(
        { id: playerId, name: playerName, joinedAt: Date.now() },
        color
      )
      return NextResponse.json({ success })
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
}
