import { NextResponse } from 'next/server'

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
  
  // Add extra headers
  for (const [key, value] of Object.entries(extraHeaders)) {
    response.headers.set(key, value)
  }
  
  return response
}
