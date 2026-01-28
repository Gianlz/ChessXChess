export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-chess-dark">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-chess-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400">Loading ChessXChess...</p>
      </div>
    </div>
  )
}
