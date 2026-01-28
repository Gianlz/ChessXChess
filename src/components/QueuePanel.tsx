'use client'

import { Player } from '@/lib/gameStore'

interface QueuePanelProps {
  whiteQueue: Player[]
  blackQueue: Player[]
  currentWhitePlayer: Player | null
  currentBlackPlayer: Player | null
  currentPlayerId: string | null
  turn: 'w' | 'b'
  onJoinQueue: (color: 'w' | 'b') => void
  onLeaveQueue: () => void
  isInQueue: boolean
  playerColor: 'w' | 'b' | null
}

export default function QueuePanel({
  whiteQueue,
  blackQueue,
  currentWhitePlayer,
  currentBlackPlayer,
  currentPlayerId,
  turn,
  onJoinQueue,
  onLeaveQueue,
  isInQueue,
  playerColor,
}: QueuePanelProps) {
  const isCurrentPlayer = (player: Player | null) => player?.id === currentPlayerId
  const isMyTurn = (color: 'w' | 'b') => {
    const currentPlayer = color === 'w' ? currentWhitePlayer : currentBlackPlayer
    return turn === color && currentPlayer?.id === currentPlayerId
  }

  const renderPlayerList = (players: Player[], current: Player | null, color: 'w' | 'b') => {
    const colorName = color === 'w' ? 'White' : 'Black'
    const isActive = turn === color

    return (
      <div className={`flex-1 ${color === 'w' ? 'pr-3' : 'pl-3'}`}>
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-4 h-4 rounded-full ${color === 'w' ? 'bg-white' : 'bg-gray-900'} ring-1 ring-white/20`} />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            {colorName}
          </h3>
          {isActive && (
            <span className="ml-auto px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-chess-accent/20 text-chess-accent rounded-full animate-pulse">
              Playing
            </span>
          )}
        </div>

        {/* Current player */}
        {current ? (
          <div className={`p-3 rounded-lg mb-2 transition-all ${
            isActive ? 'bg-chess-accent/20 ring-1 ring-chess-accent/50' : 'bg-white/5'
          } ${isCurrentPlayer(current) ? 'ring-2 ring-yellow-400/50' : ''}`}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
              <span className={`text-sm font-medium ${isCurrentPlayer(current) ? 'text-yellow-400' : 'text-white'}`}>
                {current.name}
                {isCurrentPlayer(current) && ' (You)'}
              </span>
            </div>
            {isMyTurn(color) && (
              <p className="text-xs text-chess-accent mt-1 ml-4">Your turn to move!</p>
            )}
          </div>
        ) : (
          <div className="p-3 rounded-lg mb-2 bg-white/5 border border-dashed border-white/10">
            <span className="text-sm text-gray-500 italic">Waiting for player...</span>
          </div>
        )}

        {/* Queue */}
        {players.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
              Queue ({players.length})
            </p>
            {players.slice(0, 5).map((player, index) => (
              <div
                key={player.id}
                className={`px-2 py-1.5 rounded text-xs ${
                  player.id === currentPlayerId 
                    ? 'bg-yellow-400/10 text-yellow-400' 
                    : 'bg-white/5 text-gray-400'
                }`}
              >
                <span className="text-gray-600 mr-2">#{index + 1}</span>
                {player.name}
                {player.id === currentPlayerId && ' (You)'}
              </div>
            ))}
            {players.length > 5 && (
              <p className="text-[10px] text-gray-500 pl-2">
                +{players.length - 5} more waiting
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="card p-5 w-full max-w-md">
      <h2 className="font-serif text-xl mb-4 text-center">Player Queue</h2>
      
      <div className="flex divide-x divide-white/10">
        {renderPlayerList(whiteQueue, currentWhitePlayer, 'w')}
        {renderPlayerList(blackQueue, currentBlackPlayer, 'b')}
      </div>

      {/* Join/Leave buttons */}
      <div className="mt-5 pt-4 border-t border-white/10">
        {isInQueue ? (
          <button
            onClick={onLeaveQueue}
            className="w-full py-3 px-4 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 font-medium transition-all"
          >
            Leave Queue
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onJoinQueue('w')}
              className="py-3 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-all flex items-center justify-center gap-2"
            >
              <span className="w-3 h-3 rounded-full bg-white" />
              Play White
            </button>
            <button
              onClick={() => onJoinQueue('b')}
              className="py-3 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-all flex items-center justify-center gap-2"
            >
              <span className="w-3 h-3 rounded-full bg-gray-900 ring-1 ring-white/30" />
              Play Black
            </button>
          </div>
        )}
        
        {playerColor && (
          <p className="text-center text-sm text-gray-400 mt-3">
            You&apos;re playing as {playerColor === 'w' ? 'White' : 'Black'}
          </p>
        )}
      </div>
    </div>
  )
}
