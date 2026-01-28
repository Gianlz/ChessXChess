'use client'

import { useState, useCallback } from 'react'
import { Square } from 'chess.js'

interface ChessBoardProps {
  fen: string
  lastMove: { from: Square; to: Square } | null
  isCheck: boolean
  turn: 'w' | 'b'
  validMoves: Square[]
  selectedSquare: Square | null
  onSquareClick: (square: Square) => void
  canPlay: boolean
}

const PIECE_SYMBOLS: Record<string, string> = {
  'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
  'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟',
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1']

function parseFen(fen: string): (string | null)[][] {
  const board: (string | null)[][] = []
  const [position] = fen.split(' ')
  const rows = position.split('/')
  
  for (const row of rows) {
    const boardRow: (string | null)[] = []
    for (const char of row) {
      if (isNaN(parseInt(char))) {
        boardRow.push(char)
      } else {
        for (let i = 0; i < parseInt(char); i++) {
          boardRow.push(null)
        }
      }
    }
    board.push(boardRow)
  }
  
  return board
}

function findKingPosition(board: (string | null)[][], color: 'w' | 'b'): Square | null {
  const king = color === 'w' ? 'K' : 'k'
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      if (board[rank][file] === king) {
        return `${FILES[file]}${RANKS[rank]}` as Square
      }
    }
  }
  return null
}

export default function ChessBoard({
  fen,
  lastMove,
  isCheck,
  turn,
  validMoves,
  selectedSquare,
  onSquareClick,
  canPlay,
}: ChessBoardProps) {
  const board = parseFen(fen)
  const kingInCheck = isCheck ? findKingPosition(board, turn) : null
  const [hoveredSquare, setHoveredSquare] = useState<Square | null>(null)

  const isLightSquare = useCallback((file: number, rank: number) => {
    return (file + rank) % 2 === 0
  }, [])

  const getSquareClasses = useCallback((square: Square, file: number, rank: number, piece: string | null) => {
    const classes: string[] = [
      'relative flex items-center justify-center',
      'aspect-square',
      'transition-all duration-150',
    ]

    // Base color
    if (isLightSquare(file, rank)) {
      classes.push('bg-[#f0d9b5]')
    } else {
      classes.push('bg-[#b58863]')
    }

    // Last move highlight
    if (lastMove && (square === lastMove.from || square === lastMove.to)) {
      classes.push('!bg-yellow-500/40')
    }

    // Selected square
    if (selectedSquare === square) {
      classes.push('ring-4 ring-inset ring-yellow-400/80')
    }

    // King in check
    if (kingInCheck === square) {
      classes.push('!bg-red-500/60')
    }

    // Valid move indicator
    if (validMoves.includes(square)) {
      if (piece) {
        classes.push('chess-square-capture')
      } else {
        classes.push('chess-square-valid-move')
      }
    }

    // Hover effect for playable squares
    if (canPlay && hoveredSquare === square) {
      classes.push('brightness-110')
    }

    return classes.join(' ')
  }, [isLightSquare, lastMove, selectedSquare, kingInCheck, validMoves, canPlay, hoveredSquare])

  return (
    <div className="relative">
      {/* Board container with shadow and border */}
      <div className="rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10">
        <div className="grid grid-cols-8 w-[min(90vw,500px)] md:w-[min(70vw,600px)] aspect-square">
          {RANKS.map((rank, rankIndex) =>
            FILES.map((file, fileIndex) => {
              const square = `${file}${rank}` as Square
              const piece = board[rankIndex][fileIndex]

              return (
                <button
                  key={square}
                  className={getSquareClasses(square, fileIndex, rankIndex, piece)}
                  onClick={() => onSquareClick(square)}
                  onMouseEnter={() => setHoveredSquare(square)}
                  onMouseLeave={() => setHoveredSquare(null)}
                  disabled={!canPlay}
                  aria-label={`${file}${rank}${piece ? ` with ${piece}` : ''}`}
                >
                  {/* Coordinate labels */}
                  {fileIndex === 0 && (
                    <span className={`absolute top-0.5 left-1 text-[10px] font-semibold ${
                      isLightSquare(fileIndex, rankIndex) ? 'text-[#b58863]' : 'text-[#f0d9b5]'
                    }`}>
                      {rank}
                    </span>
                  )}
                  {rankIndex === 7 && (
                    <span className={`absolute bottom-0.5 right-1 text-[10px] font-semibold ${
                      isLightSquare(fileIndex, rankIndex) ? 'text-[#b58863]' : 'text-[#f0d9b5]'
                    }`}>
                      {file}
                    </span>
                  )}

                  {/* Chess piece */}
                  {piece && (
                    <span
                      className={`chess-piece text-4xl md:text-5xl select-none ${
                        piece === piece.toUpperCase() ? 'text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]' : 'text-gray-900 drop-shadow-[0_2px_2px_rgba(255,255,255,0.3)]'
                      }`}
                      style={{ 
                        filter: piece === piece.toUpperCase() 
                          ? 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))' 
                          : 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))'
                      }}
                    >
                      {PIECE_SYMBOLS[piece]}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
