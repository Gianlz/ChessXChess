'use client'

interface GameStatusProps {
  turn: 'w' | 'b'
  isCheck: boolean
  isCheckmate: boolean
  isStalemate: boolean
  isDraw: boolean
  winner: 'w' | 'b' | null
  moveCount: number
}

export default function GameStatus({
  turn,
  isCheck,
  isCheckmate,
  isStalemate,
  isDraw,
  winner,
  moveCount,
}: GameStatusProps) {
  const getStatusMessage = () => {
    if (isCheckmate) {
      return {
        title: 'Checkmate!',
        subtitle: `${winner === 'w' ? 'White' : 'Black'} wins`,
        color: 'text-green-400',
      }
    }
    if (isStalemate) {
      return {
        title: 'Stalemate',
        subtitle: 'Game drawn',
        color: 'text-yellow-400',
      }
    }
    if (isDraw) {
      return {
        title: 'Draw',
        subtitle: 'Game ended in a draw',
        color: 'text-yellow-400',
      }
    }
    if (isCheck) {
      return {
        title: 'Check!',
        subtitle: `${turn === 'w' ? 'White' : 'Black'} is in check`,
        color: 'text-red-400',
      }
    }
    return {
      title: `${turn === 'w' ? 'White' : 'Black'} to move`,
      subtitle: `Move ${Math.floor(moveCount / 2) + 1}`,
      color: 'text-white',
    }
  }

  const status = getStatusMessage()

  return (
    <div className="glass rounded-full px-6 py-3 flex items-center gap-4">
      <div className={`w-4 h-4 rounded-full ${turn === 'w' ? 'bg-white' : 'bg-gray-900'} ring-2 ring-white/20`} />
      <div>
        <p className={`font-semibold ${status.color}`}>{status.title}</p>
        <p className="text-xs text-gray-400">{status.subtitle}</p>
      </div>
    </div>
  )
}
