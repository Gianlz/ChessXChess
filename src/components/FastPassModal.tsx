'use client'

import { useState, useEffect } from 'react'

interface Tier {
  id: string
  name: string
  price: number
  priceFormatted: string
  skipAmount: number
  duration: string
  color: string
}

interface FastPassModalProps {
  isOpen: boolean
  onClose: () => void
  onPurchase: (tier: string) => Promise<void>
  isLoading: boolean
}

export default function FastPassModal({
  isOpen,
  onClose,
  onPurchase,
  isLoading,
}: FastPassModalProps) {
  const [tiers, setTiers] = useState<Tier[]>([])
  const [selectedTier, setSelectedTier] = useState<string | null>(null)
  const [loadingTiers, setLoadingTiers] = useState(true)

  useEffect(() => {
    if (isOpen) {
      setLoadingTiers(true)
      fetch('/api/fastpass')
        .then(res => res.json())
        .then(data => {
          if (data.tiers) {
            setTiers(data.tiers)
          }
        })
        .catch(console.error)
        .finally(() => setLoadingTiers(false))
    }
  }, [isOpen])

  if (!isOpen) return null

  const handlePurchase = async () => {
    if (!selectedTier) return
    await onPurchase(selectedTier)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-chess-card rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-white/10 animate-fade-in">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="font-serif text-2xl mb-2">⚡ FastPass</h2>
          <p className="text-gray-400 text-sm">
            Skip ahead in the queue every 2 minutes!
          </p>
        </div>

        {/* Tiers */}
        {loadingTiers ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-2 border-chess-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-3 mb-6">
            {tiers.map((tier) => (
              <button
                key={tier.id}
                onClick={() => setSelectedTier(tier.id)}
                disabled={isLoading}
                className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                  selectedTier === tier.id
                    ? 'border-chess-accent bg-chess-accent/10'
                    : 'border-white/10 hover:border-white/20 bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                      style={{ backgroundColor: `${tier.color}30` }}
                    >
                      {tier.id === 'bronze' && '🥉'}
                      {tier.id === 'silver' && '🥈'}
                      {tier.id === 'gold' && '🥇'}
                    </div>
                    <div>
                      <h3 className="font-medium" style={{ color: tier.color }}>
                        {tier.name}
                      </h3>
                      <p className="text-xs text-gray-400">
                        Skip {tier.skipAmount} positions every 2 min
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-white">{tier.priceFormatted}</p>
                    <p className="text-xs text-gray-500">{tier.duration}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Features */}
        <div className="bg-white/5 rounded-lg p-4 mb-6">
          <h4 className="text-sm font-medium mb-2">FastPass Benefits:</h4>
          <ul className="text-xs text-gray-400 space-y-1">
            <li>✓ Auto-skip positions every 2 minutes</li>
            <li>✓ Free skip when returning from playing</li>
            <li>✓ Earn ranking points when your color wins</li>
            <li>✓ Special badge in queue</li>
          </ul>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-3 px-4 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white font-medium rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handlePurchase}
            disabled={!selectedTier || isLoading}
            className="flex-1 py-3 px-4 bg-chess-accent hover:bg-chess-accent/80 disabled:bg-white/10 disabled:text-gray-500 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              'Pay with PIX'
            )}
          </button>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
