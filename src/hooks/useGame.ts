'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Chess, Square, Move } from 'chess.js'
import type { GameState, QueueState, TurnState, Player } from '@/lib/gameStore'
import { useGameStream } from './useGameStream'
import type { ConnectionStatus } from './useGameStream'

export type { ConnectionStatus, TurnState }
export type { Player } from '@/lib/gameStore'

interface UseGameReturn {
  gameState: GameState | null
  queueState: QueueState | null
  playerId: string | null
  playerName: string | null
  playerColor: 'w' | 'b' | null
  isInQueue: boolean
  selectedSquare: Square | null
  validMoves: Square[]
  isMyTurn: boolean
  canPlay: boolean
  error: string | null
  connectionStatus: ConnectionStatus
  turnState: TurnState | null
  needsConfirmation: boolean
  isConfirmed: boolean
  timeRemaining: number
  isPending: boolean // True when an action is in progress
  setPlayerName: (name: string) => void
  joinQueue: (color: 'w' | 'b') => Promise<void>
  leaveQueue: () => Promise<void>
  selectSquare: (square: Square) => void
  makeMove: (from: Square, to: Square, promotion?: string) => Promise<boolean>
  resetGame: () => Promise<void>
  reconnect: () => void
  confirmReady: () => Promise<void>
}

