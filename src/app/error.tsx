'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Page error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-chess-dark">
      <div className="card p-8 max-w-md w-full text-center">
        <div className="text-6xl mb-4">♟️</div>
        <h1 className="font-serif text-2xl mb-2">Game Error</h1>
        <p className="text-gray-400 mb-6">
          Something went wrong while loading the game. Please try again.
        </p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={reset}
            className="px-6 py-3 bg-chess-accent hover:bg-chess-accent/80 text-white font-medium rounded-xl transition-all"
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl transition-all"
          >
            Go Home
          </button>
        </div>
      </div>
    </div>
  )
}
