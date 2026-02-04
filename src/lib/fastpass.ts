import 'server-only'

import { getRedis } from './redis'
import { logger } from './logger'

// FastPass tiers configuration
export const FASTPASS_TIERS = {
  bronze: {
    name: 'Bronze',
    price: 500, // R$5.00 in cents
    skipAmount: 3,
    durationMs: 60 * 60 * 1000, // 1 hour
    color: '#CD7F32',
  },
  silver: {
    name: 'Silver',
    price: 1000, // R$10.00 in cents
    skipAmount: 5,
    durationMs: 60 * 60 * 1000, // 1 hour
    color: '#C0C0C0',
  },
  gold: {
    name: 'Gold',
    price: 2000, // R$20.00 in cents
    skipAmount: 10,
    durationMs: 60 * 60 * 1000, // 1 hour
    color: '#FFD700',
  },
} as const

export type FastPassTier = keyof typeof FASTPASS_TIERS

export interface FastPassRecord {
  visitorId: string
  purchaseIp: string
  purchaseFingerprint: string
  tier: FastPassTier
  expiresAt: number
  lastSkipAt: number
  freeSkipAvailable: boolean
  warningIssued: boolean
  revoked: boolean
  createdAt: number
}

export interface PendingPayment {
  visitorId: string
  tier: FastPassTier
  fingerprint: string
  ip: string
  createdAt: number
}

// Redis keys
const FASTPASS_PREFIX = 'fastpass:'
const PENDING_PAYMENT_PREFIX = 'fastpass:pending:'
const SKIP_INTERVAL_MS = 2 * 60 * 1000 // 2 minutes

export async function getFastPass(visitorId: string): Promise<FastPassRecord | null> {
  const redis = getRedis()
  if (!redis) return null
  
  try {
    const record = await redis.get<FastPassRecord>(`${FASTPASS_PREFIX}${visitorId}`)
    if (!record) return null
    
    // Check if expired or revoked
    if (record.revoked || Date.now() > record.expiresAt) {
      return null
    }
    
    return record
  } catch (err) {
    logger.error('FastPass: Failed to get record', { error: String(err) })
    return null
  }
}

export async function createFastPass(
  visitorId: string,
  tier: FastPassTier,
  ip: string,
  fingerprint: string
): Promise<FastPassRecord | null> {
  const redis = getRedis()
  if (!redis) return null
  
  const now = Date.now()
  const tierConfig = FASTPASS_TIERS[tier]
  
  const record: FastPassRecord = {
    visitorId,
    purchaseIp: ip,
    purchaseFingerprint: fingerprint,
    tier,
    expiresAt: now + tierConfig.durationMs,
    lastSkipAt: now,
    freeSkipAvailable: false,
    warningIssued: false,
    revoked: false,
    createdAt: now,
  }
  
  try {
    // Set with TTL matching duration + 1 hour buffer
    const ttlSeconds = Math.ceil((tierConfig.durationMs + 60 * 60 * 1000) / 1000)
    await redis.set(`${FASTPASS_PREFIX}${visitorId}`, record, { ex: ttlSeconds })
    logger.info('FastPass: Created', { visitorId, tier })
    return record
  } catch (err) {
    logger.error('FastPass: Failed to create', { error: String(err) })
    return null
  }
}

export async function updateFastPass(record: FastPassRecord): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return false
  
  try {
    const ttlSeconds = Math.ceil((record.expiresAt - Date.now() + 60 * 60 * 1000) / 1000)
    if (ttlSeconds > 0) {
      await redis.set(`${FASTPASS_PREFIX}${record.visitorId}`, record, { ex: ttlSeconds })
    }
    return true
  } catch (err) {
    logger.error('FastPass: Failed to update', { error: String(err) })
    return false
  }
}

export interface ValidationResult {
  valid: boolean
  warning?: boolean
  revoked?: boolean
  message?: string
}

