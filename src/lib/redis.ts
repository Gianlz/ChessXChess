import { Redis } from '@upstash/redis'

// Create Redis client - will throw if env vars are missing in production
function createRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    console.warn('⚠️ Upstash Redis not configured. Game state will not persist across serverless instances.')
    return null
  }

  return new Redis({ url, token })
}

export const redis = createRedisClient()

// Redis keys
export const REDIS_KEYS = {
  GAME_STATE: 'chess:game',
  WHITE_QUEUE: 'chess:queue:white',
  BLACK_QUEUE: 'chess:queue:black',
  CURRENT_WHITE: 'chess:current:white',
  CURRENT_BLACK: 'chess:current:black',
  VERSION: 'chess:version',
} as const
