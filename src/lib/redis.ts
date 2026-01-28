import { Redis } from '@upstash/redis'
import { logger } from './logger'

// Lazy singleton - created on first use
let redisClient: Redis | null | undefined = undefined

// Get Redis client lazily
export function getRedis(): Redis | null {
  // Only initialize once
  if (redisClient === undefined) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN

    if (!url || !token) {
      logger.debug('Redis: Missing environment variables')
      redisClient = null
    } else {
      try {
        redisClient = new Redis({ url, token })
        logger.debug('Redis: Client created successfully')
      } catch (err) {
        logger.error('Redis: Failed to create client', { error: String(err) })
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

// Actually ping Redis to verify connection
export async function pingRedis(): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return false
  
  try {
    const result = await redis.ping()
    return result === 'PONG'
  } catch (err) {
    logger.error('Redis: Ping failed', { error: String(err) })
    return false
  }
}

// Single consolidated state key
export const REDIS_KEY = 'chess:state'
