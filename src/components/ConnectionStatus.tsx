'use client'

import { ConnectionStatus as ConnectionStatusType } from '@/hooks/useGameStream'

interface ConnectionStatusProps {
  status: ConnectionStatusType
  onReconnect: () => void
}

export default function ConnectionStatus({ status, onReconnect }: ConnectionStatusProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/30 backdrop-blur-sm border border-white/10">
      <div className={`w-2 h-2 rounded-full transition-colors ${
        status === 'connected' ? 'bg-green-500' :
        status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
        status === 'disconnected' ? 'bg-orange-500 animate-pulse' :
        'bg-red-500'
      }`} />
      <span className="text-xs text-gray-300">
        {status === 'connected' && 'Live'}
        {status === 'connecting' && 'Connecting...'}
        {status === 'disconnected' && 'Reconnecting...'}
        {status === 'error' && (
          <button 
            onClick={onReconnect} 
            className="text-red-400 hover:text-red-300 transition-colors"
          >
            Connection lost - Click to reconnect
          </button>
        )}
      </span>
    </div>
  )
}
