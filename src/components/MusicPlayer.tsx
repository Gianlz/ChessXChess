'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

const TRACKS = [
  { name: 'Besos en Domingo', file: '/audio/Besos en Domingo.mp3' },
  { name: 'Midnight Mango Sky', file: '/audio/Midnight Mango Sky.mp3' },
  { name: 'Rápido Como Fuego', file: '/audio/Rápido Como Fuego.mp3' },
  { name: 'Soft Floors, Quiet Minds', file: '/audio/Soft Floors, Quiet Minds.mp3' },
  { name: 'Toro En Mi Voz', file: '/audio/Toro En Mi Voz.mp3' },
  { name: 'Velvet Backbone', file: '/audio/Velvet Backbone.mp3' },
]

export default function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTrack, setCurrentTrack] = useState(0)
  const [volume, setVolume] = useState(0.3)
  const [isExpanded, setIsExpanded] = useState(false)

  // Load saved preferences
  useEffect(() => {
    const savedVolume = localStorage.getItem('musicVolume')
    const savedTrack = localStorage.getItem('musicTrack')
    if (savedVolume) setVolume(parseFloat(savedVolume))
    if (savedTrack) setCurrentTrack(parseInt(savedTrack))
  }, [])

  // Update audio volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
    }
  }, [volume])

  // Save preferences
  useEffect(() => {
    localStorage.setItem('musicVolume', volume.toString())
    localStorage.setItem('musicTrack', currentTrack.toString())
  }, [volume, currentTrack])

  const togglePlay = useCallback(async () => {
    if (!audioRef.current) return
    
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      try {
        await audioRef.current.play()
        setIsPlaying(true)
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Playback error:', err)
        }
      }
    }
  }, [isPlaying])

  const changeTrack = useCallback((newTrackIndex: number) => {
    const audio = audioRef.current
    if (!audio) return
    
    const wasPlaying = isPlaying
    
    // Pause current playback first to avoid AbortError
    audio.pause()
    
    // Update track
    setCurrentTrack(newTrackIndex)
    audio.src = TRACKS[newTrackIndex].file
    
    // Wait for audio to be ready before playing
    if (wasPlaying) {
      const playWhenReady = async () => {
        try {
          await audio.play()
          setIsPlaying(true)
        } catch (err) {
          if (err instanceof Error && err.name !== 'AbortError') {
            console.error('Playback error:', err)
          }
        }
      }
      
      // Use canplaythrough event to ensure audio is ready
      audio.addEventListener('canplaythrough', playWhenReady, { once: true })
    }
    
    audio.load()
  }, [isPlaying])

  const nextTrack = useCallback(() => {
    const next = (currentTrack + 1) % TRACKS.length
    changeTrack(next)
  }, [currentTrack, changeTrack])

  const prevTrack = useCallback(() => {
    const prev = (currentTrack - 1 + TRACKS.length) % TRACKS.length
    changeTrack(prev)
  }, [currentTrack, changeTrack])

  const handleTrackEnd = useCallback(() => {
    nextTrack()
  }, [nextTrack])

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(parseFloat(e.target.value))
  }

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <audio
        ref={audioRef}
        src={TRACKS[currentTrack].file}
        onEnded={handleTrackEnd}
        loop={false}
      />
      
      {/* Collapsed state - just a music icon button */}
      {!isExpanded ? (
        <button
          onClick={() => setIsExpanded(true)}
          className="relative glass rounded-full p-3 hover:bg-white/10 transition-all group"
          aria-label="Open music player"
        >
          <svg
            className={`w-5 h-5 ${isPlaying ? 'text-chess-accent' : 'text-gray-400'} group-hover:text-white transition-colors`}
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
          {isPlaying && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-chess-accent rounded-full animate-pulse" />
          )}
        </button>
      ) : (
        /* Expanded player */
        <div className="glass rounded-2xl p-4 w-64 space-y-3">
          {/* Header with close button */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 uppercase tracking-wider">Now Playing</span>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-gray-400 hover:text-white transition-colors p-1"
              aria-label="Minimize player"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Track name */}
          <div className="text-sm font-medium text-white truncate">
            {TRACKS[currentTrack].name}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            {/* Previous */}
            <button
              onClick={prevTrack}
              className="text-gray-400 hover:text-white transition-colors p-1"
              aria-label="Previous track"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>

            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="bg-chess-accent hover:bg-chess-accent/80 text-white rounded-full p-3 transition-all"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Next */}
            <button
              onClick={nextTrack}
              className="text-gray-400 hover:text-white transition-colors p-1"
              aria-label="Next track"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
              {volume === 0 ? (
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              ) : volume < 0.5 ? (
                <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
              ) : (
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
              )}
            </svg>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              className="w-full h-1 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-chess-accent [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
              aria-label="Volume"
            />
          </div>
        </div>
      )}
    </div>
  )
}
