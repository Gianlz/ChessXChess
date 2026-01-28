import { Redis } from '@upstash/redis'

// Lazy singleton - created on first use
let redisClient: Redis | null | undefined = undefined

// Debug logging - only in development
const isDev = process.env.NODE_ENV === 'development'
function debugLog(...args: unknown[]): void {
  if (isDev) {
    console.log('[Redis]', ...args)
  }
}

// Get Redis client lazily
export function getRedis(): Redis | null {
  // Only initialize once
  if (redisClient === undefined) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN

    if (!url || !token) {
      debugLog('Missing environment variables')
      redisClient = null
    } else {
      try {
        redisClient = new Redis({ url, token })
        debugLog('Client created successfully')
      } catch {
        redisClient = null
      }
    }
  }
  
  return redisClient
}

// Check if Redis is available
export function isRedisAvailable(): boolean {
  return getRedis() !== null
}

// Redis keys
export const REDIS_KEYS = {
  GAME_STATE: 'chess:game',
  WHITE_QUEUE: 'chess:queue:white',
  BLACK_QUEUE: 'chess:queue:black',
  CURRENT_WHITE: 'chess:current:white',
  CURRENT_BLACK: 'chess:current:black',
  VERSION: 'chess:version',
} as const