export async function validateFastPassAccess(
  visitorId: string,
  currentIp: string,
  currentFingerprint: string
): Promise<ValidationResult> {
  const record = await getFastPass(visitorId)
  if (!record) {
    return { valid: false, message: 'No active FastPass' }
  }
  
  if (record.revoked) {
    return { valid: false, revoked: true, message: 'FastPass has been revoked' }
  }
  
  if (Date.now() > record.expiresAt) {
    return { valid: false, message: 'FastPass has expired' }
  }
  
  // Check IP and fingerprint match
  const ipMatches = record.purchaseIp === currentIp
  const fingerprintMatches = record.purchaseFingerprint === currentFingerprint
  
  // Allow if at least one matches (flexibility for IP changes or browser updates)
  if (ipMatches || fingerprintMatches) {
    return { valid: true }
  }
  
  // Both differ - potential sharing detected
  if (record.warningIssued) {
    // Second violation - revoke
    record.revoked = true
    await updateFastPass(record)
    logger.warn('FastPass: Revoked for sharing', { visitorId })
    return { valid: false, revoked: true, message: 'FastPass revoked: sharing detected' }
  }
  
  // First violation - warn
  record.warningIssued = true
  await updateFastPass(record)
  logger.warn('FastPass: Warning issued for potential sharing', { visitorId })
  return { valid: true, warning: true, message: 'Warning: FastPass may not be shared' }
}

export function canSkipNow(record: FastPassRecord): boolean {
  const timeSinceLastSkip = Date.now() - record.lastSkipAt
  return timeSinceLastSkip >= SKIP_INTERVAL_MS
}

export function getTimeUntilNextSkip(record: FastPassRecord): number {
  const timeSinceLastSkip = Date.now() - record.lastSkipAt
  return Math.max(0, SKIP_INTERVAL_MS - timeSinceLastSkip)
}

export async function markSkipUsed(visitorId: string): Promise<boolean> {
  const record = await getFastPass(visitorId)
  if (!record) return false
  
  record.lastSkipAt = Date.now()
  record.freeSkipAvailable = false
  return await updateFastPass(record)
}

export async function grantFreeSkip(visitorId: string): Promise<boolean> {
  const record = await getFastPass(visitorId)
  if (!record) return false
  
  record.freeSkipAvailable = true
  return await updateFastPass(record)
}

// Pending payments
export async function createPendingPayment(
  paymentId: string,
  visitorId: string,
  tier: FastPassTier,
  ip: string,
  fingerprint: string
): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return false
  
  const pending: PendingPayment = {
    visitorId,
    tier,
    fingerprint,
    ip,
    createdAt: Date.now(),
  }
  
  try {
    // 1 hour TTL for pending payments
    await redis.set(`${PENDING_PAYMENT_PREFIX}${paymentId}`, pending, { ex: 3600 })
    return true
  } catch (err) {
    logger.error('FastPass: Failed to create pending payment', { error: String(err) })
    return false
  }
}

export async function getPendingPayment(paymentId: string): Promise<PendingPayment | null> {
  const redis = getRedis()
  if (!redis) return null
  
  try {
    return await redis.get<PendingPayment>(`${PENDING_PAYMENT_PREFIX}${paymentId}`)
  } catch (err) {
    logger.error('FastPass: Failed to get pending payment', { error: String(err) })
    return null
  }
}

export async function deletePendingPayment(paymentId: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  
  try {
    await redis.del(`${PENDING_PAYMENT_PREFIX}${paymentId}`)
  } catch (err) {
    logger.error('FastPass: Failed to delete pending payment', { error: String(err) })
  }
}

// Get all active FastPass records (for queue processing)
export async function getAllActiveFastPasses(): Promise<FastPassRecord[]> {
  const redis = getRedis()
  if (!redis) return []
  
  try {
    // Note: In production, use SCAN instead of KEYS for better performance
    const keys = await redis.keys(`${FASTPASS_PREFIX}*`)
    const validKeys = keys.filter(k => !k.includes(':pending:'))
    
    if (validKeys.length === 0) return []
    
    const records: FastPassRecord[] = []
    for (const key of validKeys) {
      const record = await redis.get<FastPassRecord>(key)
      if (record && !record.revoked && Date.now() < record.expiresAt) {
        records.push(record)
      }
    }
    
    return records
  } catch (err) {
    logger.error('FastPass: Failed to get all records', { error: String(err) })
    return []
  }
}
