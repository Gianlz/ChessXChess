import { NextRequest, NextResponse } from 'next/server'
import { getLeaderboard, getPlayerRank, getPlayerPoints, getPlayerInfo } from '@/lib/ranking'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '10', 10)
  const visitorId = searchParams.get('visitorId')

  try {
    const leaderboard = await getLeaderboard(Math.min(limit, 50))
    
    let currentPlayer = null
    if (visitorId) {
      const rankInfo = await getPlayerRank(visitorId)
      const points = await getPlayerPoints(visitorId)
      const info = await getPlayerInfo(visitorId)
      
      if (rankInfo || points > 0) {
        currentPlayer = {
          visitorId,
          rank: rankInfo?.rank || null,
          points,
          displayName: info?.displayName || 'You',
          wins: info?.wins || 0,
          tier: info?.tier,
        }
      }
    }

    return NextResponse.json({
      success: true,
      leaderboard: leaderboard.map((entry, index) => ({
        ...entry,
        rank: index + 1,
        isCurrentPlayer: visitorId ? entry.visitorId === visitorId : false,
      })),
      currentPlayer,
    })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch leaderboard' },
      { status: 500 }
    )
  }
}
