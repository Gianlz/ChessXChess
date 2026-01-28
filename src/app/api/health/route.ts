import { NextRequest } from 'next/server'
import { isRedisAvailable, pingRedis } from '@/lib/redis'
import { secureJsonResponse } from '@/lib/security'
import { validateAdminPassword } from '@/lib/validation'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const pass = url.searchParams.get('pass')
  const isAdmin = pass ? validateAdminPassword(pass) : false

  // Actually test Redis connection
  const redisHealthy = await pingRedis()

  const basicHealth = {
    status: redisHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    redisAvailable: isRedisAvailable(),
    redisHealthy,
  }

  if (!isAdmin) {
    return secureJsonResponse(basicHealth)
  }

  const detailedHealth = {
    ...basicHealth,
    envVars: {
      redisConfigured: !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
      adminConfigured: !!(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 8),
    },
    version: process.env.npm_package_version || 'unknown',
    nodeEnv: process.env.NODE_ENV || 'unknown',
  }

  return secureJsonResponse(detailedHealth)
}
