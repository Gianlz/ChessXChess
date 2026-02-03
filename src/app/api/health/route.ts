import { NextRequest } from 'next/server'
import { isRedisAvailable, pingRedis } from '@/lib/redis'
import { ADMIN_PASSWORD_HEADER, secureJsonResponse, withRateLimit } from '@/lib/security'
import { validateAdminPassword } from '@/lib/validation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)

  const rateLimitResult = await withRateLimit(request, 'health')
  if (!rateLimitResult.allowed) {
    return rateLimitResult.response!
  }

  const legacyPass = url.searchParams.get('pass')
  if (legacyPass && process.env.NODE_ENV === 'production') {
    return secureJsonResponse(
      { error: `Do not use ?pass=. Send the admin password via the ${ADMIN_PASSWORD_HEADER} header instead.` },
      400,
      rateLimitResult.headers
    )
  }

  const headerPass = request.headers.get(ADMIN_PASSWORD_HEADER)
  const bearerPass = request.headers.get('authorization')?.replace(/^Bearer\\s+/i, '')
  const pass = headerPass || bearerPass || legacyPass
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
    return secureJsonResponse(basicHealth, 200, rateLimitResult.headers)
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

  return secureJsonResponse(detailedHealth, 200, rateLimitResult.headers)
}
