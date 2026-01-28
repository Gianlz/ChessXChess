import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-chess-dark">
      <div className="card p-8 max-w-md w-full text-center">
        <div className="text-6xl mb-4">♚</div>
        <h1 className="font-serif text-4xl mb-2">404</h1>
        <h2 className="font-serif text-xl mb-4 text-gray-300">Page Not Found</h2>
        <p className="text-gray-400 mb-6">
          Looks like this piece moved to a square that doesn&apos;t exist!
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-chess-accent hover:bg-chess-accent/80 text-white font-medium rounded-xl transition-all"
        >
          Return to Game
        </Link>
      </div>
    </div>
  )
}
