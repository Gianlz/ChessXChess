import { NextRequest } from 'next/server'
import { gameStore } from '@/lib/gameStore'
import { isRedisAvailable } from '@/lib/redis'
import { refreshSnapshot } from '@/lib/gameSnapshot'
import { secureJsonResponse } from '@/lib/security'
import {
  validatePlayerId,
  sanitizePlayerName,
  validateSquare,
  validatePromotion,
  validateColor,
  validateAdminPassword,
  validateAction,
} from '@/lib/validation'
import { logger } from '@/lib/logger'

export async function GET() {
  try {
    // Always fetch fresh state from Redis - this is event-driven
    // since clients poll this endpoint only when they need data
    const [game, queue] = await Promise.all([
      gameStore.getGameState(),
      gameStore.getQueueState(),
    ])

    return secureJsonResponse({ game, queue })
  } catch (err) {
    logger.error('GET /api/game failed', { error: String(err) })
    return secureJsonResponse({ error: 'Failed to get game state' }, 500)
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return secureJsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const action = validateAction(body.action)
  if (!action) {
    return secureJsonResponse({ error: 'Invalid or missing action' }, 400)
  }

  switch (action) {
    case 'join': {
      const playerId = validatePlayerId(body.playerId)
      const playerName = sanitizePlayerName(body.playerName)
      const color = validateColor(body.color)

      if (!playerId) {
        return secureJsonResponse({ error: 'Invalid player ID format' }, 400)
      }
      if (!playerName) {
        return secureJsonResponse({ error: 'Invalid player name. Use 1-30 alphanumeric characters.' }, 400)
      }
      if (!color) {
        return secureJsonResponse({ error: 'Invalid color. Must be "w" or "b".' }, 400)
      }

      if (!isRedisAvailable()) {
        return secureJsonResponse(
          { error: 'Game server not configured. Redis is required for multiplayer.', redisAvailable: false },
          503
        )
      }

      try {
        const success = await gameStore.joinQueue(
          { id: playerId, name: playerName, joinedAt: Date.now() },
          color
        )
        if (success) {
          await refreshSnapshot()
          logger.info('Player joined queue', { playerName, color })
        }
        return secureJsonResponse({ success })
      } catch (err) {
        logger.error('Join queue failed', { error: String(err), playerName })
        return secureJsonResponse({ success: false, error: 'Failed to join queue' }, 500)
      }
    }

    case 'leave': {
      const playerId = validatePlayerId(body.playerId)
      if (!playerId) {
        return secureJsonResponse({ error: 'Invalid player ID' }, 400)
      }
      try {
        await gameStore.leaveQueue(playerId)
        await refreshSnapshot()
        return secureJsonResponse({ success: true })
      } catch (err) {
        logger.error('Leave queue failed', { error: String(err) })
        return secureJsonResponse({ success: false, error: 'Failed to leave queue' }, 500)
      }
    }

    case 'move': {
      const playerId = validatePlayerId(body.playerId)
      const from = validateSquare(body.from)
      const to = validateSquare(body.to)
      const promotion = validatePromotion(body.promotion)

      if (!playerId) {
        return secureJsonResponse({ error: 'Invalid player ID' }, 400)
      }
      if (!from || !to) {
        return secureJsonResponse({ error: 'Invalid square format' }, 400)
      }

      const result = await gameStore.makeMove(playerId, from, to, promotion)
      if (result.success) {
        await refreshSnapshot()
        logger.info('Move made', { from, to, promotion })
      }
      return secureJsonResponse(result, result.success ? 200 : 400)
    }

    case 'reset': {
      if (!validateAdminPassword(body.pass)) {
        logger.warn('Unauthorized reset attempt')
        return secureJsonResponse({ error: 'Unauthorized' }, 401)
      }

      await gameStore.resetGame()
      await refreshSnapshot()
      logger.info('Game reset by admin')
      return secureJsonResponse({ success: true })
    }

    case 'clearAll': {
      if (!validateAdminPassword(body.pass)) {
        logger.warn('Unauthorized clearAll attempt')
        return secureJsonResponse({ error: 'Unauthorized' }, 401)
      }

      await gameStore.clearAllQueues()
      await refreshSnapshot()
      logger.info('All queues cleared by admin')
      return secureJsonResponse({ success: true, message: 'All queues cleared and game reset' })
    }

    case 'kickPlayer': {
      if (!validateAdminPassword(body.pass)) {
        logger.warn('Unauthorized kickPlayer attempt')
        return secureJsonResponse({ error: 'Unauthorized' }, 401)
      }

      const name = sanitizePlayerName(body.name)
      if (!name) {
        return secureJsonResponse({ error: 'Invalid player name' }, 400)
      }
      const found = await gameStore.kickPlayerByName(name)
      if (found) {
        await refreshSnapshot()
        logger.info('Player kicked', { playerName: name })
      }
      return secureJsonResponse(
        { success: found, message: found ? `Player ${name} removed` : `Player ${name} not found` }
      )
    }

    case 'confirmReady': {
      const playerId = validatePlayerId(body.playerId)
      if (!playerId) {
        return secureJsonResponse({ error: 'Invalid player ID' }, 400)
      }
      const result = await gameStore.confirmReady(playerId)
      if (result.success) {
        await refreshSnapshot()
      }
      return secureJsonResponse(result, result.success ? 200 : 400)
    }

    default:
      return secureJsonResponse({ error: 'Unknown action' }, 400)
  }
}
