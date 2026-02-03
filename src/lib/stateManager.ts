import 'server-only'

import type { GameState, QueueState, ConsolidatedState } from './gameStore'
import { getRedis, isRedisAvailable, REDIS_KEY } from './redis'
import { Chess } from 'chess.js'
import { logger } from './logger'

// ============================================================================
// In-Memory State Cache
// ============================================================================

// Module-level cache - survives across requests within same instance
let cachedState: ConsolidatedState | null = null
let cacheVersion = 0
let isHydrated = false

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

/**
 * Hydrate cache from Redis - called ONCE on cold start
 */
async function hydrateFromRedis(): Promise<void> {
  if (isHydrated) return

  const redis = getRedis()
  if (!redis) {
    cachedState = createDefaultState()
    isHydrated = true
    logger.debug('StateManager: Hydrated with default state (no Redis)')
    return
  }

  try {
    const state = await redis.get<ConsolidatedState>(REDIS_KEY)
    cachedState = state || createDefaultState()
    cacheVersion = cachedState.version
    isHydrated = true
    logger.debug('StateManager: Hydrated from Redis', { version: cacheVersion })
  } catch (err) {
    logger.error('StateManager: Failed to hydrate from Redis', { error: String(err) })
    cachedState = createDefaultState()
    isHydrated = true
  }
}

/**
 * Get current state from cache (NO Redis call)
 * Hydrates on first access only
 */
export async function getCachedState(): Promise<ConsolidatedState> {
  if (!isHydrated) {
    await hydrateFromRedis()
  }
  return cachedState || createDefaultState()
}

/**
 * Get derived game state from cache
 */
export async function getCachedGameState(): Promise<GameState> {
  const state = await getCachedState()
  return deriveGameState(state)
}

/**
 * Get derived queue state from cache
 */
export async function getCachedQueueState(): Promise<QueueState> {
  const state = await getCachedState()
  return deriveQueueState(state)
}

/**
 * Get current version from cache
 */
export async function getCachedVersion(): Promise<number> {
  const state = await getCachedState()
  return state.version
}

/**
 * Update cache after a mutation - called after Redis write succeeds
 */
export function updateCache(newState: ConsolidatedState): void {
  cachedState = newState
  cacheVersion = newState.version
  isHydrated = true
  logger.debug('StateManager: Cache updated', { version: cacheVersion })
}

/**
 * Force re-hydrate from Redis (for admin operations or recovery)
 */
export async function forceHydrate(): Promise<void> {
  isHydrated = false
  await hydrateFromRedis()
}

// ============================================================================
// SSE Connection Manager
// ============================================================================

type SSEClient = {
  id: string
  controller: ReadableStreamDefaultController<Uint8Array>
  encoder: TextEncoder
}

// Module-level SSE clients map
const sseClients = new Map<string, SSEClient>()

let clientIdCounter = 0

/**
 * Register a new SSE client
 */
export function registerSSEClient(controller: ReadableStreamDefaultController<Uint8Array>): string {
  const id = `sse_${Date.now()}_${++clientIdCounter}`
  const encoder = new TextEncoder()
  
  sseClients.set(id, { id, controller, encoder })
  logger.debug('SSE: Client registered', { clientId: id, totalClients: sseClients.size })
  
  return id
}

/**
 * Unregister an SSE client
 */
export function unregisterSSEClient(id: string): void {
  sseClients.delete(id)
  logger.debug('SSE: Client unregistered', { clientId: id, totalClients: sseClients.size })
}

/**
 * Send data to a specific SSE client
 */
export function sendToClient(id: string, data: object): boolean {
  const client = sseClients.get(id)
  if (!client) return false

  try {
    const message = `data: ${JSON.stringify(data)}\n\n`
    client.controller.enqueue(client.encoder.encode(message))
    return true
  } catch {
    // Client disconnected
    sseClients.delete(id)
    return false
  }
}

/**
 * Broadcast version change notification to ALL connected SSE clients
 * Clients will then fetch personalized data via GET /api/game
 * This ensures player IDs are properly sanitized per-viewer
 */
export function broadcastVersionChange(version: number): void {
  if (sseClients.size === 0) return

  const payload = { type: 'update', version }
  let successCount = 0
  const failedIds: string[] = []

  for (const [id, client] of sseClients) {
    try {
      const message = `data: ${JSON.stringify(payload)}\n\n`
      client.controller.enqueue(client.encoder.encode(message))
      successCount++
    } catch {
      failedIds.push(id)
    }
  }

  // Clean up failed clients
  for (const id of failedIds) {
    sseClients.delete(id)
  }

  if (successCount > 0 || failedIds.length > 0) {
    logger.debug('SSE: Broadcast version change', { 
      sent: successCount, 
      failed: failedIds.length,
      version 
    })
  }
}

/**
 * Get current SSE client count (for monitoring)
 */
export function getSSEClientCount(): number {
  return sseClients.size
}

// ============================================================================
// Unified Mutation Handler
// ============================================================================

/**
 * After a successful mutation, update cache and notify all SSE clients
 * Clients will fetch fresh personalized data via GET /api/game
 * This ensures player IDs are properly sanitized per-viewer
 */
export async function onMutationSuccess(newState: ConsolidatedState): Promise<void> {
  // Update local cache
  updateCache(newState)

  // Notify all connected SSE clients that state has changed
  // They will fetch personalized data via GET /api/game
  broadcastVersionChange(newState.version)
}

/**
 * Check if Redis is available (re-export for convenience)
 */
export { isRedisAvailable }
