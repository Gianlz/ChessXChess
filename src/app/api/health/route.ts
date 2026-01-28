import { NextRequest } from 'next/server'
import { isRedisAvailable } from '@/lib/redis'
import { secureJsonResponse } from '@/lib/security'
import { validateAdminPassword } from '@/lib/validation'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const pass = url.searchParams.get('pass')
  const isAdmin = pass ? validateAdminPassword(pass) : false

  // Basic health check - always available
  const basicHealth = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    redisAvailable: isRedisAvailable(),
  }

  // If not admin, return only basic health
  if (!isAdmin) {
    return secureJsonResponse(basicHealth)
  }

  // Admin gets more details (but still no sensitive data)
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
