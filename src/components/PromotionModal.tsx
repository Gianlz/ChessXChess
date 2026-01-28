'use client'

interface PromotionModalProps {
  color: 'w' | 'b'
  onSelect: (piece: string) => void
  onCancel: () => void
}

const PIECES = [
  { key: 'q', white: '♕', black: '♛', name: 'Queen' },
  { key: 'r', white: '♖', black: '♜', name: 'Rook' },
  { key: 'b', white: '♗', black: '♝', name: 'Bishop' },
  { key: 'n', white: '♘', black: '♞', name: 'Knight' },
]

export default function PromotionModal({ color, onSelect, onCancel }: PromotionModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="card p-6 animate-float">
        <h3 className="font-serif text-xl mb-4 text-center">Promote Pawn</h3>
        <div className="grid grid-cols-4 gap-3">
          {PIECES.map((piece) => (
            <button
              key={piece.key}
              onClick={() => onSelect(piece.key)}
              className="w-16 h-16 rounded-xl bg-white/10 hover:bg-chess-accent/30 transition-all flex items-center justify-center text-4xl"
              aria-label={`Promote to ${piece.name}`}
            >
              <span className={color === 'w' ? 'text-white drop-shadow-lg' : 'text-gray-900'}>
                {color === 'w' ? piece.white : piece.black}
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="w-full mt-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
