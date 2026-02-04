'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { GameState, QueueState, TurnState } from '@/lib/gameStore'

export type { TurnState }

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface SSEMessage {
  type?: 'update'  // Version change notification
  game?: GameState
  queue?: QueueState
  version?: number
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

// SSE reconnect delay (ms)
const SSE_RECONNECT_DELAY = 3000
// Max reconnect attempts before giving up
const MAX_RECONNECT_ATTEMPTS = 5
// Fallback polling interval when SSE might be unreliable (ms)
const FALLBACK_POLL_INTERVAL = 5000

export function useGameStream(): UseGameStreamReturn {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [queueState, setQueueState] = useState<QueueState | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')
  
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const isVisibleRef = useRef(true)
  const mountedRef = useRef(true)
  const lastVersionRef = useRef<number>(0)
  const lastUpdateRef = useRef<number>(Date.now())

  // Stop fallback polling
  const stopFallbackPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  // Cleanup function
  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    stopFallbackPolling()
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [stopFallbackPolling])

  // Fetch personalized state from API (reads from cache, not Redis)
  const fetchPersonalizedState = useCallback(async (skipVersionCheck = false) => {
    const playerId = getOrCreatePlayerId()
    
    try {
      const response = await fetch('/api/game', {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          ...(playerId ? { 'X-Player-Id': playerId } : {}),
          // Send current version for conditional fetch
          ...(!skipVersionCheck && lastVersionRef.current ? { 'If-None-Match': `W/"${lastVersionRef.current}"` } : {}),
        },
      })

      // 304 Not Modified - no changes
      if (response.status === 304) return
      if (!response.ok) return

      const data = await response.json()
      
      // Update version tracking
      if (data.version) {
        lastVersionRef.current = data.version
      }
      lastUpdateRef.current = Date.now()
      
      if (data.game) {
        setGameState(data.game)
      }
      if (data.queue) {
        setQueueState(data.queue)
      }
      setConnectionStatus('connected')
    } catch (err) {
      console.error('Failed to fetch state:', err)
    }
  }, [])

  // Start fallback polling (safety net for missed SSE updates)
  const startFallbackPolling = useCallback(() => {
    if (pollIntervalRef.current) return
    
    pollIntervalRef.current = setInterval(() => {
      if (!mountedRef.current || !isVisibleRef.current) return
      
      // Only poll if we haven't received an update recently
      const timeSinceLastUpdate = Date.now() - lastUpdateRef.current
      if (timeSinceLastUpdate > FALLBACK_POLL_INTERVAL) {
        fetchPersonalizedState()
      }
    }, FALLBACK_POLL_INTERVAL)
  }, [fetchPersonalizedState])

  // Connect to SSE stream
  const connectSSE = useCallback(() => {
    if (!mountedRef.current) return

    cleanup()
    
    const url = `/api/stream`
    
    setConnectionStatus('connecting')
    
    const eventSource = new EventSource(url)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      if (!mountedRef.current) return
      reconnectAttemptsRef.current = 0
      setConnectionStatus('connected')
      // Start fallback polling as safety net
      startFallbackPolling()
    }

    eventSource.onmessage = (event) => {
      if (!mountedRef.current) return
      
      try {
        const data: SSEMessage = JSON.parse(event.data)
        
        if (data.error) {
          console.error('SSE error:', data.error)
          return
        }
        
        // Handle version change notification - fetch fresh personalized data
        if (data.type === 'update') {
          lastUpdateRef.current = Date.now()
          fetchPersonalizedState(true) // Skip version check, force fetch
          return
        }
        
        // Handle initial state (sent on connection)
        if (data.version) {
          lastVersionRef.current = data.version
        }
        lastUpdateRef.current = Date.now()
        
        if (data.game) {
          setGameState(data.game)
        }
        if (data.queue) {
          setQueueState(data.queue)
        }
        
        setConnectionStatus('connected')
      } catch (err) {
        console.error('Failed to parse SSE message:', err)
      }
    }

    eventSource.onerror = () => {
      if (!mountedRef.current) return
      
      eventSource.close()
      eventSourceRef.current = null
      
      reconnectAttemptsRef.current++
      
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setConnectionStatus('error')
        return
      }
      
      setConnectionStatus('disconnected')
      
      // Only reconnect if tab is visible
      if (isVisibleRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connectSSE()
        }, SSE_RECONNECT_DELAY)
      }
    }
  }, [cleanup, fetchPersonalizedState, startFallbackPolling])

  // Manual reconnect function
  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0
    connectSSE()
  }, [connectSSE])

  // Manual refresh - fetches from API (which reads from cache, not Redis)
  const refresh = useCallback(async () => {
    await fetchPersonalizedState()
  }, [fetchPersonalizedState])

  // Handle visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = document.visibilityState === 'visible'
      
      if (isVisibleRef.current) {
        // Tab became visible - reconnect if needed and fetch fresh state
        if (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED) {
          reconnectAttemptsRef.current = 0
          connectSSE()
        }
        // Always fetch fresh state when tab becomes visible
        fetchPersonalizedState(true)
        startFallbackPolling()
      } else {
        // Tab hidden - close connection to save resources
        // SSE will reconnect when tab becomes visible again
        cleanup()
        setConnectionStatus('disconnected')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [cleanup, connectSSE, fetchPersonalizedState, startFallbackPolling])

  // Initial connection + cleanup
  useEffect(() => {
    mountedRef.current = true
    connectSSE()

    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [connectSSE, cleanup])

  return {
    gameState,
    queueState,
    connectionStatus,
    reconnect,
    refresh,
  }
}
