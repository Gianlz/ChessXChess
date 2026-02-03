import 'server-only'

import { Chess, Square } from 'chess.js'
import { getRedis, isRedisAvailable, REDIS_KEY } from './redis'
import { logger } from './logger'

export interface Player {
  id: string
  name: string
  joinedAt: number
}

export interface TurnState {
  status: 'pending_confirmation' | 'confirmed'
  deadline: number
}

// Constants for timeouts (in ms)
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

// Consolidated Redis state - single key for everything
export interface ConsolidatedState {
  game: {
    fen: string
    lastMove: { from: Square; to: Square } | null
    moveHistory: string[]
  }
  queues: {
    white: Player[]
    black: Player[]
  }
  current: {
    white: Player | null
    black: Player | null
  }
  turns: {
    white: TurnState | null
    black: TurnState | null
  }
  version: number
}

function createDefaultState(): ConsolidatedState {
  return {
    game: {
      fen: new Chess().fen(),
      lastMove: null,
      moveHistory: [],
    },
    queues: {
      white: [],
      black: [],
    },
    current: {
      white: null,
      black: null,
    },
    turns: {
      white: null,
      black: null,
    },
    version: 0,
  }
}

function getTurnFromFen(fen: string): 'w' | 'b' {
  const parts = fen.split(' ')
  return (parts[1] || 'w') as 'w' | 'b'
}

function deriveGameState(state: ConsolidatedState): GameState {
  const chess = new Chess()
  try {
    chess.load(state.game.fen)
  } catch {
    // Invalid FEN, use default
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
    lastMove: state.game.lastMove,
    moveHistory: state.game.moveHistory,
  }
}

function deriveQueueState(state: ConsolidatedState): QueueState {
  return {
    whiteQueue: state.queues.white,
    blackQueue: state.queues.black,
    currentWhitePlayer: state.current.white,
    currentBlackPlayer: state.current.black,
    whiteTurnState: state.turns.white,
    blackTurnState: state.turns.black,
  }
}

// Assign next player from queue
// Note: Only sets turn state if it's currently this color's turn
function assignNextPlayer(state: ConsolidatedState, color: 'w' | 'b'): void {
  const queue = color === 'w' ? state.queues.white : state.queues.black
  const currentTurn = getTurnFromFen(state.game.fen)

  if (queue.length > 0) {
    const nextPlayer = queue.shift()!
    
    if (color === 'w') {
      state.current.white = nextPlayer
      // Only set turn state if it's actually white's turn
      if (currentTurn === 'w') {
        state.turns.white = {
          status: 'pending_confirmation',
          deadline: Date.now() + CONFIRMATION_TIMEOUT_MS,
        }
      } else {
        // Not white's turn yet - don't set a deadline
        state.turns.white = null
      }
    } else {
      state.current.black = nextPlayer
      // Only set turn state if it's actually black's turn
      if (currentTurn === 'b') {
        state.turns.black = {
          status: 'pending_confirmation',
          deadline: Date.now() + CONFIRMATION_TIMEOUT_MS,
        }
      } else {
        // Not black's turn yet - don't set a deadline
        state.turns.black = null
      }
    }
  } else {
    if (color === 'w') {
      state.current.white = null
      state.turns.white = null
    } else {
      state.current.black = null
      state.turns.black = null
    }
  }
}

// Initialize turn state for the current turn's player if they don't have one
// Called after a move to start the new turn's confirmation timer
function initializeTurnStateIfNeeded(state: ConsolidatedState): void {
  const currentTurn = getTurnFromFen(state.game.fen)
  
  if (currentTurn === 'w') {
    // It's white's turn - if there's a current white player without turn state, initialize it
    if (state.current.white && !state.turns.white) {
      state.turns.white = {
        status: 'pending_confirmation',
        deadline: Date.now() + CONFIRMATION_TIMEOUT_MS,
      }
    }
  } else {
    // It's black's turn - if there's a current black player without turn state, initialize it
    if (state.current.black && !state.turns.black) {
      state.turns.black = {
        status: 'pending_confirmation',
        deadline: Date.now() + CONFIRMATION_TIMEOUT_MS,
      }
    }
  }
}

