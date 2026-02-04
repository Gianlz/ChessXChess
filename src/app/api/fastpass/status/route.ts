import { NextRequest, NextResponse } from 'next/server'
import {
  getFastPass,
  validateFastPassAccess,
  FASTPASS_TIERS,
  canSkipNow,
  getTimeUntilNextSkip,
} from '@/lib/fastpass'
import { getPlayerRank, getPlayerPoints } from '@/lib/ranking'

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return request.headers.get('x-real-ip') || 'unknown'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { visitorId, fingerprint } = body as {
      visitorId: string
      fingerprint: string
    }

    if (!visitorId) {
      return NextResponse.json(
        { success: false, error: 'Missing visitor ID' },
        { status: 400 }
      )
    }

    const fastPass = await getFastPass(visitorId)
    
    if (!fastPass) {
      return NextResponse.json({
        success: true,
        active: false,
      })
    }

    // Validate access if fingerprint provided
    let warning: string | undefined
    if (fingerprint) {
      const clientIp = getClientIp(request)
      const validation = await validateFastPassAccess(visitorId, clientIp, fingerprint)
      
      if (!validation.valid) {
        return NextResponse.json({
          success: true,
          active: false,
          revoked: validation.revoked,
          message: validation.message,
        })
      }
      
      if (validation.warning) {
        warning = validation.message
      }
    }

    const tierConfig = FASTPASS_TIERS[fastPass.tier]
    const timeRemaining = Math.max(0, fastPass.expiresAt - Date.now())
    const canSkip = canSkipNow(fastPass)
    const nextSkipIn = getTimeUntilNextSkip(fastPass)

    // Get ranking info
    const rankInfo = await getPlayerRank(visitorId)
    const points = await getPlayerPoints(visitorId)

    return NextResponse.json({
      success: true,
      active: true,
      tier: fastPass.tier,
      tierName: tierConfig.name,
      tierColor: tierConfig.color,
      skipAmount: tierConfig.skipAmount,
      expiresAt: fastPass.expiresAt,
      timeRemaining,
      timeRemainingFormatted: formatDuration(timeRemaining),
      canSkip,
      nextSkipIn,
      nextSkipInFormatted: formatDuration(nextSkipIn),
      freeSkipAvailable: fastPass.freeSkipAvailable,
      warning,
      ranking: {
        rank: rankInfo?.rank || null,
        points,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: 'Failed to check status' },
      { status: 500 }
    )
  }
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '0s'
  
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  }
  
  if (minutes > 0) {
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }
  
  return `${seconds}s`
}
