import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import {
  FASTPASS_TIERS,
  FastPassTier,
  createPendingPayment,
  getFastPass,
} from '@/lib/fastpass'

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
    const { visitorId, tier, fingerprint } = body as {
      visitorId: string
      tier: FastPassTier
      fingerprint: string
    }

    if (!visitorId || !tier || !fingerprint) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    if (!FASTPASS_TIERS[tier]) {
      return NextResponse.json(
        { success: false, error: 'Invalid tier' },
        { status: 400 }
      )
    }

    // Check if user already has active FastPass
    const existing = await getFastPass(visitorId)
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'You already have an active FastPass' },
        { status: 400 }
      )
    }

    const clientIp = getClientIp(request)
    const tierConfig = FASTPASS_TIERS[tier]

    // Check if AbacatePay is configured
    const apiKey = process.env.ABACATEPAY_API_KEY
    if (!apiKey) {
      logger.warn('AbacatePay API key not configured')
      return NextResponse.json(
        { success: false, error: 'Payment system not configured' },
        { status: 503 }
      )
    }

    // Create AbacatePay billing
    // @ts-expect-error - AbacatePay SDK doesn't have type definitions
    const { AbacatePay } = await import('@abacatepay/sdk')
    const abacate = AbacatePay({ secret: apiKey })

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

    const billing = await abacate.billing.create({
      frequency: 'ONE_TIME',
      methods: ['PIX'],
      products: [
        {
          externalId: `fastpass-${tier}`,
          name: `FastPass ${tierConfig.name}`,
          description: `Skip ${tierConfig.skipAmount} positions every 2 minutes for 1 hour`,
          quantity: 1,
          price: tierConfig.price,
        },
      ],
      returnUrl: `${baseUrl}?fastpass=success`,
      completionUrl: `${baseUrl}?fastpass=complete`,
      metadata: {
        visitorId,
        tier,
        fingerprint,
      },
    })

    // Store pending payment
    const paymentId = billing.data?.id || billing.id || `pending_${Date.now()}`
    await createPendingPayment(paymentId, visitorId, tier, clientIp, fingerprint)

    logger.info('FastPass: Checkout created', { visitorId, tier, paymentId })

    return NextResponse.json({
      success: true,
      checkoutUrl: billing.data?.url || billing.url,
      paymentId,
      tier: tierConfig,
    })
  } catch (err) {
    logger.error('FastPass API error', { error: String(err) })
    return NextResponse.json(
      { success: false, error: 'Failed to create checkout' },
      { status: 500 }
    )
  }
}

// GET endpoint to fetch tier information
export async function GET() {
  const tiers = Object.entries(FASTPASS_TIERS).map(([key, config]) => ({
    id: key,
    name: config.name,
    price: config.price,
    priceFormatted: `R$${(config.price / 100).toFixed(2)}`,
    skipAmount: config.skipAmount,
    duration: '1 hour',
    color: config.color,
  }))

  return NextResponse.json({ tiers })
}
