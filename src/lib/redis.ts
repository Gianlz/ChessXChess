import { Redis } from '@upstash/redis'

// Lazy singleton - created on first use
let redisClient: Redis | null | undefined = undefined

// Get Redis client lazily
export function getRedis(): Redis | null {
  // Only initialize once
  if (redisClient === undefined) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN

    if (!url || !token) {
      console.warn('⚠️ Upstash Redis not configured. Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN')
      console.warn('URL present:', !!url, 'Token present:', !!token)
      redisClient = null
    } else {
      try {
        redisClient = new Redis({ url, token })
        console.log('✅ Upstash Redis client initialized')
      } catch (err) {
        console.error('❌ Failed to create Redis client:', err)
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
