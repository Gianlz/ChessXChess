import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getRateLimitHeaders, type RateLimitResult, type RateLimitType } from './ratelimit'
import { logger } from './logger'

export const PLAYER_ID_HEADER = 'x-player-id'
export const ADMIN_PASSWORD_HEADER = 'x-admin-password'

// Get client identifier for rate limiting
export function getClientIdentifier(request: NextRequest): string {
  // Try to get real IP from various headers
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const cfConnectingIp = request.headers.get('cf-connecting-ip')

  // Use the first available IP
  const ip = cfConnectingIp || realIp || forwardedFor?.split(',')[0]?.trim() || 'anonymous'

  return ip
}

export function isCrossSiteRequest(request: NextRequest): boolean {
  const secFetchSite = request.headers.get('sec-fetch-site')
  if (secFetchSite === 'cross-site') return true

  const origin = request.headers.get('origin')
  if (!origin) return false

  const requestOrigin = new URL(request.url).origin
  return origin !== requestOrigin
}

// Security headers to add to all responses
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

// Add security headers to response
export function addSecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value)
  }
  return response
}

// Create secure JSON response with all headers
export function secureJsonResponse(
  data: unknown,
  status: number = 200,
  extraHeaders: Record<string, string> = {}
): NextResponse {
  const response = NextResponse.json(data, { status })
  
  // Add security headers
  addSecurityHeaders(response)

  // Avoid caching API responses by default
  response.headers.set('Cache-Control', 'no-store')
  
  // Add extra headers
  for (const [key, value] of Object.entries(extraHeaders)) {
    response.headers.set(key, value)
  }
  
  return response
}

export function rateLimitedResponse(result: RateLimitResult, clientId?: string): NextResponse {
  if (clientId) {
    logger.warn('Rate limit exceeded', { clientId })
  }

  const headers: Record<string, string> = {
    ...getRateLimitHeaders(result),
    'Retry-After': Math.ceil((result.reset - Date.now()) / 1000).toString(),
  }

  return secureJsonResponse({ error: 'Too many requests. Please slow down.' }, 429, headers)
}

// Middleware-like function to check rate limit
export async function withRateLimit(
  request: NextRequest,
  type: RateLimitType = 'general'
): Promise<{ allowed: boolean; response?: NextResponse; headers: Record<string, string>; clientId: string }> {
  const clientId = getClientIdentifier(request)
  const result = await checkRateLimit(clientId, type)
  const headers = getRateLimitHeaders(result)

  if (!result.success) {
    return {
      allowed: false,
      response: rateLimitedResponse(result, clientId),
      headers,
      clientId,
    }
  }

  return { allowed: true, headers, clientId }
}
