'use client'

import { useState, useEffect } from 'react'
import type { Player, TurnState } from '@/lib/gameStore'

interface QueuePanelProps {
  whiteQueue: Player[]
  blackQueue: Player[]
  currentWhitePlayer: Player | null
  currentBlackPlayer: Player | null
  whiteTurnState: TurnState | null
  blackTurnState: TurnState | null
  currentPlayerId: string | null
  turn: 'w' | 'b'
  onJoinQueue: (color: 'w' | 'b') => void
  onLeaveQueue: () => void
  isInQueue: boolean
  playerColor: 'w' | 'b' | null
}

function CountdownTimer({ deadline, isActive }: { deadline: number; isActive: boolean }) {
  const [timeLeft, setTimeLeft] = useState(0)

  useEffect(() => {
    if (!isActive) {
      setTimeLeft(0)
      return
    }

    const update = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setTimeLeft(remaining)
    }

    update()
    const interval = setInterval(update, 100)
    return () => clearInterval(interval)
  }, [deadline, isActive])

  if (!isActive || timeLeft === 0) return null

  const isUrgent = timeLeft <= 5

  return (
    <span className={`ml-2 font-mono text-xs ${isUrgent ? 'text-red-400 animate-pulse' : 'text-gray-400'}`}>
      ({timeLeft}s)
    </span>
  )
}

export default function QueuePanel({
  whiteQueue,
  blackQueue,
  currentWhitePlayer,
  currentBlackPlayer,
  whiteTurnState,
  blackTurnState,
  currentPlayerId,
  turn,
  onJoinQueue,
  onLeaveQueue,
  isInQueue,
  playerColor,
}: QueuePanelProps) {
  const renderQueue = (
    color: 'w' | 'b',
    queue: Player[],
    currentPlayer: Player | null,
    turnState: TurnState | null
  ) => {
    const isCurrentTurn = turn === color
    const colorLabel = color === 'w' ? 'White' : 'Black'
    const bgClass = color === 'w' ? 'bg-white/10' : 'bg-black/30'
    const accentClass = color === 'w' ? 'text-white' : 'text-gray-300'

    return (
      <div className={`${bgClass} rounded-xl p-4`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className={`font-medium ${accentClass}`}>
            {color === 'w' ? '♔' : '♚'} {colorLabel}
          </h3>
          {isCurrentTurn && (
            <span className="text-xs px-2 py-0.5 bg-chess-accent/20 text-chess-accent rounded-full">
              Turn
            </span>
          )}
        </div>

        {/* Current player */}
        <div className="mb-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Now Playing</p>
          {currentPlayer ? (
            <div className={`flex items-center justify-between p-2 rounded-lg ${
              currentPlayer.id === currentPlayerId ? 'bg-chess-accent/20 border border-chess-accent/30' : 'bg-white/5'
            }`}>
              <span className={currentPlayer.id === currentPlayerId ? 'text-chess-accent font-medium' : 'text-white'}>
                {currentPlayer.name}
                {currentPlayer.id === currentPlayerId && ' (You)'}
              </span>
              {isCurrentTurn && turnState && (
                <div className="flex items-center">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    turnState.status === 'pending_confirmation' 
                      ? 'bg-yellow-500/20 text-yellow-400' 
                      : 'bg-green-500/20 text-green-400'
                  }`}>
                    {turnState.status === 'pending_confirmation' ? 'Waiting' : 'Ready'}
                  </span>
                  <CountdownTimer deadline={turnState.deadline} isActive={isCurrentTurn} />
                </div>
              )}
            </div>
          ) : (
            <div className="p-2 rounded-lg bg-white/5 text-gray-500 text-sm italic">
              No player
            </div>
          )}
        </div>

        {/* Queue */}
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            Queue ({queue.length})
          </p>
          {queue.length > 0 ? (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {queue.map((player, index) => (
                <div
                  key={player.id}
                  className={`flex items-center justify-between p-2 rounded-lg text-sm ${
                    player.id === currentPlayerId ? 'bg-chess-accent/10 text-chess-accent' : 'bg-white/5 text-gray-400'
                  }`}
                >
                  <span>
                    {index + 1}. {player.name}
                    {player.id === currentPlayerId && ' (You)'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm italic p-2">Empty</p>
          )}
        </div>

        {/* Join/Leave button */}
        <div className="mt-3">
          {playerColor === color ? (
            <button
              onClick={onLeaveQueue}
              className="w-full py-2 px-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-medium rounded-lg transition-all"
            >
              Leave Queue
            </button>
          ) : !isInQueue ? (
            <button
              onClick={() => onJoinQueue(color)}
              className="w-full py-2 px-3 bg-chess-accent/20 hover:bg-chess-accent/30 text-chess-accent text-sm font-medium rounded-lg transition-all"
            >
              Join as {colorLabel}
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="card p-4 w-full lg:w-72">
      <h2 className="font-serif text-lg mb-4 text-center">Player Queue</h2>
      <div className="space-y-4">
        {renderQueue('w', whiteQueue, currentWhitePlayer, whiteTurnState)}
        {renderQueue('b', blackQueue, currentBlackPlayer, blackTurnState)}
      </div>
    </div>
  )
}
