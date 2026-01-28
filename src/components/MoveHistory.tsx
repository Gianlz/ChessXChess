'use client'

interface MoveHistoryProps {
  moves: string[]
}

export default function MoveHistory({ moves }: MoveHistoryProps) {
  if (moves.length === 0) {
    return (
      <div className="card p-4 w-full max-w-xs">
        <h3 className="font-serif text-lg mb-3">Move History</h3>
        <p className="text-sm text-gray-500 italic">No moves yet</p>
      </div>
    )
  }

  const movePairs: [string, string | undefined][] = []
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push([moves[i], moves[i + 1]])
  }

  return (
    <div className="card p-4 w-full max-w-xs max-h-80 overflow-hidden flex flex-col">
      <h3 className="font-serif text-lg mb-3">Move History</h3>
      <div className="overflow-y-auto flex-1 space-y-1 pr-2">
        {movePairs.map(([white, black], index) => (
          <div key={index} className="flex text-sm">
            <span className="text-gray-500 w-8">{index + 1}.</span>
            <span className="w-16 text-white font-mono">{white}</span>
            <span className="w-16 text-gray-300 font-mono">{black || ''}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
