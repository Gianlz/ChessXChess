import 'server-only'

import { getRedis } from './redis'
import { logger } from './logger'

// Redis key for version tracking (used for cross-instance sync)
export const VERSION_KEY = 'chess:version'

/**
 * Publish a new version to Redis for cross-instance sync
 * Other SSE instances will poll this and detect changes
 */
export async function publishVersionUpdate(version: number): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  try {
    // Set version with short TTL - if no updates, it expires
    // This also acts as a heartbeat showing the system is active
    await redis.set(VERSION_KEY, version, { ex: 300 }) // 5 min TTL
    logger.debug('PubSub: Published version', { version })
  } catch (err) {
    logger.error('PubSub: Failed to publish version', { error: String(err) })
  }
}

/**
 * Get the current version from Redis
 * Returns null if not available
 */
export async function getPublishedVersion(): Promise<number | null> {
  const redis = getRedis()
  if (!redis) return null

  try {
    const version = await redis.get<number>(VERSION_KEY)
    return version
  } catch (err) {
    logger.error('PubSub: Failed to get version', { error: String(err) })
    return null
  }
}

/**
 * Check if there's a newer version available
 * Returns the new version if different, null otherwise
 */
export async function checkForNewerVersion(currentVersion: number): Promise<number | null> {
  const publishedVersion = await getPublishedVersion()
  if (publishedVersion !== null && publishedVersion !== currentVersion) {
    return publishedVersion
  }
  return null
}
