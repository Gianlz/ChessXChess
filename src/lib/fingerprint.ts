'use client'

// Client-side device fingerprinting for anti-sharing protection
// This collects browser characteristics to create a unique device identifier

let cachedFingerprint: string | null = null

async function getCanvasFingerprint(): Promise<string> {
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return 'no-canvas'
    
    canvas.width = 200
    canvas.height = 50
    
    ctx.textBaseline = 'top'
    ctx.font = '14px Arial'
    ctx.fillStyle = '#f60'
    ctx.fillRect(125, 1, 62, 20)
    ctx.fillStyle = '#069'
    ctx.fillText('ChessXChess', 2, 15)
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)'
    ctx.fillText('FastPass', 4, 17)
    
    return canvas.toDataURL()
  } catch {
    return 'canvas-error'
  }
}

function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (!gl) return 'no-webgl'
    
    const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info')
    if (!debugInfo) return 'no-debug-info'
    
    const vendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
    const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    
    return `${vendor}~${renderer}`
  } catch {
    return 'webgl-error'
  }
}

function getScreenFingerprint(): string {
  return `${screen.width}x${screen.height}x${screen.colorDepth}~${window.devicePixelRatio}`
}

function getTimezoneFingerprint(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

function getLanguageFingerprint(): string {
  return navigator.languages?.join(',') || navigator.language
}

function getPlatformFingerprint(): string {
  return `${navigator.platform}~${navigator.hardwareConcurrency || 0}~${navigator.maxTouchPoints || 0}`
}

async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function generateFingerprint(): Promise<string> {
  if (cachedFingerprint) return cachedFingerprint
  
  const components = [
    await getCanvasFingerprint(),
    getWebGLFingerprint(),
    getScreenFingerprint(),
    getTimezoneFingerprint(),
    getLanguageFingerprint(),
    getPlatformFingerprint(),
    navigator.userAgent,
  ]
  
  const raw = components.join('|||')
  cachedFingerprint = await hashString(raw)
  
  return cachedFingerprint
}

export function getCachedFingerprint(): string | null {
  return cachedFingerprint
}
