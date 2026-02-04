'use client'

import { useState, useEffect, useCallback } from 'react'
import { generateFingerprint } from '@/lib/fingerprint'

export interface FastPassStatus {
  active: boolean
  tier?: 'bronze' | 'silver' | 'gold'
  tierName?: string
  tierColor?: string
  skipAmount?: number
  expiresAt?: number
  timeRemaining?: number
  timeRemainingFormatted?: string
  canSkip?: boolean
  nextSkipIn?: number
  nextSkipInFormatted?: string
  freeSkipAvailable?: boolean
  warning?: string
  revoked?: boolean
  ranking?: {
    rank: number | null
    points: number
  }
}

interface UseFastPassReturn {
  status: FastPassStatus | null
  isLoading: boolean
  error: string | null
  visitorId: string | null
  showModal: boolean
  isPurchasing: boolean
  openModal: () => void
  closeModal: () => void
  purchaseFastPass: (tier: string) => Promise<void>
  refreshStatus: () => Promise<void>
}

export function useFastPass(): UseFastPassReturn {
  const [status, setStatus] = useState<FastPassStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visitorId, setVisitorId] = useState<string | null>(null)
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [isPurchasing, setIsPurchasing] = useState(false)

  // Generate visitor ID on mount
  useEffect(() => {
    const storedId = localStorage.getItem('chessVisitorId')
    if (storedId) {
      setVisitorId(storedId)
    } else {
      const bytes = new Uint8Array(16)
      crypto.getRandomValues(bytes)
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
      const newId = `visitor_${hex}`
      localStorage.setItem('chessVisitorId', newId)
      setVisitorId(newId)
    }
  }, [])

  // Generate fingerprint on mount
  useEffect(() => {
    generateFingerprint().then(setFingerprint)
  }, [])

  // Fetch FastPass status
  const refreshStatus = useCallback(async () => {
    if (!visitorId || !fingerprint) return

    try {
      const res = await fetch('/api/fastpass/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId, fingerprint }),
      })
      const data = await res.json()

      if (data.success) {
        setStatus(data)
        if (data.warning) {
          setError(data.warning)
        }
      } else {
        setError(data.error)
      }
    } catch {
      setError('Failed to check FastPass status')
    } finally {
      setIsLoading(false)
    }
  }, [visitorId, fingerprint])

  // Initial fetch and periodic refresh
  useEffect(() => {
    if (visitorId && fingerprint) {
      refreshStatus()
      // Refresh every 10 seconds when active
      const interval = setInterval(refreshStatus, 10000)
      return () => clearInterval(interval)
    }
  }, [visitorId, fingerprint, refreshStatus])

  // Clear error after timeout
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  const openModal = useCallback(() => {
    setShowModal(true)
  }, [])

  const closeModal = useCallback(() => {
    setShowModal(false)
  }, [])

  const purchaseFastPass = useCallback(async (tier: string) => {
    if (!visitorId || !fingerprint) {
      setError('Please wait while we initialize...')
      return
    }

    setIsPurchasing(true)
    setError(null)

    try {
      const res = await fetch('/api/fastpass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId, tier, fingerprint }),
      })
      const data = await res.json()

      if (data.success && data.checkoutUrl) {
        // Redirect to payment page
        window.location.href = data.checkoutUrl
      } else {
        setError(data.error || 'Failed to create checkout')
      }
    } catch {
      setError('Failed to process payment')
    } finally {
      setIsPurchasing(false)
    }
  }, [visitorId, fingerprint])

  return {
    status,
    isLoading,
    error,
    visitorId,
    showModal,
    isPurchasing,
    openModal,
    closeModal,
    purchaseFastPass,
    refreshStatus,
  }
}
