import { Chess, Square, Move } from 'chess.js'
import { getRedis, isRedisAvailable, REDIS_KEYS } from './redis'

export interface Player {
  id: string
  name: string
  joinedAt: number
}

export interface TurnState {
  status: 'pending_confirmation' | 'confirmed'
  deadline: number // Unix timestamp in ms
}

// Constants for timeouts
export const CONFIRMATION_TIMEOUT_MS = 10000 // 10 seconds to confirm
export const MOVE_TIMEOUT_MS = 30000 // 30 seconds to make a move

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
  whiteTurnState: TurnState | null
  blackTurnState: TurnState | null
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
  private whiteTurnState: TurnState | null = null
  private blackTurnState: TurnState | null = null
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
      whiteTurnState: this.whiteTurnState,
      blackTurnState: this.blackTurnState,
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
      const turnState: TurnState = {
        status: 'pending_confirmation',
        deadline: Date.now() + CONFIRMATION_TIMEOUT_MS,
      }
      if (color === 'w') {
        this.currentWhitePlayer = nextPlayer
        this.whiteTurnState = turnState
      } else {
        this.currentBlackPlayer = nextPlayer
        this.blackTurnState = turnState
      }
    } else {
      if (color === 'w') {
        this.whiteTurnState = null
      } else {
        this.blackTurnState = null
      }
    }
  }

  confirmReady(playerId: string): { success: boolean; error?: string } {
    const turn = this.chess.turn()
    const currentPlayer = turn === 'w' ? this.currentWhitePlayer : this.currentBlackPlayer
    const turnState = turn === 'w' ? this.whiteTurnState : this.blackTurnState

    if (currentPlayer?.id !== playerId) {
      return { success: false, error: 'Not your turn' }
    }

    if (!turnState || turnState.status !== 'pending_confirmation') {
      return { success: false, error: 'No confirmation needed' }
    }

    if (Date.now() > turnState.deadline) {
      return { success: false, error: 'Confirmation timeout' }
    }

    const newTurnState: TurnState = {
      status: 'confirmed',
      deadline: Date.now() + MOVE_TIMEOUT_MS,
    }

    if (turn === 'w') {
      this.whiteTurnState = newTurnState
    } else {
      this.blackTurnState = newTurnState
    }

    this.version++
    return { success: true }
  }

  checkAndExpireTurns(): boolean {
    const now = Date.now()
    let changed = false
    const turn = this.chess.turn()

    // Only check the current turn's player
    if (turn === 'w' && this.currentWhitePlayer && this.whiteTurnState) {
      if (now > this.whiteTurnState.deadline) {
        // Player timed out - remove them and assign next
        this.currentWhitePlayer = null
        this.whiteTurnState = null
        this.assignNextPlayer('w')
        changed = true
      }
    } else if (turn === 'b' && this.currentBlackPlayer && this.blackTurnState) {
      if (now > this.blackTurnState.deadline) {
        // Player timed out - remove them and assign next
        this.currentBlackPlayer = null
        this.blackTurnState = null
        this.assignNextPlayer('b')
        changed = true
      }
    }

    if (changed) {
      this.version++
    }
    return changed
  }

  makeMove(playerId: string, from: Square, to: Square, promotion?: string): { success: boolean; error?: string } {
    const currentTurn = this.chess.turn()
    const currentPlayer = currentTurn === 'w' ? this.currentWhitePlayer : this.currentBlackPlayer
    const turnState = currentTurn === 'w' ? this.whiteTurnState : this.blackTurnState

    if (currentPlayer?.id !== playerId) {
      return { success: false, error: 'Not your turn' }
    }

    // Must be confirmed to make a move
    if (!turnState || turnState.status !== 'confirmed') {
      return { success: false, error: 'Please confirm you are ready first' }
    }

    // Check if move timer expired
    if (Date.now() > turnState.deadline) {
      return { success: false, error: 'Move timeout - you took too long' }
    }

    try {
      const move = this.chess.move({ from, to, promotion })
      if (move) {
        this.lastMove = { from, to }
        
        const queue = currentTurn === 'w' ? this.whiteQueue : this.blackQueue
        queue.push(currentPlayer)
        
        if (currentTurn === 'w') {
          this.currentWhitePlayer = null
          this.whiteTurnState = null
          this.assignNextPlayer('w')
        } else {
          this.currentBlackPlayer = null
          this.blackTurnState = null
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

  clearAllQueues(): void {
    this.whiteQueue = []
    this.blackQueue = []
    this.currentWhitePlayer = null
    this.currentBlackPlayer = null
    this.whiteTurnState = null
    this.blackTurnState = null
    this.chess.reset()
    this.lastMove = null
    this.version++
  }

  kickPlayerByName(playerName: string): boolean {
    let found = false
    
    const whiteLen = this.whiteQueue.length
    this.whiteQueue = this.whiteQueue.filter(p => p.name !== playerName)
    if (this.whiteQueue.length !== whiteLen) found = true
    
    const blackLen = this.blackQueue.length
    this.blackQueue = this.blackQueue.filter(p => p.name !== playerName)
    if (this.blackQueue.length !== blackLen) found = true
    
    if (this.currentWhitePlayer?.name === playerName) {
      this.currentWhitePlayer = null
      this.assignNextPlayer('w')
      found = true
    }
    
    if (this.currentBlackPlayer?.name === playerName) {
      this.currentBlackPlayer = null
      this.assignNextPlayer('b')
      found = true
    }
    
    if (found) this.version++
    return found
  }
}

// Redis-backed store for production with batched operations
class RedisStore {
  async getVersion(): Promise<number> {
    const redis = getRedis()
    if (!redis) return 0
    const version = await redis.get<number>(REDIS_KEYS.VERSION)
    return version || 0
  }

  async getGameState(): Promise<GameState> {
    const redis = getRedis()
    if (!redis) {
      const chess = new Chess()
      return {
        fen: chess.fen(),
        turn: chess.turn(),
        isGameOver: false,
        isCheckmate: false,
        isStalemate: false,
        isDraw: false,
        isCheck: false,
        winner: null,
        lastMove: null,
        moveHistory: [],
      }
    }

    const persisted = await redis.get<PersistedGameState>(REDIS_KEYS.GAME_STATE)
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
    const redis = getRedis()
    if (!redis) {
      return {
        whiteQueue: [],
        blackQueue: [],
        currentWhitePlayer: null,
        currentBlackPlayer: null,
        whiteTurnState: null,
        blackTurnState: null,
      }
    }

    const [whiteQueue, blackQueue, currentWhitePlayer, currentBlackPlayer, whiteTurnState, blackTurnState] = await Promise.all([
      redis.get<Player[]>(REDIS_KEYS.WHITE_QUEUE),
      redis.get<Player[]>(REDIS_KEYS.BLACK_QUEUE),
      redis.get<Player>(REDIS_KEYS.CURRENT_WHITE),
      redis.get<Player>(REDIS_KEYS.CURRENT_BLACK),
      redis.get<TurnState>(REDIS_KEYS.TURN_WHITE),
      redis.get<TurnState>(REDIS_KEYS.TURN_BLACK),
    ])

    return {
      whiteQueue: whiteQueue || [],
      blackQueue: blackQueue || [],
      currentWhitePlayer: currentWhitePlayer || null,
      currentBlackPlayer: currentBlackPlayer || null,
      whiteTurnState: whiteTurnState || null,
      blackTurnState: blackTurnState || null,
    }
  }

  async joinQueue(player: Player, color: 'w' | 'b'): Promise<boolean> {
    const redis = getRedis()
    if (!redis) {
      throw new Error('Redis not available - cannot join queue')
    }

    // Batch fetch relevant data
    const queueKey = color === 'w' ? REDIS_KEYS.WHITE_QUEUE : REDIS_KEYS.BLACK_QUEUE
    const currentKey = color === 'w' ? REDIS_KEYS.CURRENT_WHITE : REDIS_KEYS.CURRENT_BLACK

    const [queueData, currentPlayer] = await Promise.all([
      redis.get<Player[]>(queueKey),
      redis.get<Player>(currentKey),
    ])

    const queue = queueData || []

    // Check if already in queue or is current player
    if (queue.some(p => p.id === player.id)) return false
    if (currentPlayer?.id === player.id) return false

    // Add to queue
    queue.push(player)

    // Batch write operations
    const ops: Promise<unknown>[] = []
    const turnKey = color === 'w' ? REDIS_KEYS.TURN_WHITE : REDIS_KEYS.TURN_BLACK

    // If no current player, assign from queue
    if (!currentPlayer && queue.length > 0) {
      const nextPlayer = queue.shift()!
      const turnState: TurnState = {
        status: 'pending_confirmation',
        deadline: Date.now() + CONFIRMATION_TIMEOUT_MS,
      }
      ops.push(
        redis.set(queueKey, queue),
        redis.set(currentKey, nextPlayer),
        redis.set(turnKey, turnState)
      )
    } else {
      ops.push(redis.set(queueKey, queue))
    }

    ops.push(redis.incr(REDIS_KEYS.VERSION))
    await Promise.all(ops)

    return true
  }

  async confirmReady(playerId: string): Promise<{ success: boolean; error?: string }> {
    const redis = getRedis()
    if (!redis) {
      return { success: false, error: 'Redis not available' }
    }

    // Get current game state to determine whose turn it is
    const [persisted, currentWhite, currentBlack, whiteTurnState, blackTurnState] = await Promise.all([
      redis.get<PersistedGameState>(REDIS_KEYS.GAME_STATE),
      redis.get<Player>(REDIS_KEYS.CURRENT_WHITE),
      redis.get<Player>(REDIS_KEYS.CURRENT_BLACK),
      redis.get<TurnState>(REDIS_KEYS.TURN_WHITE),
      redis.get<TurnState>(REDIS_KEYS.TURN_BLACK),
    ])

    const chess = new Chess()
    if (persisted?.fen) {
      chess.load(persisted.fen)
    }

    const turn = chess.turn()
    const currentPlayer = turn === 'w' ? currentWhite : currentBlack
    const turnState = turn === 'w' ? whiteTurnState : blackTurnState
    const turnKey = turn === 'w' ? REDIS_KEYS.TURN_WHITE : REDIS_KEYS.TURN_BLACK

    if (currentPlayer?.id !== playerId) {
      return { success: false, error: 'Not your turn' }
    }

    if (!turnState || turnState.status !== 'pending_confirmation') {
      return { success: false, error: 'No confirmation needed' }
    }

    if (Date.now() > turnState.deadline) {
      return { success: false, error: 'Confirmation timeout' }
    }

    const newTurnState: TurnState = {
      status: 'confirmed',
      deadline: Date.now() + MOVE_TIMEOUT_MS,
    }

    await Promise.all([
      redis.set(turnKey, newTurnState),
      redis.incr(REDIS_KEYS.VERSION),
    ])

    return { success: true }
  }

  async checkAndExpireTurns(): Promise<boolean> {
    const redis = getRedis()
    if (!redis) return false

    const now = Date.now()

    // Get current game state and turn states
    const [persisted, currentWhite, currentBlack, whiteTurnState, blackTurnState, whiteQueue, blackQueue] = await Promise.all([
      redis.get<PersistedGameState>(REDIS_KEYS.GAME_STATE),
      redis.get<Player>(REDIS_KEYS.CURRENT_WHITE),
      redis.get<Player>(REDIS_KEYS.CURRENT_BLACK),
      redis.get<TurnState>(REDIS_KEYS.TURN_WHITE),
      redis.get<TurnState>(REDIS_KEYS.TURN_BLACK),
      redis.get<Player[]>(REDIS_KEYS.WHITE_QUEUE),
      redis.get<Player[]>(REDIS_KEYS.BLACK_QUEUE),
    ])

    const chess = new Chess()
    if (persisted?.fen) {
      chess.load(persisted.fen)
    }

    const turn = chess.turn()
    let changed = false

    // Only check the current turn's player
    if (turn === 'w' && currentWhite && whiteTurnState && now > whiteTurnState.deadline) {
      // White player timed out
      const queue = whiteQueue || []
      const ops: Promise<unknown>[] = [redis.del(REDIS_KEYS.CURRENT_WHITE)]

      if (queue.length > 0) {
        const nextPlayer = queue.shift()!
        const newTurnState: TurnState = {
          status: 'pending_confirmation',
          deadline: now + CONFIRMATION_TIMEOUT_MS,
        }
        ops.push(
          redis.set(REDIS_KEYS.WHITE_QUEUE, queue),
          redis.set(REDIS_KEYS.CURRENT_WHITE, nextPlayer),
          redis.set(REDIS_KEYS.TURN_WHITE, newTurnState)
        )
      } else {
        ops.push(redis.del(REDIS_KEYS.TURN_WHITE))
      }

      ops.push(redis.incr(REDIS_KEYS.VERSION))
      await Promise.all(ops)
      changed = true
    } else if (turn === 'b' && currentBlack && blackTurnState && now > blackTurnState.deadline) {
      // Black player timed out
      const queue = blackQueue || []
      const ops: Promise<unknown>[] = [redis.del(REDIS_KEYS.CURRENT_BLACK)]

      if (queue.length > 0) {
        const nextPlayer = queue.shift()!
        const newTurnState: TurnState = {
          status: 'pending_confirmation',
          deadline: now + CONFIRMATION_TIMEOUT_MS,
        }
        ops.push(
          redis.set(REDIS_KEYS.BLACK_QUEUE, queue),
          redis.set(REDIS_KEYS.CURRENT_BLACK, nextPlayer),
          redis.set(REDIS_KEYS.TURN_BLACK, newTurnState)
        )
      } else {
        ops.push(redis.del(REDIS_KEYS.TURN_BLACK))
      }

      ops.push(redis.incr(REDIS_KEYS.VERSION))
      await Promise.all(ops)
      changed = true
    }

    return changed
  }

  async leaveQueue(playerId: string): Promise<void> {
    const redis = getRedis()
    if (!redis) return

    // Batch fetch all relevant data
    const [whiteQueue, blackQueue, currentWhite, currentBlack] = await Promise.all([
      redis.get<Player[]>(REDIS_KEYS.WHITE_QUEUE),
      redis.get<Player[]>(REDIS_KEYS.BLACK_QUEUE),
      redis.get<Player>(REDIS_KEYS.CURRENT_WHITE),
      redis.get<Player>(REDIS_KEYS.CURRENT_BLACK),
    ])

    const filteredWhite = (whiteQueue || []).filter(p => p.id !== playerId)
    const filteredBlack = (blackQueue || []).filter(p => p.id !== playerId)

    const ops: Promise<unknown>[] = [
      redis.set(REDIS_KEYS.WHITE_QUEUE, filteredWhite),
      redis.set(REDIS_KEYS.BLACK_QUEUE, filteredBlack),
    ]

    // Handle current player removal and assignment
    if (currentWhite?.id === playerId) {
      if (filteredWhite.length > 0) {
        const next = filteredWhite.shift()!
        const turnState: TurnState = {
          status: 'pending_confirmation',
          deadline: Date.now() + CONFIRMATION_TIMEOUT_MS,
        }
        ops.push(
          redis.set(REDIS_KEYS.CURRENT_WHITE, next),
          redis.set(REDIS_KEYS.WHITE_QUEUE, filteredWhite),
          redis.set(REDIS_KEYS.TURN_WHITE, turnState)
        )
      } else {
        ops.push(
          redis.del(REDIS_KEYS.CURRENT_WHITE),
          redis.del(REDIS_KEYS.TURN_WHITE)
        )
      }
    }

    if (currentBlack?.id === playerId) {
      if (filteredBlack.length > 0) {
        const next = filteredBlack.shift()!
        const turnState: TurnState = {
          status: 'pending_confirmation',
          deadline: Date.now() + CONFIRMATION_TIMEOUT_MS,
        }
        ops.push(
          redis.set(REDIS_KEYS.CURRENT_BLACK, next),
          redis.set(REDIS_KEYS.BLACK_QUEUE, filteredBlack),
          redis.set(REDIS_KEYS.TURN_BLACK, turnState)
        )
      } else {
        ops.push(
          redis.del(REDIS_KEYS.CURRENT_BLACK),
          redis.del(REDIS_KEYS.TURN_BLACK)
        )
      }
    }

    ops.push(redis.incr(REDIS_KEYS.VERSION))
    await Promise.all(ops)
  }

  async makeMove(playerId: string, from: Square, to: Square, promotion?: string): Promise<{ success: boolean; error?: string }> {
    const redis = getRedis()
    if (!redis) {
      return { success: false, error: 'Redis not available' }
    }

    // Batch fetch game state and current player
    const [persisted, currentWhite, currentBlack, whiteQueue, blackQueue, whiteTurnState, blackTurnState] = await Promise.all([
      redis.get<PersistedGameState>(REDIS_KEYS.GAME_STATE),
      redis.get<Player>(REDIS_KEYS.CURRENT_WHITE),
      redis.get<Player>(REDIS_KEYS.CURRENT_BLACK),
      redis.get<Player[]>(REDIS_KEYS.WHITE_QUEUE),
      redis.get<Player[]>(REDIS_KEYS.BLACK_QUEUE),
      redis.get<TurnState>(REDIS_KEYS.TURN_WHITE),
      redis.get<TurnState>(REDIS_KEYS.TURN_BLACK),
    ])

    const chess = new Chess()
    if (persisted?.fen) {
      chess.load(persisted.fen)
    }

    const currentTurn = chess.turn()
    const currentPlayer = currentTurn === 'w' ? currentWhite : currentBlack
    const turnState = currentTurn === 'w' ? whiteTurnState : blackTurnState

    if (currentPlayer?.id !== playerId) {
      return { success: false, error: 'Not your turn' }
    }

    // Must be confirmed to make a move
    if (!turnState || turnState.status !== 'confirmed') {
      return { success: false, error: 'Please confirm you are ready first' }
    }

    // Check if move timer expired
    if (Date.now() > turnState.deadline) {
      return { success: false, error: 'Move timeout - you took too long' }
    }

    try {
      const move = chess.move({ from, to, promotion })
      if (!move) {
        return { success: false, error: 'Invalid move' }
      }

      // Prepare batch write operations
      const queue = currentTurn === 'w' ? (whiteQueue || []) : (blackQueue || [])
      queue.push(currentPlayer)

      // Assign next player
      let nextPlayer: Player | null = null
      let newTurnState: TurnState | null = null
      if (queue.length > 0) {
        nextPlayer = queue.shift()!
        newTurnState = {
          status: 'pending_confirmation',
          deadline: Date.now() + CONFIRMATION_TIMEOUT_MS,
        }
      }

      const queueKey = currentTurn === 'w' ? REDIS_KEYS.WHITE_QUEUE : REDIS_KEYS.BLACK_QUEUE
      const currentKey = currentTurn === 'w' ? REDIS_KEYS.CURRENT_WHITE : REDIS_KEYS.CURRENT_BLACK
      const turnKey = currentTurn === 'w' ? REDIS_KEYS.TURN_WHITE : REDIS_KEYS.TURN_BLACK

      const ops: Promise<unknown>[] = [
        redis.set(REDIS_KEYS.GAME_STATE, {
          fen: chess.fen(),
          lastMove: { from, to },
          moveHistory: chess.history(),
        }),
        redis.set(queueKey, queue),
        nextPlayer ? redis.set(currentKey, nextPlayer) : redis.del(currentKey),
        newTurnState ? redis.set(turnKey, newTurnState) : redis.del(turnKey),
        redis.incr(REDIS_KEYS.VERSION),
      ]

      await Promise.all(ops)
      return { success: true }
    } catch {
      return { success: false, error: 'Invalid move' }
    }
  }

  async getValidMoves(square: Square): Promise<Move[]> {
    const redis = getRedis()
    if (!redis) {
      return new Chess().moves({ square, verbose: true })
    }

    const persisted = await redis.get<PersistedGameState>(REDIS_KEYS.GAME_STATE)
    const chess = new Chess()
    
    if (persisted?.fen) {
      chess.load(persisted.fen)
    }

    return chess.moves({ square, verbose: true })
  }

  async resetGame(): Promise<void> {
    const redis = getRedis()
    if (!redis) return

    await Promise.all([
      redis.set(REDIS_KEYS.GAME_STATE, {
        fen: new Chess().fen(),
        lastMove: null,
        moveHistory: [],
      }),
      redis.incr(REDIS_KEYS.VERSION),
    ])
  }

  async clearAllQueues(): Promise<void> {
    const redis = getRedis()
    if (!redis) return

    await Promise.all([
      redis.set(REDIS_KEYS.WHITE_QUEUE, []),
      redis.set(REDIS_KEYS.BLACK_QUEUE, []),
      redis.del(REDIS_KEYS.CURRENT_WHITE),
      redis.del(REDIS_KEYS.CURRENT_BLACK),
      redis.del(REDIS_KEYS.TURN_WHITE),
      redis.del(REDIS_KEYS.TURN_BLACK),
      redis.set(REDIS_KEYS.GAME_STATE, {
        fen: new Chess().fen(),
        lastMove: null,
        moveHistory: [],
      }),
      redis.incr(REDIS_KEYS.VERSION),
    ])
  }

  async kickPlayerByName(playerName: string): Promise<boolean> {
    const redis = getRedis()
    if (!redis) return false

    // Batch fetch all data
    const [whiteQueue, blackQueue, currentWhite, currentBlack] = await Promise.all([
      redis.get<Player[]>(REDIS_KEYS.WHITE_QUEUE),
      redis.get<Player[]>(REDIS_KEYS.BLACK_QUEUE),
      redis.get<Player>(REDIS_KEYS.CURRENT_WHITE),
      redis.get<Player>(REDIS_KEYS.CURRENT_BLACK),
    ])

    let found = false
    const ops: Promise<unknown>[] = []

    // Filter queues
    const whiteFiltered = (whiteQueue || []).filter(p => p.name !== playerName)
    const blackFiltered = (blackQueue || []).filter(p => p.name !== playerName)

    if (whiteFiltered.length !== (whiteQueue || []).length) {
      found = true
      ops.push(redis.set(REDIS_KEYS.WHITE_QUEUE, whiteFiltered))
    }

    if (blackFiltered.length !== (blackQueue || []).length) {
      found = true
      ops.push(redis.set(REDIS_KEYS.BLACK_QUEUE, blackFiltered))
    }

    // Check current players
    if (currentWhite?.name === playerName) {
      found = true
      if (whiteFiltered.length > 0) {
        const next = whiteFiltered.shift()!
        const turnState: TurnState = {
          status: 'pending_confirmation',
          deadline: Date.now() + CONFIRMATION_TIMEOUT_MS,
        }
        ops.push(
          redis.set(REDIS_KEYS.CURRENT_WHITE, next),
          redis.set(REDIS_KEYS.WHITE_QUEUE, whiteFiltered),
          redis.set(REDIS_KEYS.TURN_WHITE, turnState)
        )
      } else {
        ops.push(
          redis.del(REDIS_KEYS.CURRENT_WHITE),
          redis.del(REDIS_KEYS.TURN_WHITE)
        )
      }
    }

    if (currentBlack?.name === playerName) {
      found = true
      if (blackFiltered.length > 0) {
        const next = blackFiltered.shift()!
        const turnState: TurnState = {
          status: 'pending_confirmation',
          deadline: Date.now() + CONFIRMATION_TIMEOUT_MS,
        }
        ops.push(
          redis.set(REDIS_KEYS.CURRENT_BLACK, next),
          redis.set(REDIS_KEYS.BLACK_QUEUE, blackFiltered),
          redis.set(REDIS_KEYS.TURN_BLACK, turnState)
        )
      } else {
        ops.push(
          redis.del(REDIS_KEYS.CURRENT_BLACK),
          redis.del(REDIS_KEYS.TURN_BLACK)
        )
      }
    }

    if (found) {
      ops.push(redis.incr(REDIS_KEYS.VERSION))
      await Promise.all(ops)
    }

    return found
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

  async clearAllQueues(): Promise<void> {
    if (isRedisAvailable()) {
      return await redisStore.clearAllQueues()
    }
    return inMemoryStore.clearAllQueues()
  },

  async kickPlayerByName(playerName: string): Promise<boolean> {
    if (isRedisAvailable()) {
      return await redisStore.kickPlayerByName(playerName)
    }
    return inMemoryStore.kickPlayerByName(playerName)
  },

  async confirmReady(playerId: string): Promise<{ success: boolean; error?: string }> {
    if (isRedisAvailable()) {
      return await redisStore.confirmReady(playerId)
    }
    return inMemoryStore.confirmReady(playerId)
  },

  async checkAndExpireTurns(): Promise<boolean> {
    if (isRedisAvailable()) {
      return await redisStore.checkAndExpireTurns()
    }
    return inMemoryStore.checkAndExpireTurns()
  },
}
