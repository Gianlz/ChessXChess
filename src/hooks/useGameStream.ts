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

export function useGameStream(): UseGameStreamReturn {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [queueState, setQueueState] = useState<QueueState | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')
  
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const isVisibleRef = useRef(true)
  const mountedRef = useRef(true)

  // Cleanup function
  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [])

  // Fetch personalized state from API (reads from cache, not Redis)
  const fetchPersonalizedState = useCallback(async () => {
    const playerId = getOrCreatePlayerId()
    
    try {
      const response = await fetch('/api/game', {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          ...(playerId ? { 'X-Player-Id': playerId } : {}),
        },
      })

      if (!response.ok) return

      const data = await response.json()
      
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
          fetchPersonalizedState()
          return
        }
        
        // Handle initial state (sent on connection)
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
  }, [cleanup, fetchPersonalizedState])

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
        // Tab became visible - reconnect if needed
        if (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED) {
          reconnectAttemptsRef.current = 0
          connectSSE()
        }
      } else {
        // Tab hidden - close connection to save resources
        // SSE will reconnect when tab becomes visible again
        cleanup()
        setConnectionStatus('disconnected')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [cleanup, connectSSE])

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
