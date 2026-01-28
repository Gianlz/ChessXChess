import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getRateLimitHeaders, RateLimitType } from './ratelimit'
import { logger } from './logger'

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

// Create rate limited response
export function rateLimitedResponse(reset: number, clientId?: string): NextResponse {
  if (clientId) {
    logger.warn('Rate limit exceeded', { clientId })
  }
  return NextResponse.json(
    { error: 'Too many requests. Please slow down.', retryAfter: reset },
    { 
      status: 429,
      headers: {
        'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
      }
    }
  )
}

// Middleware-like function to check rate limit
export async function withRateLimit(
  request: NextRequest,
  type: RateLimitType = 'general'
): Promise<{ allowed: boolean; response?: NextResponse; headers: Record<string, string> }> {
  const identifier = getClientIdentifier(request)
  const result = await checkRateLimit(identifier, type)
  const headers = getRateLimitHeaders(result)
  
  if (!result.success) {
    return {
      allowed: false,
      response: rateLimitedResponse(result.reset),
      headers,
    }
  }
  
  return { allowed: true, headers }
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
  
  // Add extra headers (like rate limit headers)
  for (const [key, value] of Object.entries(extraHeaders)) {
    response.headers.set(key, value)
  }
  
  return response
}
