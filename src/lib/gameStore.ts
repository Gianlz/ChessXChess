import { Chess, Square, Move } from 'chess.js'

export interface Player {
  id: string
  name: string
  joinedAt: number
}

export interface GameState {
  fen: string
  turn: 'w' | 'b'
  isGameOver: boolean
  isCheckmate: boolean
  isStalemate: boolean
  isDraw: boolean
  isCheck: boolean
  winner: 'w' | 'b' | null
  lastMove: { from: Square; to: Square } | null
  moveHistory: string[]
}

export interface QueueState {
  whiteQueue: Player[]
  blackQueue: Player[]
  currentWhitePlayer: Player | null
  currentBlackPlayer: Player | null
}

class GameStore {
  private chess: Chess
  private whiteQueue: Player[] = []
  private blackQueue: Player[] = []
  private currentWhitePlayer: Player | null = null
  private currentBlackPlayer: Player | null = null
  private lastMove: { from: Square; to: Square } | null = null
  private listeners: Set<() => void> = new Set()

  constructor() {
    this.chess = new Chess()
  }

  getGameState(): GameState {
    return {
      fen: this.chess.fen(),
      turn: this.chess.turn(),
      isGameOver: this.chess.isGameOver(),
      isCheckmate: this.chess.isCheckmate(),
      isStalemate: this.chess.isStalemate(),
      isDraw: this.chess.isDraw(),
      isCheck: this.chess.isCheck(),
      winner: this.chess.isCheckmate() ? (this.chess.turn() === 'w' ? 'b' : 'w') : null,
      lastMove: this.lastMove,
      moveHistory: this.chess.history(),
    }
  }

  getQueueState(): QueueState {
    return {
      whiteQueue: [...this.whiteQueue],
      blackQueue: [...this.blackQueue],
      currentWhitePlayer: this.currentWhitePlayer,
      currentBlackPlayer: this.currentBlackPlayer,
    }
  }

  joinQueue(player: Player, color: 'w' | 'b'): boolean {
    const queue = color === 'w' ? this.whiteQueue : this.blackQueue
    const currentPlayer = color === 'w' ? this.currentWhitePlayer : this.currentBlackPlayer

    // Check if player is already in queue or playing
    if (queue.some(p => p.id === player.id)) return false
    if (currentPlayer?.id === player.id) return false

    queue.push(player)

    // If no current player, assign this one
    if (!currentPlayer) {
      this.assignNextPlayer(color)
    }

    this.notifyListeners()
    return true
  }

  leaveQueue(playerId: string): void {
    this.whiteQueue = this.whiteQueue.filter(p => p.id !== playerId)
    this.blackQueue = this.blackQueue.filter(p => p.id !== playerId)

    if (this.currentWhitePlayer?.id === playerId) {
      this.currentWhitePlayer = null
      this.assignNextPlayer('w')
    }
    if (this.currentBlackPlayer?.id === playerId) {
      this.currentBlackPlayer = null
      this.assignNextPlayer('b')
    }

    this.notifyListeners()
  }

  private assignNextPlayer(color: 'w' | 'b'): void {
    const queue = color === 'w' ? this.whiteQueue : this.blackQueue
    if (queue.length > 0) {
      const nextPlayer = queue.shift()!
      if (color === 'w') {
        this.currentWhitePlayer = nextPlayer
      } else {
        this.currentBlackPlayer = nextPlayer
      }
    }
  }

  makeMove(playerId: string, from: Square, to: Square, promotion?: string): { success: boolean; error?: string } {
    const currentTurn = this.chess.turn()
    const currentPlayer = currentTurn === 'w' ? this.currentWhitePlayer : this.currentBlackPlayer

    // Check if it's this player's turn
    if (currentPlayer?.id !== playerId) {
      return { success: false, error: 'Not your turn' }
    }

    try {
      const move = this.chess.move({ from, to, promotion })
      if (move) {
        this.lastMove = { from, to }
        
        // Move current player to back of queue and assign next
        const queue = currentTurn === 'w' ? this.whiteQueue : this.blackQueue
        queue.push(currentPlayer)
        
        if (currentTurn === 'w') {
          this.currentWhitePlayer = null
          this.assignNextPlayer('w')
        } else {
          this.currentBlackPlayer = null
          this.assignNextPlayer('b')
        }

        this.notifyListeners()
        return { success: true }
      }
      return { success: false, error: 'Invalid move' }
    } catch {
      return { success: false, error: 'Invalid move' }
    }
  }

  getValidMoves(square: Square): Move[] {
    return this.chess.moves({ square, verbose: true })
  }

  resetGame(): void {
    this.chess.reset()
    this.lastMove = null
    this.notifyListeners()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener())
  }
}

// Singleton instance
export const gameStore = new GameStore()
