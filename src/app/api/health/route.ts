import { NextResponse } from 'next/server'
import { getRedis, isRedisAvailable, REDIS_KEYS } from '@/lib/redis'

export const dynamic = 'force-dynamic'

export async function GET() {
  const redis = getRedis()
  const available = isRedisAvailable()
  
  const result: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    redisAvailable: available,
    envVars: {
      urlPresent: !!process.env.UPSTASH_REDIS_REST_URL,
      tokenPresent: !!process.env.UPSTASH_REDIS_REST_TOKEN,
    },
  }

  if (redis) {
    try {
      // Test write
      const testKey = 'chess:health:test'
      const testValue = `health-check-${Date.now()}`
      await redis.set(testKey, testValue)
      
      // Test read
      const readValue = await redis.get(testKey)
      
      // Clean up
      await redis.del(testKey)
      
      result.writeTest = 'success'
      result.readTest = readValue === testValue ? 'success' : 'mismatch'
      result.testValue = { written: testValue, read: readValue }
      
      // Get current game state keys
      const [version, whiteQueue, blackQueue, currentWhite, currentBlack] = await Promise.all([
        redis.get(REDIS_KEYS.VERSION),
        redis.get(REDIS_KEYS.WHITE_QUEUE),
        redis.get(REDIS_KEYS.BLACK_QUEUE),
        redis.get(REDIS_KEYS.CURRENT_WHITE),
        redis.get(REDIS_KEYS.CURRENT_BLACK),
      ])
      
      result.gameState = {
        version,
        whiteQueue,
        blackQueue,
        currentWhite,
        currentBlack,
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : 'Unknown error'
      result.errorStack = err instanceof Error ? err.stack : undefined
    }
  }

  return NextResponse.json(result)
}
