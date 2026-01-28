'use client'

import { useEffect, useState } from 'react'

interface TurnNotificationProps {
  needsConfirmation: boolean
  isConfirmed: boolean
  timeRemaining: number
  onConfirm: () => void
}

export default function TurnNotification({
  needsConfirmation,
  isConfirmed,
  timeRemaining,
  onConfirm,
}: TurnNotificationProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (needsConfirmation || isConfirmed) {
      setIsVisible(true)
    } else {
      // Small delay before hiding for smooth transition
      const timeout = setTimeout(() => setIsVisible(false), 300)
      return () => clearTimeout(timeout)
    }
  }, [needsConfirmation, isConfirmed])

  if (!isVisible && !needsConfirmation && !isConfirmed) {
    return null
  }

  const isUrgent = timeRemaining <= 5
  const progressPercent = needsConfirmation 
    ? (timeRemaining / 10) * 100 
    : (timeRemaining / 30) * 100

  return (
    <div
      className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        needsConfirmation || isConfirmed
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 -translate-y-4'
      }`}
    >
      <div
        className={`glass rounded-2xl p-4 min-w-[280px] border ${
          isUrgent ? 'border-red-500/50' : 'border-chess-accent/30'
        }`}
      >
        {/* Progress bar */}
        <div className="h-1 bg-white/10 rounded-full mb-3 overflow-hidden">
          <div
            className={`h-full transition-all duration-100 rounded-full ${
              isUrgent ? 'bg-red-500' : 'bg-chess-accent'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {needsConfirmation ? (
          // Confirmation phase
          <div className="text-center">
            <p className="text-white font-medium mb-2">It&apos;s your turn!</p>
            <p className="text-gray-400 text-sm mb-3">
              Confirm you&apos;re ready in{' '}
              <span className={`font-mono font-bold ${isUrgent ? 'text-red-400' : 'text-chess-accent'}`}>
                {timeRemaining}s
              </span>
            </p>
            <button
              onClick={onConfirm}
              className={`w-full py-2.5 px-4 font-medium rounded-xl transition-all ${
                isUrgent
                  ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                  : 'bg-chess-accent hover:bg-chess-accent/80 text-white'
              }`}
            >
              I&apos;m Ready!
            </button>
          </div>
        ) : isConfirmed ? (
          // Move phase
          <div className="text-center">
            <p className="text-green-400 font-medium mb-1">✓ Ready!</p>
            <p className="text-gray-400 text-sm">
              Make your move in{' '}
              <span className={`font-mono font-bold ${isUrgent ? 'text-red-400' : 'text-white'}`}>
                {timeRemaining}s
              </span>
            </p>
            {isUrgent && (
              <p className="text-red-400 text-xs mt-2 animate-pulse">
                Hurry! Time is running out!
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