export function useGame(): UseGameReturn {
  const { gameState, queueState, connectionStatus, reconnect, refresh } = useGameStream()

  const [playerId, setPlayerId] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState<string | null>(null)
  const [playerColor, setPlayerColor] = useState<'w' | 'b' | null>(null)
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null)
  const [validMoves, setValidMoves] = useState<Square[]>([])
  const [error, setError] = useState<string | null>(null)
  const [timeRemaining, setTimeRemaining] = useState<number>(0)
  const [isPending, setIsPending] = useState<boolean>(false)
  
  // Optimistic state overlays
  const [optimisticQueueState, setOptimisticQueueState] = useState<QueueState | null>(null)
  
  // Use optimistic state if available, otherwise use server state
  const effectiveQueueState = optimisticQueueState || queueState

  // Memoized chess instance for client-side move validation
  const chess = useMemo(() => {
    const c = new Chess()
    if (gameState?.fen) {
      try {
        c.load(gameState.fen)
      } catch {
        // Invalid FEN, use default
      }
    }
    return c
  }, [gameState?.fen])

  // Generate player ID on mount
  useEffect(() => {
    const storedId = localStorage.getItem('chessPlayerId')
    const storedName = localStorage.getItem('chessPlayerName')

    if (storedId) {
      setPlayerId(storedId)
    } else {
      const bytes = new Uint8Array(16)
      crypto.getRandomValues(bytes)
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
      const newId = `player_${hex}`
      localStorage.setItem('chessPlayerId', newId)
      setPlayerId(newId)
    }

    if (storedName) {
      setPlayerName(storedName)
    }
  }, [])

  // Clear optimistic state when server state updates
  useEffect(() => {
    if (queueState) {
      setOptimisticQueueState(null)
    }
  }, [queueState])

  // Update player color based on effective queue state
  useEffect(() => {
    if (!effectiveQueueState || !playerId) return

    const inWhite = effectiveQueueState.currentWhitePlayer?.id === playerId ||
                    effectiveQueueState.whiteQueue.some(p => p.id === playerId)
    const inBlack = effectiveQueueState.currentBlackPlayer?.id === playerId ||
                    effectiveQueueState.blackQueue.some(p => p.id === playerId)

    if (inWhite) {
      setPlayerColor('w')
    } else if (inBlack) {
      setPlayerColor('b')
    } else {
      setPlayerColor(null)
    }
  }, [effectiveQueueState, playerId])

  // Clear selection when turn changes (another player moved)
  useEffect(() => {
    if (gameState) {
      setSelectedSquare(null)
      setValidMoves([])
    }
  }, [gameState?.fen])

  const isInQueue = playerColor !== null

  const isMyTurn = gameState && effectiveQueueState && playerId ? (
    (gameState.turn === 'w' && effectiveQueueState.currentWhitePlayer?.id === playerId) ||
    (gameState.turn === 'b' && effectiveQueueState.currentBlackPlayer?.id === playerId)
  ) : false

  const turnState = gameState && effectiveQueueState && isMyTurn ? (
    gameState.turn === 'w' ? effectiveQueueState.whiteTurnState : effectiveQueueState.blackTurnState
  ) : null

  const needsConfirmation = isMyTurn && turnState?.status === 'pending_confirmation'
  const isConfirmed = isMyTurn && turnState?.status === 'confirmed'

  const canPlay = isConfirmed && !gameState?.isGameOver

  // Calculate and update time remaining
  useEffect(() => {
    if (!turnState || !isMyTurn) {
      setTimeRemaining(0)
      return
    }

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((turnState.deadline - Date.now()) / 1000))
      setTimeRemaining(remaining)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 100)

    return () => clearInterval(interval)
  }, [turnState, isMyTurn])

  const updatePlayerName = useCallback((name: string) => {
    setPlayerName(name)
    localStorage.setItem('chessPlayerName', name)
  }, [])

  const joinQueue = useCallback(async (color: 'w' | 'b') => {
    if (!playerId || !playerName) {
      setError('Please enter your name first')
      return
    }

    // Get visitorId for FastPass
    const visitorId = localStorage.getItem('chessVisitorId')

    // Optimistic update - immediately show player in queue
    if (queueState) {
      const newPlayer = { id: playerId, name: playerName, joinedAt: Date.now() }
      const optimistic: QueueState = {
        ...queueState,
        whiteQueue: color === 'w' ? [...queueState.whiteQueue, newPlayer] : queueState.whiteQueue,
        blackQueue: color === 'b' ? [...queueState.blackQueue, newPlayer] : queueState.blackQueue,
      }
      setOptimisticQueueState(optimistic)
    }
    
    setIsPending(true)

    try {
      const response = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'join',
          playerId,
          playerName,
          color,
          visitorId,
        }),
      })
      const data = await response.json()
      if (!data.success) {
        // Rollback optimistic update on error
        setOptimisticQueueState(null)
        setError(data.error || 'Failed to join queue')
      } else {
        await refresh() // Fetch server state to confirm
      }
    } catch {
      setOptimisticQueueState(null)
      setError('Failed to join queue')
    } finally {
      setIsPending(false)
    }
  }, [playerId, playerName, queueState, refresh])

  const leaveQueue = useCallback(async () => {
    if (!playerId) return

    // Optimistic update - immediately remove player from queue
    if (queueState) {
      const optimistic: QueueState = {
        ...queueState,
        whiteQueue: queueState.whiteQueue.filter(p => p.id !== playerId),
        blackQueue: queueState.blackQueue.filter(p => p.id !== playerId),
        currentWhitePlayer: queueState.currentWhitePlayer?.id === playerId ? null : queueState.currentWhitePlayer,
        currentBlackPlayer: queueState.currentBlackPlayer?.id === playerId ? null : queueState.currentBlackPlayer,
      }
      setOptimisticQueueState(optimistic)
    }
    
    setIsPending(true)

    try {
      await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'leave',
          playerId,
        }),
      })
      setSelectedSquare(null)
      setValidMoves([])
      await refresh() // Fetch server state to confirm
    } catch {
      setOptimisticQueueState(null)
      setError('Failed to leave queue')
    } finally {
      setIsPending(false)
    }
  }, [playerId, queueState, refresh])

  // Calculate valid moves client-side using chess.js - no API call needed!
  const getValidMoves = useCallback((square: Square): Move[] => {
    try {
      return chess.moves({ square, verbose: true })
    } catch {
      return []
    }
  }, [chess])

  const selectSquare = useCallback((square: Square) => {
    if (!canPlay) return

    // If clicking on a valid move target, don't reselect
    if (selectedSquare && validMoves.includes(square)) {
      return
    }

    // Calculate valid moves client-side
    const moves = getValidMoves(square)
    if (moves.length > 0) {
      setSelectedSquare(square)
      setValidMoves(moves.map(m => m.to as Square))
    } else {
      setSelectedSquare(null)
      setValidMoves([])
    }
  }, [canPlay, selectedSquare, validMoves, getValidMoves])

  const makeMove = useCallback(async (from: Square, to: Square, promotion?: string): Promise<boolean> => {
    if (!playerId || !canPlay) return false

    try {
      const response = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'move',
          playerId,
          from,
          to,
          promotion,
        }),
      })
      const data = await response.json()

      if (data.success) {
        setSelectedSquare(null)
        setValidMoves([])
        await refresh() // Immediate update after move
        return true
      } else {
        setError(data.error || 'Invalid move')
        return false
      }
    } catch {
      setError('Failed to make move')
      return false
    }
  }, [playerId, canPlay, refresh])

  const resetGame = useCallback(async () => {
    const pass = prompt('Enter admin password to reset game:')
    if (!pass) {
      setError('Reset cancelled')
      return
    }
    try {
      const response = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', pass }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error || 'Failed to reset game')
        return
      }
    } catch {
      setError('Failed to reset game')
    }
  }, [])

  const confirmReady = useCallback(async () => {
    if (!playerId) return

    setIsPending(true)

    try {
      const response = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirmReady',
          playerId,
        }),
      })
      const data = await response.json()
      if (!data.success) {
        setError(data.error || 'Failed to confirm')
      } else {
        await refresh() // Immediate update after confirm
      }
    } catch {
      setError('Failed to confirm ready')
    } finally {
      setIsPending(false)
    }
  }, [playerId, refresh])

  // Clear error after timeout
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [error])

  return {
    gameState,
    queueState: effectiveQueueState,
    playerId,
    playerName,
    playerColor,
    isInQueue,
    selectedSquare,
    validMoves,
    isMyTurn,
    canPlay,
    error,
    connectionStatus,
    turnState,
    needsConfirmation,
    isConfirmed,
    timeRemaining,
    isPending,
    setPlayerName: updatePlayerName,
    joinQueue,
    leaveQueue,
    selectSquare,
    makeMove,
    resetGame,
    reconnect,
    confirmReady,
  }
}
