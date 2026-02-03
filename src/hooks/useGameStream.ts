'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { GameState, QueueState, TurnState } from '@/lib/gameStore'

export type { TurnState }

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface ApiResponse {
  game?: GameState
  queue?: QueueState
  error?: string
}

interface UseGameStreamReturn {
  gameState: GameState | null
  queueState: QueueState | null
  connectionStatus: ConnectionStatus
  reconnect: () => void
  refresh: () => Promise<void>
}

const PLAYER_ID_STORAGE_KEY = 'chessPlayerId'

function generateSecurePlayerId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `player_${hex}`
}

function getOrCreatePlayerId(): string | null {
  if (typeof window === 'undefined') return null

  const storedId = localStorage.getItem(PLAYER_ID_STORAGE_KEY)
  if (storedId) return storedId

  const newId = generateSecurePlayerId()
  localStorage.setItem(PLAYER_ID_STORAGE_KEY, newId)
  return newId
}

// Polling interval when tab is visible (ms)
const POLL_INTERVAL_ACTIVE = 2000
// Polling interval when tab is hidden (ms) - much slower to save resources
const POLL_INTERVAL_HIDDEN = 10000

export function useGameStream(): UseGameStreamReturn {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [queueState, setQueueState] = useState<QueueState | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')
  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isVisibleRef = useRef(true)
  const consecutiveErrorsRef = useRef(0)
  const maxConsecutiveErrors = 5

  // Fetch game state from API
  const fetchState = useCallback(async (): Promise<boolean> => {
    try {
      const playerId = getOrCreatePlayerId()

      const response = await fetch('/api/game', {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          ...(playerId ? { 'X-Player-Id': playerId } : {}),
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data: ApiResponse = await response.json()
      
      if (data.game) {
        setGameState(data.game)
      }
      if (data.queue) {
        setQueueState(data.queue)
      }
      
      setConnectionStatus('connected')
      consecutiveErrorsRef.current = 0
      return true
    } catch (err) {
      console.error('Failed to fetch game state:', err)
      consecutiveErrorsRef.current++
      
      if (consecutiveErrorsRef.current >= maxConsecutiveErrors) {
        setConnectionStatus('error')
      } else {
        setConnectionStatus('disconnected')
      }
      return false
    }
  }, [])

  // Manual refresh function exposed to consumers
  const refresh = useCallback(async () => {
    await fetchState()
  }, [fetchState])

  // Start polling
  const startPolling = useCallback(() => {
    // Clear any existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }

    // Determine interval based on visibility
    const interval = isVisibleRef.current ? POLL_INTERVAL_ACTIVE : POLL_INTERVAL_HIDDEN

    pollIntervalRef.current = setInterval(() => {
      // Only poll if not in error state (too many failures)
      if (consecutiveErrorsRef.current < maxConsecutiveErrors) {
        fetchState()
      }
    }, interval)
  }, [fetchState])

  // Reconnect function - resets error count and restarts polling
  const reconnect = useCallback(() => {
    consecutiveErrorsRef.current = 0
    setConnectionStatus('connecting')
    fetchState().then(() => {
      startPolling()
    })
  }, [fetchState, startPolling])

  // Handle visibility changes - pause/resume polling
  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = document.visibilityState === 'visible'
      
      if (isVisibleRef.current) {
        // Tab became visible - fetch immediately and restart with faster polling
        consecutiveErrorsRef.current = 0 // Reset errors on visibility
        setConnectionStatus('connecting')
        fetchState()
        startPolling()
      } else {
        // Tab hidden - switch to slower polling
        startPolling()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [fetchState, startPolling])

  // Initial fetch and start polling
  useEffect(() => {
    // Initial fetch
    fetchState()
    
    // Start polling
    startPolling()

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [fetchState, startPolling])

  return {
    gameState,
    queueState,
    connectionStatus,
    reconnect,
    refresh,
  }
}
