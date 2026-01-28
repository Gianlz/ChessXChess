'use client'

import { useState, useCallback } from 'react'
import { Square } from 'chess.js'
import ChessBoard from '@/components/ChessBoard'
import QueuePanel from '@/components/QueuePanel'
import GameStatus from '@/components/GameStatus'
import MoveHistory from '@/components/MoveHistory'
import PromotionModal from '@/components/PromotionModal'
import MusicPlayer from '@/components/MusicPlayer'
import ShaderBackground from '@/components/ShaderBackground'
import { useGame } from '@/hooks/useGame'

export default function Home() {
  const {
    gameState,
    queueState,
    playerId,
    playerName,
    playerColor,
    isInQueue,
    selectedSquare,
    validMoves,
    canPlay,
    error,
    setPlayerName,
    joinQueue,
    leaveQueue,
    selectSquare,
    makeMove,
    resetGame,
  } = useGame()

  const [nameInput, setNameInput] = useState('')
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null)

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (nameInput.trim()) {
      setPlayerName(nameInput.trim())
    }
  }

  const handleSquareClick = useCallback(async (square: Square) => {
    if (!canPlay || !gameState) return

    // If we have a selected square and clicking on a valid move
    if (selectedSquare && validMoves.includes(square)) {
      // Check for pawn promotion
      const isPromotion = checkForPromotion(selectedSquare, square, gameState.fen)
      if (isPromotion) {
        setPendingPromotion({ from: selectedSquare, to: square })
        return
      }
      await makeMove(selectedSquare, square)
      return
    }

    // Otherwise, select the square (this will fetch and set valid moves)
    await selectSquare(square)
  }, [canPlay, gameState, selectedSquare, validMoves, makeMove, selectSquare])

  const handlePromotion = async (piece: string) => {
    if (pendingPromotion) {
      await makeMove(pendingPromotion.from, pendingPromotion.to, piece)
      setPendingPromotion(null)
    }
  }

  const cancelPromotion = () => {
    setPendingPromotion(null)
  }

  // Check if a move would be a pawn promotion
  function checkForPromotion(from: Square, to: Square, fen: string): boolean {
    const fromRank = from[1]
    const toRank = to[1]
    const piece = getPieceAtSquare(from, fen)
    
    if (!piece) return false
    const isPawn = piece.toLowerCase() === 'p'
    const isWhitePromotion = piece === 'P' && fromRank === '7' && toRank === '8'
    const isBlackPromotion = piece === 'p' && fromRank === '2' && toRank === '1'
    
    return isPawn && (isWhitePromotion || isBlackPromotion)
  }

  function getPieceAtSquare(square: Square, fen: string): string | null {
    const [position] = fen.split(' ')
    const ranks = position.split('/')
    const file = square.charCodeAt(0) - 'a'.charCodeAt(0)
    const rank = 8 - parseInt(square[1])
    
    let currentFile = 0
    for (const char of ranks[rank]) {
      if (isNaN(parseInt(char))) {
        if (currentFile === file) return char
        currentFile++
      } else {
        currentFile += parseInt(char)
        if (currentFile > file) return null
      }
    }
    return null
  }

  // Loading state
  if (!gameState || !queueState) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <ShaderBackground speed={0.5} intensity={0.8} />
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-chess-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Connecting to game...</p>
        </div>
      </main>
    )
  }

  // Name entry
  if (!playerName) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <ShaderBackground speed={0.6} intensity={1.0} />
        <div className="card p-8 max-w-md w-full text-center">
          <h1 className="font-serif text-4xl mb-2">ChessXChess</h1>
          <p className="text-gray-400 mb-8">Collaborative Chess</p>
          
          <form onSubmit={handleNameSubmit} className="space-y-4">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-chess-accent/50"
              autoFocus
              maxLength={20}
            />
            <button
              type="submit"
              disabled={!nameInput.trim()}
              className="w-full py-3 px-4 bg-chess-accent hover:bg-chess-accent/80 disabled:bg-white/10 disabled:text-gray-500 text-white font-medium rounded-xl transition-all"
            >
              Enter Game
            </button>
          </form>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* WebGL Shader Background */}
      <ShaderBackground speed={0.8} intensity={1.2} />
      
      {/* Music Player */}
      <MusicPlayer />

      {/* Error toast */}
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 glass rounded-full px-6 py-3 text-red-400">
          {error}
        </div>
      )}

      {/* Promotion modal */}
      {pendingPromotion && playerColor && (
        <PromotionModal
          color={playerColor}
          onSelect={handlePromotion}
          onCancel={cancelPromotion}
        />
      )}

      {/* Header */}
      <header className="p-4 md:p-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl md:text-3xl">ChessXChess</h1>
            <p className="text-sm text-gray-400">Collaborative Chess</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">
              Playing as <span className="text-white font-medium">{playerName}</span>
            </span>
            {gameState.isGameOver && (
              <button
                onClick={resetGame}
                className="px-4 py-2 bg-chess-accent hover:bg-chess-accent/80 text-white text-sm font-medium rounded-lg transition-all"
              >
                New Game
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-6 p-4 md:p-6">
        {/* Left panel - Queue */}
        <div className="w-full lg:w-auto order-2 lg:order-1">
          <QueuePanel
            whiteQueue={queueState.whiteQueue}
            blackQueue={queueState.blackQueue}
            currentWhitePlayer={queueState.currentWhitePlayer}
            currentBlackPlayer={queueState.currentBlackPlayer}
            currentPlayerId={playerId}
            turn={gameState.turn}
            onJoinQueue={joinQueue}
            onLeaveQueue={leaveQueue}
            isInQueue={isInQueue}
            playerColor={playerColor}
          />
        </div>

        {/* Center - Chess board */}
        <div className="order-1 lg:order-2 flex flex-col items-center gap-4">
          <ChessBoard
            fen={gameState.fen}
            lastMove={gameState.lastMove}
            isCheck={gameState.isCheck}
            turn={gameState.turn}
            validMoves={validMoves}
            selectedSquare={selectedSquare}
            onSquareClick={handleSquareClick}
            canPlay={canPlay}
          />
        </div>

        {/* Right panel - Move history */}
        <div className="w-full lg:w-auto order-3 hidden lg:block">
          <MoveHistory moves={gameState.moveHistory} />
        </div>
      </div>

      {/* Bottom status bar */}
      <footer className="p-4 md:p-6 flex justify-center">
        <GameStatus
          turn={gameState.turn}
          isCheck={gameState.isCheck}
          isCheckmate={gameState.isCheckmate}
          isStalemate={gameState.isStalemate}
          isDraw={gameState.isDraw}
          winner={gameState.winner}
          moveCount={gameState.moveHistory.length}
        />
      </footer>
    </main>
  )
}
