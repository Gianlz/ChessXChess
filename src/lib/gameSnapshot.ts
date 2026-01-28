import type { GameState, QueueState } from '@/lib/gameStore'
import { gameStore } from '@/lib/gameStore'

export interface GameSnapshot {
  game: GameState
  queue: QueueState
  version: number
}

type SnapshotListener = (snapshot: GameSnapshot) => void

let cachedSnapshot: GameSnapshot | null = null
const listeners = new Set<SnapshotListener>()

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

  listeners.forEach((listener) => {
    try {
      listener(snapshot)
    } catch {
      // Ignore listener errors
    }
  })

  return snapshot
}

export function subscribeToSnapshot(listener: SnapshotListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
