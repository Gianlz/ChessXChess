import type { GameState, QueueState } from '@/lib/gameStore'
import { gameStore } from '@/lib/gameStore'

export interface GameSnapshot {
  game: GameState
  queue: QueueState
  version: number
}

// Simple cache for the game API route
// Note: This is instance-local, so it's just an optimization
// The stream route polls Redis directly for reliability
let cachedSnapshot: GameSnapshot | null = null

export function getSnapshot(): GameSnapshot | null {
  return cachedSnapshot
}

export async function refreshSnapshot(): Promise<GameSnapshot> {
  const [game, queue, version] = await Promise.all([
    gameStore.getGameState(),
    gameStore.getQueueState(),
    gameStore.getVersion(),
  ])

  const snapshot = { game, queue, version }
  cachedSnapshot = snapshot

  return snapshot
}
