'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { GameState, QueueState } from '@/lib/gameStore'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface StreamData {
  game?: GameState
  queue?: QueueState
  error?: string
}

interface UseGameStreamReturn {
  gameState: GameState | null
  queueState: QueueState | null
  connectionStatus: ConnectionStatus
  reconnect: () => void
}

export function useGameStream(): UseGameStreamReturn {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [queueState, setQueueState] = useState<QueueState | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')
  
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 10
  const baseReconnectDelay = 1000

  const connect = useCallback(() => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    setConnectionStatus('connecting')

    try {
      const eventSource = new EventSource('/api/stream')
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        setConnectionStatus('connected')
        reconnectAttempts.current = 0
      }

      eventSource.onmessage = (event) => {
        try {
          const data: StreamData = JSON.parse(event.data)
          
          if (data.game) {
            setGameState(data.game)
          }
          if (data.queue) {
            setQueueState(data.queue)
          }
          if (data.error) {
            console.error('Stream error:', data.error)
          }
        } catch {
          // Ignore parse errors (e.g., heartbeat)
        }
      }

      eventSource.onerror = () => {
        eventSource.close()
        eventSourceRef.current = null
        setConnectionStatus('disconnected')

        // Auto-reconnect with exponential backoff
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(
            baseReconnectDelay * Math.pow(2, reconnectAttempts.current),
            30000 // Max 30 seconds
          )
          reconnectAttempts.current++
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, delay)
        } else {
          setConnectionStatus('error')
        }
      }
    } catch {
      setConnectionStatus('error')
    }
  }, [])

  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0
    connect()
  }, [connect])

  // Initial connection
  useEffect(() => {
    connect()

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }
  }, [connect])

  // Reconnect when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && connectionStatus === 'disconnected') {
        reconnect()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [connectionStatus, reconnect])

  return {
    gameState,
    queueState,
    connectionStatus,
    reconnect,
  }
}
