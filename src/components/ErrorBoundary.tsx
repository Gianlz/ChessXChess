'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-chess-dark">
          <div className="card p-8 max-w-md w-full text-center">
            <div className="text-6xl mb-4">♟️</div>
            <h1 className="font-serif text-2xl mb-2">Oops! Something went wrong</h1>
            <p className="text-gray-400 mb-6">
              The game encountered an unexpected error. Please refresh the page to continue playing.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-chess-accent hover:bg-chess-accent/80 text-white font-medium rounded-xl transition-all"
            >
              Refresh Page
            </button>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <pre className="mt-4 p-4 bg-red-500/10 rounded-lg text-left text-xs text-red-400 overflow-auto">
                {this.state.error.toString()}
              </pre>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