// Check and expire turns - called lazily on state access
// Also initializes turn state for waiting players
function checkAndExpireTurnsInline(state: ConsolidatedState): boolean {
  const now = Date.now()
  const turn = getTurnFromFen(state.game.fen)
  let changed = false

  // Only check the current turn's player
  if (turn === 'w' && state.current.white) {
    if (state.turns.white) {
      // Check if deadline expired
      if (now > state.turns.white.deadline) {
        logger.info('Turn expired', { player: state.current.white.name, color: 'white' })
        state.current.white = null
        state.turns.white = null
        assignNextPlayer(state, 'w')
        changed = true
      }
    } else {
      // Player is waiting but has no turn state - initialize it now
      state.turns.white = {
        status: 'pending_confirmation',
        deadline: now + CONFIRMATION_TIMEOUT_MS,
      }
      changed = true
    }
  } else if (turn === 'b' && state.current.black) {
    if (state.turns.black) {
      // Check if deadline expired
      if (now > state.turns.black.deadline) {
        logger.info('Turn expired', { player: state.current.black.name, color: 'black' })
        state.current.black = null
        state.turns.black = null
        assignNextPlayer(state, 'b')
        changed = true
      }
    } else {
      // Player is waiting but has no turn state - initialize it now
      state.turns.black = {
        status: 'pending_confirmation',
        deadline: now + CONFIRMATION_TIMEOUT_MS,
      }
      changed = true
    }
  }

  return changed
}

// In-memory fallback for local development
class InMemoryStore {
  private state: ConsolidatedState = createDefaultState()

  getState(): ConsolidatedState {
    // Lazy expiration check
    checkAndExpireTurnsInline(this.state)
    return this.state
  }

  getGameState(): GameState {
    return deriveGameState(this.getState())
  }

  getQueueState(): QueueState {
    return deriveQueueState(this.getState())
  }

  getVersion(): number {
    return this.state.version
  }

  joinQueue(player: Player, color: 'w' | 'b'): boolean {
    const state = this.getState()
    const queue = color === 'w' ? state.queues.white : state.queues.black
    const currentPlayer = color === 'w' ? state.current.white : state.current.black

    if (queue.some(p => p.id === player.id)) return false
    if (currentPlayer?.id === player.id) return false

    queue.push(player)

    if (!currentPlayer) {
      assignNextPlayer(state, color)
    }

    state.version++
    return true
  }

  leaveQueue(playerId: string): void {
    const state = this.getState()

    state.queues.white = state.queues.white.filter(p => p.id !== playerId)
    state.queues.black = state.queues.black.filter(p => p.id !== playerId)

    if (state.current.white?.id === playerId) {
      state.current.white = null
      state.turns.white = null
      assignNextPlayer(state, 'w')
    }
    if (state.current.black?.id === playerId) {
      state.current.black = null
      state.turns.black = null
      assignNextPlayer(state, 'b')
    }

    state.version++
  }

  confirmReady(playerId: string): { success: boolean; error?: string } {
    const state = this.getState()
    const turn = getTurnFromFen(state.game.fen)
    const currentPlayer = turn === 'w' ? state.current.white : state.current.black
    const turnState = turn === 'w' ? state.turns.white : state.turns.black

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
      state.turns.white = newTurnState
    } else {
      state.turns.black = newTurnState
    }

    state.version++
    return { success: true }
  }

  makeMove(playerId: string, from: Square, to: Square, promotion?: string): { success: boolean; error?: string } {
    const state = this.getState()
    const chess = new Chess()
    try {
      chess.load(state.game.fen)
    } catch {
      return { success: false, error: 'Invalid game state' }
    }

    const currentTurn = chess.turn()
    const currentPlayer = currentTurn === 'w' ? state.current.white : state.current.black
    const turnState = currentTurn === 'w' ? state.turns.white : state.turns.black

    if (currentPlayer?.id !== playerId) {
      return { success: false, error: 'Not your turn' }
    }

    if (!turnState || turnState.status !== 'confirmed') {
      return { success: false, error: 'Please confirm you are ready first' }
    }

    if (Date.now() > turnState.deadline) {
      return { success: false, error: 'Move timeout - you took too long' }
    }

    try {
      const move = chess.move({ from, to, promotion })
      if (move) {
        state.game.fen = chess.fen()
        state.game.lastMove = { from, to }
        state.game.moveHistory = chess.history()

        // Return player to queue
        const queue = currentTurn === 'w' ? state.queues.white : state.queues.black
        queue.push(currentPlayer)

        // Clear current and assign next for the color that just moved
        if (currentTurn === 'w') {
          state.current.white = null
          state.turns.white = null
          assignNextPlayer(state, 'w')
        } else {
          state.current.black = null
          state.turns.black = null
          assignNextPlayer(state, 'b')
        }

        // Initialize turn state for the NEW turn's player (who may be waiting)
        initializeTurnStateIfNeeded(state)

        state.version++
        return { success: true }
      }
      return { success: false, error: 'Invalid move' }
    } catch {
      return { success: false, error: 'Invalid move' }
    }
  }

  resetGame(): void {
    const state = this.state
    state.game = {
      fen: new Chess().fen(),
      lastMove: null,
      moveHistory: [],
    }
    state.version++
  }

  clearAllQueues(): void {
    this.state = createDefaultState()
  }

  kickPlayerByName(playerName: string): boolean {
    const state = this.getState()
    let found = false

    const whiteLen = state.queues.white.length
    state.queues.white = state.queues.white.filter(p => p.name !== playerName)
    if (state.queues.white.length !== whiteLen) found = true

    const blackLen = state.queues.black.length
    state.queues.black = state.queues.black.filter(p => p.name !== playerName)
    if (state.queues.black.length !== blackLen) found = true

    if (state.current.white?.name === playerName) {
      state.current.white = null
      state.turns.white = null
      assignNextPlayer(state, 'w')
      found = true
    }

    if (state.current.black?.name === playerName) {
      state.current.black = null
      state.turns.black = null
      assignNextPlayer(state, 'b')
      found = true
    }

    if (found) state.version++
    return found
  }
}

