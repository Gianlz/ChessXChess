import { Redis } from '@upstash/redis'

// Lazy singleton - created on first use
let redisClient: Redis | null | undefined = undefined
let initAttempts = 0

// Get Redis client lazily
export function getRedis(): Redis | null {
  // Only initialize once
  if (redisClient === undefined) {
    initAttempts++
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN

    console.log(`[Redis] Init attempt #${initAttempts}`)
    console.log(`[Redis] URL: ${url ? url.substring(0, 30) + '...' : 'MISSING'}`)
    console.log(`[Redis] Token: ${token ? 'present (' + token.length + ' chars)' : 'MISSING'}`)

    if (!url || !token) {
      console.error('[Redis] ❌ Missing environment variables!')
      redisClient = null
    } else {
      try {
        redisClient = new Redis({ url, token })
        console.log('[Redis] ✅ Client created successfully')
      } catch (err) {
        console.error('[Redis] ❌ Failed to create client:', err)
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
