'use client'

import { useState, useEffect, useCallback } from 'react'
import { Square, Move } from 'chess.js'
import { GameState, QueueState } from '@/lib/gameStore'

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
  setPlayerName: (name: string) => void
  joinQueue: (color: 'w' | 'b') => Promise<void>
  leaveQueue: () => Promise<void>
  selectSquare: (square: Square) => void
  makeMove: (from: Square, to: Square, promotion?: string) => Promise<boolean>
  resetGame: () => Promise<void>
}

export function useGame(): UseGameReturn {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [queueState, setQueueState] = useState<QueueState | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState<string | null>(null)
  const [playerColor, setPlayerColor] = useState<'w' | 'b' | null>(null)
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null)
  const [validMoves, setValidMoves] = useState<Square[]>([])
  const [error, setError] = useState<string | null>(null)


  // Generate player ID on mount
  useEffect(() => {
    const storedId = localStorage.getItem('chessPlayerId')
    const storedName = localStorage.getItem('chessPlayerName')
    
    if (storedId) {
      setPlayerId(storedId)
    } else {
      const newId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      localStorage.setItem('chessPlayerId', newId)
      setPlayerId(newId)
    }
    
    if (storedName) {
      setPlayerName(storedName)
    }
  }, [])

  // Connect to SSE stream
  useEffect(() => {
    const eventSource = new EventSource('/api/stream')

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        setGameState(data.game)
        setQueueState(data.queue)
      } catch {
        // Ignore parse errors (heartbeats)
      }
    }

    eventSource.onerror = () => {
      setError('Connection lost. Reconnecting...')
      setTimeout(() => {
        setError(null)
      }, 2000)
    }

    return () => {
      eventSource.close()
    }
  }, [])

  // Update player color based on queue state
  useEffect(() => {
    if (!queueState || !playerId) return

    const inWhite = queueState.currentWhitePlayer?.id === playerId || 
                    queueState.whiteQueue.some(p => p.id === playerId)
    const inBlack = queueState.currentBlackPlayer?.id === playerId || 
                    queueState.blackQueue.some(p => p.id === playerId)

    if (inWhite) {
      setPlayerColor('w')
    } else if (inBlack) {
      setPlayerColor('b')
    } else {
      setPlayerColor(null)
    }
  }, [queueState, playerId])

  const isInQueue = playerColor !== null

  const isMyTurn = gameState && queueState && playerId ? (
    (gameState.turn === 'w' && queueState.currentWhitePlayer?.id === playerId) ||
    (gameState.turn === 'b' && queueState.currentBlackPlayer?.id === playerId)
  ) : false

  const canPlay = isMyTurn && !gameState?.isGameOver

  const updatePlayerName = useCallback((name: string) => {
    setPlayerName(name)
    localStorage.setItem('chessPlayerName', name)
  }, [])

  const joinQueue = useCallback(async (color: 'w' | 'b') => {
    if (!playerId || !playerName) {
      setError('Please enter your name first')
      return
    }

    try {
      const response = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'join',
          playerId,
          playerName,
          color,
        }),
      })
      const data = await response.json()
      if (!data.success) {
        setError('Failed to join queue')
      }
    } catch {
      setError('Failed to join queue')
    }
  }, [playerId, playerName])

  const leaveQueue = useCallback(async () => {
    if (!playerId) return

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
    } catch {
      setError('Failed to leave queue')
    }
  }, [playerId])

  const fetchValidMoves = useCallback(async (square: Square): Promise<Move[]> => {
    try {
      const response = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'validMoves',
          from: square,
        }),
      })
      const data = await response.json()
      return data.moves || []
    } catch {
      return []
    }
  }, [])

  const selectSquare = useCallback(async (square: Square) => {
    if (!canPlay) return

    // If clicking on a valid move target, make the move
    if (selectedSquare && validMoves.includes(square)) {
      // Don't await here, let the move handler deal with it
      return
    }

    // Select new square
    const moves = await fetchValidMoves(square)
    if (moves.length > 0) {
      setSelectedSquare(square)
      setValidMoves(moves.map(m => m.to as Square))
    } else {
      setSelectedSquare(null)
      setValidMoves([])
    }
  }, [canPlay, selectedSquare, validMoves, fetchValidMoves])

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
        return true
      } else {
        setError(data.error || 'Invalid move')
        return false
      }
    } catch {
      setError('Failed to make move')
      return false
    }
  }, [playerId, canPlay])

  const resetGame = useCallback(async () => {
    try {
      await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      })
    } catch {
      setError('Failed to reset game')
    }
  }, [])

  // Clear error after timeout
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [error])

  return {
    gameState,
    queueState,
    playerId,
    playerName,
    playerColor,
    isInQueue,
    selectedSquare,
    validMoves,
    isMyTurn,
    canPlay,
    error,
    setPlayerName: updatePlayerName,
    joinQueue,
    leaveQueue,
    selectSquare,
    makeMove,
    resetGame,
  }
}