// Redis-backed store with optimistic locking
class RedisStore {
  // Get state with lazy expiration check - single Redis read
  private async getStateWithExpiration(): Promise<ConsolidatedState> {
    const redis = getRedis()
    if (!redis) return createDefaultState()

    try {
      const state = await redis.get<ConsolidatedState>(REDIS_KEY)
      if (!state) return createDefaultState()

      // Lazy expiration check
      const changed = checkAndExpireTurnsInline(state)
      if (changed) {
        state.version++
        // Write back expired state - await to prevent race conditions
        try {
          await redis.set(REDIS_KEY, state)
        } catch (err) {
          logger.error('Failed to write expired state', { error: String(err) })
        }
      }

      return state
    } catch (err) {
      logger.error('Redis: Failed to get state', { error: String(err) })
      return createDefaultState()
    }
  }

  // Optimistic locking update - retry on version conflict only
  private async updateState(
    modifier: (state: ConsolidatedState) => { success: boolean; error?: string }
  ): Promise<{ success: boolean; state: ConsolidatedState; error?: string }> {
    const redis = getRedis()
    if (!redis) {
      return { success: false, state: createDefaultState(), error: 'Redis not available' }
    }

    const maxRetries = 3
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Single GET
        let state = await redis.get<ConsolidatedState>(REDIS_KEY)
        if (!state) state = createDefaultState()

        // Check expiration first
        checkAndExpireTurnsInline(state)

        const originalVersion = state.version

        // Apply modification - returns success/error for business logic
        const result = modifier(state)
        if (!result.success) {
          // Business logic failure - don't retry
          return { success: false, state, error: result.error }
        }

        state.version++

        // Simple optimistic lock: read version, check, write
        // Re-read to check version hasn't changed
        const currentState = await redis.get<ConsolidatedState>(REDIS_KEY)
        const currentVersion = currentState?.version ?? 0

        if (currentVersion !== originalVersion) {
          // Version mismatch, retry
          logger.debug('Optimistic lock conflict, retrying', { attempt: attempt + 1 })
          continue
        }

        // Version matches, safe to write
        await redis.set(REDIS_KEY, state)
        return { success: true, state }
      } catch (err) {
        logger.error('Redis: Update failed', { error: String(err), attempt })
        if (attempt === maxRetries - 1) {
          return { success: false, state: createDefaultState(), error: 'Database error' }
        }
      }
    }

    return { success: false, state: createDefaultState(), error: 'Concurrent modification - please retry' }
  }

  async getVersion(): Promise<number> {
    const state = await this.getStateWithExpiration()
    return state.version
  }

  async getGameState(): Promise<GameState> {
    const state = await this.getStateWithExpiration()
    return deriveGameState(state)
  }

  async getQueueState(): Promise<QueueState> {
    const state = await this.getStateWithExpiration()
    return deriveQueueState(state)
  }

  async joinQueue(player: Player, color: 'w' | 'b'): Promise<boolean> {
    const result = await this.updateState((state) => {
      const queue = color === 'w' ? state.queues.white : state.queues.black
      const currentPlayer = color === 'w' ? state.current.white : state.current.black

      // Check if already in queue or is current player
      if (queue.some(p => p.id === player.id)) {
        return { success: false, error: 'Already in queue' }
      }
      if (currentPlayer?.id === player.id) {
        return { success: false, error: 'Already playing' }
      }

      queue.push(player)

      if (!currentPlayer) {
        assignNextPlayer(state, color)
      }

      return { success: true }
    })

    return result.success
  }

  async leaveQueue(playerId: string): Promise<void> {
    await this.updateState((state) => {
      state.queues.white = state.queues.white.filter(p => p.id !== playerId)
      state.queues.black = state.queues.black.filter(p => p.id !== playerId)

      if (state.current.white?.id === playerId) {
        state.current.white = null
        state.turns.white = null
        assignNextPlayer(state, 'w')
      }
      if (state.current.black?.id === playerId) {
        state.current.black = null
        state.turns.black = null
        assignNextPlayer(state, 'b')
      }

      return { success: true }
    })
  }

  async confirmReady(playerId: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.updateState((state) => {
      const turn = getTurnFromFen(state.game.fen)
      const currentPlayer = turn === 'w' ? state.current.white : state.current.black
      const turnState = turn === 'w' ? state.turns.white : state.turns.black

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
        state.turns.white = newTurnState
      } else {
        state.turns.black = newTurnState
      }

      return { success: true }
    })

    return { success: result.success, error: result.error }
  }

  async makeMove(playerId: string, from: Square, to: Square, promotion?: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.updateState((state) => {
      const chess = new Chess()
      try {
        chess.load(state.game.fen)
      } catch {
        return { success: false, error: 'Invalid game state' }
      }

      const currentTurn = chess.turn()
      const currentPlayer = currentTurn === 'w' ? state.current.white : state.current.black
      const turnState = currentTurn === 'w' ? state.turns.white : state.turns.black

      if (currentPlayer?.id !== playerId) {
        return { success: false, error: 'Not your turn' }
      }

      if (!turnState || turnState.status !== 'confirmed') {
        return { success: false, error: 'Please confirm you are ready first' }
      }

      if (Date.now() > turnState.deadline) {
        return { success: false, error: 'Move timeout - you took too long' }
      }

      try {
        const move = chess.move({ from, to, promotion })
        if (!move) {
          return { success: false, error: 'Invalid move' }
        }

        state.game.fen = chess.fen()
        state.game.lastMove = { from, to }
        state.game.moveHistory = chess.history()

        // Return player to queue
        const queue = currentTurn === 'w' ? state.queues.white : state.queues.black
        queue.push(currentPlayer)

        // Clear current and assign next for the color that just moved
        if (currentTurn === 'w') {
          state.current.white = null
          state.turns.white = null
          assignNextPlayer(state, 'w')
        } else {
          state.current.black = null
          state.turns.black = null
          assignNextPlayer(state, 'b')
        }

        // Initialize turn state for the NEW turn's player (who may be waiting)
        initializeTurnStateIfNeeded(state)

        return { success: true }
      } catch {
        return { success: false, error: 'Invalid move' }
      }
    })

    return { success: result.success, error: result.error }
  }

  async resetGame(): Promise<void> {
    await this.updateState((state) => {
      state.game = {
        fen: new Chess().fen(),
        lastMove: null,
        moveHistory: [],
      }
      return { success: true }
    })
  }

  async clearAllQueues(): Promise<void> {
    const redis = getRedis()
    if (!redis) return

    try {
      await redis.set(REDIS_KEY, createDefaultState())
    } catch (err) {
      logger.error('Redis: Failed to clear all', { error: String(err) })
    }
  }

  async kickPlayerByName(playerName: string): Promise<boolean> {
    let found = false

    await this.updateState((state) => {
      const whiteLen = state.queues.white.length
      state.queues.white = state.queues.white.filter(p => p.name !== playerName)
      if (state.queues.white.length !== whiteLen) found = true

      const blackLen = state.queues.black.length
      state.queues.black = state.queues.black.filter(p => p.name !== playerName)
      if (state.queues.black.length !== blackLen) found = true

      if (state.current.white?.name === playerName) {
        state.current.white = null
        state.turns.white = null
        assignNextPlayer(state, 'w')
        found = true
      }

      if (state.current.black?.name === playerName) {
        state.current.black = null
        state.turns.black = null
        assignNextPlayer(state, 'b')
        found = true
      }

      return { success: true }
    })

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
}
