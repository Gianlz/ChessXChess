import 'server-only'

import { getRedis } from './redis'
import { logger } from './logger'

const RANKING_KEY = 'chess:ranking'
const PLAYER_INFO_PREFIX = 'chess:player:'
const POINTS_PER_WIN = 10

export interface RankingEntry {
  visitorId: string
  displayName: string
  points: number
  wins: number
  tier?: 'bronze' | 'silver' | 'gold'
}

export interface PlayerInfo {
  displayName: string
  wins: number
  tier?: 'bronze' | 'silver' | 'gold'
}

export async function getPlayerInfo(visitorId: string): Promise<PlayerInfo | null> {
  const redis = getRedis()
  if (!redis) return null
  
  try {
    return await redis.get<PlayerInfo>(`${PLAYER_INFO_PREFIX}${visitorId}`)
  } catch (err) {
    logger.error('Ranking: Failed to get player info', { error: String(err) })
    return null
  }
}

export async function setPlayerInfo(visitorId: string, info: PlayerInfo): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return false
  
  try {
    await redis.set(`${PLAYER_INFO_PREFIX}${visitorId}`, info)
    return true
  } catch (err) {
    logger.error('Ranking: Failed to set player info', { error: String(err) })
    return false
  }
}

export async function awardWinPoints(
  visitorId: string,
  displayName: string,
  tier?: 'bronze' | 'silver' | 'gold'
): Promise<number> {
  const redis = getRedis()
  if (!redis) return 0
  
  try {
    // Increment score in sorted set
    const newScore = await redis.zincrby(RANKING_KEY, POINTS_PER_WIN, visitorId)
    
    // Update player info
    let info = await getPlayerInfo(visitorId)
    if (info) {
      info.wins += 1
      info.displayName = displayName
      if (tier) info.tier = tier
    } else {
      info = {
        displayName,
        wins: 1,
        tier,
      }
    }
    await setPlayerInfo(visitorId, info)
    
    logger.info('Ranking: Points awarded', { visitorId, points: POINTS_PER_WIN, total: newScore })
    return newScore
  } catch (err) {
    logger.error('Ranking: Failed to award points', { error: String(err) })
    return 0
  }
}

export async function getPlayerRank(visitorId: string): Promise<{ rank: number; points: number } | null> {
  const redis = getRedis()
  if (!redis) return null
  
  try {
    // Get rank (0-indexed, highest score first)
    const rank = await redis.zrevrank(RANKING_KEY, visitorId)
    if (rank === null) return null
    
    const points = await redis.zscore(RANKING_KEY, visitorId)
    return {
      rank: rank + 1, // 1-indexed
      points: points || 0,
    }
  } catch (err) {
    logger.error('Ranking: Failed to get player rank', { error: String(err) })
    return null
  }
}

export async function getLeaderboard(limit: number = 10): Promise<RankingEntry[]> {
  const redis = getRedis()
  if (!redis) return []
  
  try {
    // Get top players by score (descending)
    const results = await redis.zrange(RANKING_KEY, 0, limit - 1, {
      rev: true,
      withScores: true,
    })
    
    const entries: RankingEntry[] = []
    
    for (let i = 0; i < results.length; i += 2) {
      const visitorId = results[i] as string
      const points = results[i + 1] as number
      
      const info = await getPlayerInfo(visitorId)
      entries.push({
        visitorId,
        displayName: info?.displayName || 'Anonymous',
        points,
        wins: info?.wins || 0,
        tier: info?.tier,
      })
    }
    
    return entries
  } catch (err) {
    logger.error('Ranking: Failed to get leaderboard', { error: String(err) })
    return []
  }
}

export async function getPlayerPoints(visitorId: string): Promise<number> {
  const redis = getRedis()
  if (!redis) return 0
  
  try {
    const points = await redis.zscore(RANKING_KEY, visitorId)
    return points || 0
  } catch (err) {
    logger.error('Ranking: Failed to get player points', { error: String(err) })
    return 0
  }
}
