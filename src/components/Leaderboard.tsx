'use client'

import { useState, useEffect, useCallback } from 'react'

interface RankingEntry {
  visitorId: string
  displayName: string
  points: number
  wins: number
  rank: number
  tier?: 'bronze' | 'silver' | 'gold'
  isCurrentPlayer: boolean
}

interface LeaderboardProps {
  visitorId: string | null
  refreshTrigger?: number
}

const TIER_COLORS = {
  bronze: '#CD7F32',
  silver: '#C0C0C0',
  gold: '#FFD700',
}

const TIER_ICONS = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
}

export default function Leaderboard({ visitorId, refreshTrigger }: LeaderboardProps) {
  const [entries, setEntries] = useState<RankingEntry[]>([])
  const [currentPlayer, setCurrentPlayer] = useState<RankingEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLeaderboard = useCallback(async () => {
    try {
      const url = visitorId
        ? `/api/ranking?limit=10&visitorId=${visitorId}`
        : '/api/ranking?limit=10'
      
      const res = await fetch(url)
      const data = await res.json()
      
      if (data.success) {
        setEntries(data.leaderboard)
        setCurrentPlayer(data.currentPlayer)
        setError(null)
      } else {
        setError(data.error)
      }
    } catch {
      setError('Failed to load leaderboard')
    } finally {
      setLoading(false)
    }
  }, [visitorId])

  useEffect(() => {
    fetchLeaderboard()
    // Refresh every 30 seconds
    const interval = setInterval(fetchLeaderboard, 30000)
    return () => clearInterval(interval)
  }, [fetchLeaderboard, refreshTrigger])

  if (loading) {
    return (
      <div className="card p-4 w-full lg:w-64">
        <h2 className="font-serif text-lg mb-4 text-center">🏆 Leaderboard</h2>
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-chess-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card p-4 w-full lg:w-64">
        <h2 className="font-serif text-lg mb-4 text-center">🏆 Leaderboard</h2>
        <p className="text-gray-500 text-sm text-center py-4">{error}</p>
      </div>
    )
  }

  const getRankDisplay = (rank: number) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return `#${rank}`
  }

  const isInTop10 = currentPlayer && entries.some(e => e.isCurrentPlayer)

  return (
    <div className="card p-4 w-full lg:w-64">
      <h2 className="font-serif text-lg mb-4 text-center">🏆 Leaderboard</h2>

      {entries.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-gray-500 text-sm">No rankings yet</p>
          <p className="text-gray-600 text-xs mt-1">Buy FastPass to start earning points!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.visitorId}
              className={`flex items-center gap-2 p-2 rounded-lg transition-all ${
                entry.isCurrentPlayer
                  ? 'bg-chess-accent/20 border border-chess-accent/30'
                  : 'bg-white/5'
              } ${
                entry.rank <= 3 ? 'animate-slide-in' : ''
              }`}
            >
              {/* Rank */}
              <div className={`w-8 text-center font-medium ${
                entry.rank <= 3 ? 'text-lg' : 'text-sm text-gray-400'
              }`}>
                {getRankDisplay(entry.rank)}
              </div>

              {/* Player info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  {entry.tier && (
                    <span title={entry.tier}>
                      {TIER_ICONS[entry.tier]}
                    </span>
                  )}
                  <span className={`truncate text-sm ${
                    entry.isCurrentPlayer ? 'text-chess-accent font-medium' : 'text-white'
                  }`}>
                    {entry.displayName}
                    {entry.isCurrentPlayer && ' (You)'}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {entry.wins} win{entry.wins !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Points */}
              <div className="text-right">
                <p className="font-medium text-sm" style={{ color: entry.tier ? TIER_COLORS[entry.tier] : 'white' }}>
                  {entry.points}
                </p>
                <p className="text-xs text-gray-500">pts</p>
              </div>
            </div>
          ))}

          {/* Current player not in top 10 */}
          {currentPlayer && !isInTop10 && (
            <>
              <div className="text-center py-2">
                <span className="text-gray-600">• • •</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-chess-accent/20 border border-chess-accent/30">
                <div className="w-8 text-center text-sm text-gray-400">
                  #{currentPlayer.rank || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    {currentPlayer.tier && (
                      <span>{TIER_ICONS[currentPlayer.tier]}</span>
                    )}
                    <span className="truncate text-sm text-chess-accent font-medium">
                      {currentPlayer.displayName} (You)
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {currentPlayer.wins} win{currentPlayer.wins !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-sm text-chess-accent">
                    {currentPlayer.points}
                  </p>
                  <p className="text-xs text-gray-500">pts</p>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
