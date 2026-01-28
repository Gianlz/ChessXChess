import { Chess, Square, Move } from 'chess.js'
import { getRedis, isRedisAvailable, REDIS_KEYS } from './redis'

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

export interface PersistedGameState {
  fen: string
  lastMove: { from: Square; to: Square } | null
  moveHistory: string[]
}

// In-memory fallback for local development without Redis
class InMemoryStore {
  private chess: Chess = new Chess()
  private whiteQueue: Player[] = []
  private blackQueue: Player[] = []
  private currentWhitePlayer: Player | null = null
  private currentBlackPlayer: Player | null = null
  private lastMove: { from: Square; to: Square } | null = null
  private version: number = 0

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

  getVersion(): number {
    return this.version
  }

  joinQueue(player: Player, color: 'w' | 'b'): boolean {
    const queue = color === 'w' ? this.whiteQueue : this.blackQueue
    const currentPlayer = color === 'w' ? this.currentWhitePlayer : this.currentBlackPlayer

    if (queue.some(p => p.id === player.id)) return false
    if (currentPlayer?.id === player.id) return false

    queue.push(player)

    if (!currentPlayer) {
      this.assignNextPlayer(color)
    }

    this.version++
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

    this.version++
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

    if (currentPlayer?.id !== playerId) {
      return { success: false, error: 'Not your turn' }
    }

    try {
      const move = this.chess.move({ from, to, promotion })
      if (move) {
        this.lastMove = { from, to }
        
        const queue = currentTurn === 'w' ? this.whiteQueue : this.blackQueue
        queue.push(currentPlayer)
        
        if (currentTurn === 'w') {
          this.currentWhitePlayer = null
          this.assignNextPlayer('w')
        } else {
          this.currentBlackPlayer = null
          this.assignNextPlayer('b')
        }

        this.version++
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
    this.version++
  }
}

// Redis-backed store for production
class RedisStore {
  private async getPersistedGame(): Promise<PersistedGameState | null> {
    const redis = getRedis()
    if (!redis) return null
    try {
      return await redis.get<PersistedGameState>(REDIS_KEYS.GAME_STATE)
    } catch (err) {
      console.error('Redis getPersistedGame error:', err)
      return null
    }
  }

  private async setPersistedGame(state: PersistedGameState): Promise<void> {
    const redis = getRedis()
    if (!redis) return
    try {
      await redis.set(REDIS_KEYS.GAME_STATE, state)
    } catch (err) {
      console.error('Redis setPersistedGame error:', err)
    }
  }

  private async getQueue(color: 'w' | 'b'): Promise<Player[]> {
    const redis = getRedis()
    if (!redis) return []
    try {
      const key = color === 'w' ? REDIS_KEYS.WHITE_QUEUE : REDIS_KEYS.BLACK_QUEUE
      const queue = await redis.get<Player[]>(key)
      return queue || []
    } catch (err) {
      console.error('Redis getQueue error:', err)
      return []
    }
  }

  private async setQueue(color: 'w' | 'b', queue: Player[]): Promise<void> {
    const redis = getRedis()
    if (!redis) return
    try {
      const key = color === 'w' ? REDIS_KEYS.WHITE_QUEUE : REDIS_KEYS.BLACK_QUEUE
      await redis.set(key, queue)
    } catch (err) {
      console.error('Redis setQueue error:', err)
    }
  }

  private async getCurrentPlayer(color: 'w' | 'b'): Promise<Player | null> {
    const redis = getRedis()
    if (!redis) return null
    try {
      const key = color === 'w' ? REDIS_KEYS.CURRENT_WHITE : REDIS_KEYS.CURRENT_BLACK
      return await redis.get<Player>(key)
    } catch (err) {
      console.error('Redis getCurrentPlayer error:', err)
      return null
    }
  }

  private async setCurrentPlayer(color: 'w' | 'b', player: Player | null): Promise<void> {
    const redis = getRedis()
    if (!redis) return
    try {
      const key = color === 'w' ? REDIS_KEYS.CURRENT_WHITE : REDIS_KEYS.CURRENT_BLACK
      if (player) {
        await redis.set(key, player)
      } else {
        await redis.del(key)
      }
    } catch (err) {
      console.error('Redis setCurrentPlayer error:', err)
    }
  }

  async getVersion(): Promise<number> {
    const redis = getRedis()
    if (!redis) return 0
    try {
      const version = await redis.get<number>(REDIS_KEYS.VERSION)
      return version || 0
    } catch (err) {
      console.error('Redis getVersion error:', err)
      return 0
    }
  }

  private async incrementVersion(): Promise<void> {
    const redis = getRedis()
    if (!redis) return
    try {
      await redis.incr(REDIS_KEYS.VERSION)
    } catch (err) {
      console.error('Redis incrementVersion error:', err)
    }
  }

  async getGameState(): Promise<GameState> {
    const persisted = await this.getPersistedGame()
    const chess = new Chess()
    
    if (persisted?.fen) {
      chess.load(persisted.fen)
    }

    return {
      fen: chess.fen(),
      turn: chess.turn(),
      isGameOver: chess.isGameOver(),
      isCheckmate: chess.isCheckmate(),
      isStalemate: chess.isStalemate(),
      isDraw: chess.isDraw(),
      isCheck: chess.isCheck(),
      winner: chess.isCheckmate() ? (chess.turn() === 'w' ? 'b' : 'w') : null,
      lastMove: persisted?.lastMove || null,
      moveHistory: persisted?.moveHistory || [],
    }
  }

  async getQueueState(): Promise<QueueState> {
    const [whiteQueue, blackQueue, currentWhitePlayer, currentBlackPlayer] = await Promise.all([
      this.getQueue('w'),
      this.getQueue('b'),
      this.getCurrentPlayer('w'),
      this.getCurrentPlayer('b'),
    ])

    return {
      whiteQueue,
      blackQueue,
      currentWhitePlayer,
      currentBlackPlayer,
    }
  }

  private async assignNextPlayer(color: 'w' | 'b'): Promise<void> {
    const queue = await this.getQueue(color)
    if (queue.length > 0) {
      const nextPlayer = queue.shift()!
      await this.setQueue(color, queue)
      await this.setCurrentPlayer(color, nextPlayer)
    }
  }

  async joinQueue(player: Player, color: 'w' | 'b'): Promise<boolean> {
    const redis = getRedis()
    if (!redis) {
      throw new Error('Redis not available - cannot join queue')
    }

    const queue = await this.getQueue(color)
    const currentPlayer = await this.getCurrentPlayer(color)

    if (queue.some(p => p.id === player.id)) return false
    if (currentPlayer?.id === player.id) return false

    queue.push(player)
    await this.setQueue(color, queue)

    if (!currentPlayer) {
      await this.assignNextPlayer(color)
    }

    await this.incrementVersion()
    return true
  }

  async leaveQueue(playerId: string): Promise<void> {
    let whiteQueue = await this.getQueue('w')
    let blackQueue = await this.getQueue('b')
    const currentWhite = await this.getCurrentPlayer('w')
    const currentBlack = await this.getCurrentPlayer('b')

    whiteQueue = whiteQueue.filter(p => p.id !== playerId)
    blackQueue = blackQueue.filter(p => p.id !== playerId)

    await this.setQueue('w', whiteQueue)
    await this.setQueue('b', blackQueue)

    if (currentWhite?.id === playerId) {
      await this.setCurrentPlayer('w', null)
      await this.assignNextPlayer('w')
    }
    if (currentBlack?.id === playerId) {
      await this.setCurrentPlayer('b', null)
      await this.assignNextPlayer('b')
    }

    await this.incrementVersion()
  }

  async makeMove(playerId: string, from: Square, to: Square, promotion?: string): Promise<{ success: boolean; error?: string }> {
    const persisted = await this.getPersistedGame()
    const chess = new Chess()
    
    if (persisted?.fen) {
      chess.load(persisted.fen)
    }

    const currentTurn = chess.turn()
    const currentPlayer = await this.getCurrentPlayer(currentTurn)

    if (currentPlayer?.id !== playerId) {
      return { success: false, error: 'Not your turn' }
    }

    try {
      const move = chess.move({ from, to, promotion })
      if (move) {
        // Save game state
        await this.setPersistedGame({
          fen: chess.fen(),
          lastMove: { from, to },
          moveHistory: chess.history(),
        })
        
        // Move current player to back of queue
        const queue = await this.getQueue(currentTurn)
        queue.push(currentPlayer)
        await this.setQueue(currentTurn, queue)
        
        // Assign next player
        await this.setCurrentPlayer(currentTurn, null)
        await this.assignNextPlayer(currentTurn)

        await this.incrementVersion()
        return { success: true }
      }
      return { success: false, error: 'Invalid move' }
    } catch {
      return { success: false, error: 'Invalid move' }
    }
  }

  async getValidMoves(square: Square): Promise<Move[]> {
    const persisted = await this.getPersistedGame()
    const chess = new Chess()
    
    if (persisted?.fen) {
      chess.load(persisted.fen)
    }

    return chess.moves({ square, verbose: true })
  }

  async resetGame(): Promise<void> {
    await this.setPersistedGame({
      fen: new Chess().fen(),
      lastMove: null,
      moveHistory: [],
    })
    await this.incrementVersion()
  }
}

// Singleton instances
const inMemoryStore = new InMemoryStore()
const redisStore = new RedisStore()

export const gameStore = {
  async getGameState(): Promise<GameState> {
    if (isRedisAvailable()) {
      return await redisStore.getGameState()
    }
    return inMemoryStore.getGameState()
  },

  async getQueueState(): Promise<QueueState> {
    if (isRedisAvailable()) {
      return await redisStore.getQueueState()
    }
    return inMemoryStore.getQueueState()
  },

  async getVersion(): Promise<number> {
    if (isRedisAvailable()) {
      return await redisStore.getVersion()
    }
    return inMemoryStore.getVersion()
  },

  async joinQueue(player: Player, color: 'w' | 'b'): Promise<boolean> {
    if (isRedisAvailable()) {
      return await redisStore.joinQueue(player, color)
    }
    return inMemoryStore.joinQueue(player, color)
  },

  async leaveQueue(playerId: string): Promise<void> {
    if (isRedisAvailable()) {
      return await redisStore.leaveQueue(playerId)
    }
    return inMemoryStore.leaveQueue(playerId)
  },

  async makeMove(playerId: string, from: Square, to: Square, promotion?: string): Promise<{ success: boolean; error?: string }> {
    if (isRedisAvailable()) {
      return await redisStore.makeMove(playerId, from, to, promotion)
    }
    return inMemoryStore.makeMove(playerId, from, to, promotion)
  },

  async getValidMoves(square: Square): Promise<Move[]> {
    if (isRedisAvailable()) {
      return await redisStore.getValidMoves(square)
    }
    return inMemoryStore.getValidMoves(square)
  },

  async resetGame(): Promise<void> {
    if (isRedisAvailable()) {
      return await redisStore.resetGame()
    }
    return inMemoryStore.resetGame()
  },
}
