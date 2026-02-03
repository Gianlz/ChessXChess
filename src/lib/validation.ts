import { Square } from 'chess.js'

// Valid chess squares
const VALID_SQUARES: Set<string> = new Set([
  'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8',
  'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8',
  'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8',
  'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8',
  'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8',
  'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8',
  'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8',
])

const VALID_PROMOTIONS: Set<string> = new Set(['q', 'r', 'b', 'n'])
const VALID_COLORS: Set<string> = new Set(['w', 'b'])

// Sanitize player name - remove dangerous characters, limit length
export function sanitizePlayerName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  
  // Trim and limit length
  const trimmed = name.trim().slice(0, 30)
  
  if (trimmed.length < 1 || trimmed.length > 30) return null
  
  // Remove potentially dangerous characters (XSS prevention)
  // Allow only alphanumeric, spaces, underscores, hyphens
  const sanitized = trimmed.replace(/[^a-zA-Z0-9\s_-]/g, '')
  
  if (sanitized.length < 1) return null
  
  return sanitized
}

// Validate player ID format
export function validatePlayerId(id: unknown): string | null {
  if (typeof id !== 'string') return null
  
  const trimmed = id.trim()

  // Must be reasonable length
  if (trimmed.length < 15 || trimmed.length > 100) return null
  
  // Supported formats:
  // - Legacy: player_{timestamp}_{random}
  // - Secure: player_{32-hex}
  const legacyPattern = /^player_\d+_[a-z0-9]+$/
  const securePattern = /^player_[a-f0-9]{32}$/
  if (!legacyPattern.test(trimmed) && !securePattern.test(trimmed)) return null
  
  return trimmed
}

// Validate chess square
export function validateSquare(square: unknown): Square | null {
  if (typeof square !== 'string') return null
  if (!VALID_SQUARES.has(square)) return null
  return square as Square
}

// Validate promotion piece
export function validatePromotion(promotion: unknown): string | undefined {
  if (promotion === undefined || promotion === null) return undefined
  if (typeof promotion !== 'string') return undefined
  if (!VALID_PROMOTIONS.has(promotion.toLowerCase())) return undefined
  return promotion.toLowerCase()
}

// Validate color
export function validateColor(color: unknown): 'w' | 'b' | null {
  if (typeof color !== 'string') return null
  if (!VALID_COLORS.has(color)) return null
  return color as 'w' | 'b'
}

// Validate admin password
export function validateAdminPassword(password: unknown): boolean {
  if (typeof password !== 'string') return false
  
  const adminPass = process.env.ADMIN_PASSWORD
  if (!adminPass || adminPass.length < 8) {
    // Admin password not configured or too weak
    return false
  }
  
  // Constant-time comparison to prevent timing attacks
  if (password.length !== adminPass.length) return false
  
  let result = 0
  for (let i = 0; i < password.length; i++) {
    result |= password.charCodeAt(i) ^ adminPass.charCodeAt(i)
  }
  
  return result === 0
}

// Validate action type
const VALID_ACTIONS: Set<string> = new Set([
  'join', 'leave', 'move', 'reset', 'clearAll', 'kickPlayer', 'confirmReady'
])

export function validateAction(action: unknown): string | null {
  if (typeof action !== 'string') return null
  if (!VALID_ACTIONS.has(action)) return null
  return action
}
