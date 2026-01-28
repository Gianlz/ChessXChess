import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const alt = 'ChessXChess - Collaborative Chess'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0a0a0a',
          backgroundImage: 'radial-gradient(circle at 50% 50%, #1a1a1a 0%, #0a0a0a 100%)',
        }}
      >
        {/* Chess board pattern background */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexWrap: 'wrap',
            opacity: 0.1,
          }}
        >
          {Array.from({ length: 64 }).map((_, i) => (
            <div
              key={i}
              style={{
                width: '12.5%',
                height: '12.5%',
                backgroundColor: (Math.floor(i / 8) + i) % 2 === 0 ? '#f0d9b5' : '#b58863',
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          {/* Chess pieces */}
          <div
            style={{
              display: 'flex',
              fontSize: 80,
              marginBottom: 20,
              gap: 16,
            }}
          >
            <span>♔</span>
            <span style={{ color: '#b58863' }}>♞</span>
            <span>♕</span>
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: 72,
              fontWeight: 'bold',
              color: 'white',
              marginBottom: 16,
              fontFamily: 'Georgia, serif',
            }}
          >
            ChessXChess
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: 32,
              color: '#b58863',
              fontFamily: 'Georgia, serif',
            }}
          >
            Collaborative Chess
          </div>

          {/* Description */}
          <div
            style={{
              fontSize: 24,
              color: '#888',
              marginTop: 24,
              textAlign: 'center',
              maxWidth: 800,
            }}
          >
            Real-time multiplayer chess with queue system
          </div>
        </div>

        {/* Bottom accent line */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 8,
            backgroundColor: '#b58863',
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  )
}
