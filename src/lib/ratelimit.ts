import 'server-only'

import { Ratelimit } from '@upstash/ratelimit'
import { getRedis } from './redis'
import { logger } from './logger'

// Create rate limiters for different actions
let generalLimiter: Ratelimit | null = null
let joinLimiter: Ratelimit | null = null
let moveLimiter: Ratelimit | null = null
let adminLimiter: Ratelimit | null = null
let healthLimiter: Ratelimit | null = null

function createLimiters() {
  const redis = getRedis()
  if (!redis) return

  // General API rate limit: 60 requests per minute
  generalLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, '1 m'),
    prefix: 'ratelimit:general',
    analytics: false,
  })

  // Join queue rate limit: 5 per minute (prevent queue spam)
  joinLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1 m'),
    prefix: 'ratelimit:join',
    analytics: false,
  })

  // Move rate limit: 30 per minute (reasonable for chess)
  moveLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, '1 m'),
    prefix: 'ratelimit:move',
    analytics: false,
  })

  // Admin actions: 10 per minute
  adminLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1 m'),
    prefix: 'ratelimit:admin',
    analytics: false,
  })

  // Health endpoint: 30 per minute
  healthLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, '1 m'),
    prefix: 'ratelimit:health',
    analytics: false,
  })
}

export type RateLimitType = 'general' | 'join' | 'move' | 'admin' | 'health'

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

export async function checkRateLimit(
  identifier: string,
  type: RateLimitType = 'general'
): Promise<RateLimitResult> {
  // Lazily create limiters
  if (!generalLimiter) {
    createLimiters()
  }

  let limiter: Ratelimit | null = null
  switch (type) {
    case 'join':
      limiter = joinLimiter
      break
    case 'move':
      limiter = moveLimiter
      break
    case 'admin':
      limiter = adminLimiter
      break
    case 'health':
      limiter = healthLimiter
      break
    default:
      limiter = generalLimiter
  }

  if (!limiter) {
    // Can't rate limit without Redis. In production we fail closed so we don't
    // accidentally ship with security protections disabled.
    if (process.env.NODE_ENV !== 'production') {
      return { success: true, limit: 0, remaining: 0, reset: Date.now() + 60000 }
    }

    logger.warn('Rate limiter unavailable (Redis not configured)', { type })
    return { success: false, limit: 0, remaining: 0, reset: Date.now() + 60000 }
  }

  try {
    const result = await limiter.limit(identifier)
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    }
  } catch (err) {
    // On rate limit error, fail closed in production
    logger.error('Rate limit check failed', { error: String(err), type })
    if (process.env.NODE_ENV !== 'production') {
      return { success: true, limit: 0, remaining: 0, reset: Date.now() + 60000 }
    }
    return { success: false, limit: 0, remaining: 0, reset: Date.now() + 60000 }
  }
}

export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  if (result.limit <= 0) return {}
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.reset.toString(),
  }
}
