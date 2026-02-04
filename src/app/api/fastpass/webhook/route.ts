import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { logger } from '@/lib/logger'
import {
  getPendingPayment,
  deletePendingPayment,
  createFastPass,
} from '@/lib/fastpass'
import { setPlayerInfo } from '@/lib/ranking'

// AbacatePay public key for webhook signature verification
const ABACATEPAY_PUBLIC_KEY = process.env.ABACATEPAY_WEBHOOK_SECRET || ''

function verifyWebhookSignature(payload: string, signature: string): boolean {
  if (!ABACATEPAY_PUBLIC_KEY) {
    logger.warn('AbacatePay webhook secret not configured, skipping verification')
    return true // Allow in development
  }

  try {
    const hmac = crypto.createHmac('sha256', ABACATEPAY_PUBLIC_KEY)
    hmac.update(payload)
    const digest = hmac.digest('hex')
    return digest === signature
  } catch (err) {
    logger.error('Webhook signature verification failed', { error: String(err) })
    return false
  }
}

interface WebhookPayload {
  id: string
  event: string
  devMode: boolean
  data: {
    billing: {
      id: string
      status: string
      amount: number
      paidAmount: number
      customer?: {
        id: string
        metadata?: {
          name?: string
          email?: string
        }
      }
    }
    payment?: {
      amount: number
      method: string
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-webhook-signature') || ''

    // Verify signature
    if (!verifyWebhookSignature(rawBody, signature)) {
      logger.warn('Invalid webhook signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const payload: WebhookPayload = JSON.parse(rawBody)
    logger.info('Webhook received', { event: payload.event, billingId: payload.data?.billing?.id })

    // Handle billing.paid event
    if (payload.event === 'billing.paid') {
      const billingId = payload.data?.billing?.id
      if (!billingId) {
        logger.error('Missing billing ID in webhook')
        return NextResponse.json({ error: 'Missing billing ID' }, { status: 400 })
      }

      // Get pending payment info
      const pending = await getPendingPayment(billingId)
      if (!pending) {
        logger.warn('No pending payment found for billing', { billingId })
        // May have already been processed
        return NextResponse.json({ success: true, message: 'Already processed or not found' })
      }

      // Create FastPass
      const fastPass = await createFastPass(
        pending.visitorId,
        pending.tier,
        pending.ip,
        pending.fingerprint
      )

      if (!fastPass) {
        logger.error('Failed to create FastPass', { billingId, visitorId: pending.visitorId })
        return NextResponse.json({ error: 'Failed to activate FastPass' }, { status: 500 })
      }

      // Initialize player ranking info
      await setPlayerInfo(pending.visitorId, {
        displayName: 'FastPass Player',
        wins: 0,
        tier: pending.tier,
      })

      // Clean up pending payment
      await deletePendingPayment(billingId)

      logger.info('FastPass activated via webhook', {
        visitorId: pending.visitorId,
        tier: pending.tier,
        billingId,
      })

      return NextResponse.json({ success: true, message: 'FastPass activated' })
    }

    // Handle other events (billing.created, etc.) - just acknowledge
    return NextResponse.json({ success: true, message: 'Event acknowledged' })
  } catch (err) {
    logger.error('Webhook processing error', { error: String(err) })
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
