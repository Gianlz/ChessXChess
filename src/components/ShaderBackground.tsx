'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

interface ShaderBackgroundProps {
  className?: string
  speed?: number
  intensity?: number
}

const vertexShaderSource = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

const fragmentShaderSource = `
  precision highp float;
  
  varying vec2 v_uv;
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform float u_intensity;
  
  #define PI 3.14159265359
  #define TAU 6.28318530718
  
  // Simplex noise function
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
  
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                     + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
                            dot(x12.zw,x12.zw)), 0.0);
    m = m*m;
    m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
  
  // Smooth wave function
  float wave(vec2 uv, float time, float freq, float amp, float speed, float phase) {
    return sin(uv.x * freq + time * speed + phase) * amp;
  }
  
  // Layered waves
  float waves(vec2 uv, float time) {
    float w = 0.0;
    
    // Multiple wave layers with different frequencies and speeds
    w += wave(uv, time, 3.0, 0.15, 0.8, 0.0);
    w += wave(uv, time, 5.0, 0.1, 1.2, 1.5);
    w += wave(uv, time, 7.0, 0.08, 0.6, 3.0);
    w += wave(uv, time, 11.0, 0.05, 1.5, 4.5);
    
    // Add perpendicular waves for more complexity
    w += wave(uv.yx, time, 4.0, 0.08, 0.9, 2.0);
    w += wave(uv.yx, time, 6.0, 0.06, 1.1, 0.5);
    
    // Add noise-based displacement
    w += snoise(uv * 2.0 + time * 0.3) * 0.1;
    
    return w;
  }
  
  // Smooth gradient for wave color
  vec3 waveGradient(float height, float time) {
    // Chess-themed colors: deep amber, bronze, gold
    vec3 deep = vec3(0.05, 0.03, 0.02);      // Dark background
    vec3 mid = vec3(0.15, 0.08, 0.04);       // Dark bronze
    vec3 highlight = vec3(0.7, 0.5, 0.3);    // Warm amber
    vec3 peak = vec3(0.95, 0.85, 0.65);      // Bright gold
    
    float h = height * 0.5 + 0.5; // Normalize to 0-1
    
    // Create smooth gradient transitions
    vec3 color = mix(deep, mid, smoothstep(0.0, 0.3, h));
    color = mix(color, highlight, smoothstep(0.3, 0.6, h));
    color = mix(color, peak, smoothstep(0.6, 1.0, h));
    
    return color;
  }
  
  void main() {
    vec2 uv = v_uv;
    vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
    uv = (uv - 0.5) * aspect + 0.5;
    
    float time = u_time * 0.4;
    
    // Calculate wave height at this position
    float waveHeight = waves(uv, time) * u_intensity;
    
    // Add flowing distortion
    vec2 distortedUV = uv;
    distortedUV.x += sin(uv.y * 8.0 + time) * 0.02 * u_intensity;
    distortedUV.y += cos(uv.x * 6.0 + time * 0.7) * 0.02 * u_intensity;
    
    // Recalculate with distortion for more organic feel
    float distortedWave = waves(distortedUV, time) * u_intensity;
    
    // Blend original and distorted
    float finalWave = mix(waveHeight, distortedWave, 0.5);
    
    // Base color from wave gradient
    vec3 color = waveGradient(finalWave, time);
    
    // Add subtle glow on wave peaks
    float peakGlow = smoothstep(0.15, 0.3, finalWave);
    color += vec3(0.3, 0.2, 0.1) * peakGlow * 0.5 * u_intensity;
    
    // Add flowing light streaks
    float streak1 = sin(uv.x * 20.0 + uv.y * 10.0 + time * 2.0) * 0.5 + 0.5;
    float streak2 = sin(uv.x * 15.0 - uv.y * 8.0 + time * 1.5) * 0.5 + 0.5;
    float streaks = streak1 * streak2;
    streaks = pow(streaks, 4.0) * 0.15;
    color += vec3(0.8, 0.6, 0.4) * streaks * u_intensity;
    
    // Add subtle noise texture
    float noise = snoise(uv * 100.0 + time) * 0.015;
    color += noise;
    
    // Add flowing ambient glow
    float ambientFlow = sin(time * 0.5) * 0.5 + 0.5;
    vec2 glowCenter = vec2(0.5 + sin(time * 0.3) * 0.2, 0.5 + cos(time * 0.4) * 0.2);
    float glowDist = length(uv - glowCenter);
    float glow = exp(-glowDist * 2.0) * 0.2 * ambientFlow * u_intensity;
    color += vec3(0.6, 0.4, 0.2) * glow;
    
    // Soft vignette
    float vignette = 1.0 - smoothstep(0.3, 1.0, length((v_uv - 0.5) * 1.3));
    color *= vignette * 0.8 + 0.2;
    
    // Tone mapping for smooth colors
    color = color / (color + vec3(1.0));
    color = pow(color, vec3(0.95)); // Slight gamma
    
    gl_FragColor = vec4(color, 1.0);
  }
`

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  
  return shader
}

function createProgram(gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null {
  const program = gl.createProgram()
  if (!program) return null
  
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }
  
  return program
}

export default function ShaderBackground({ 
  className = '', 
  speed = 1.0,
  intensity = 1.0 
}: ShaderBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const programRef = useRef<WebGLProgram | null>(null)
  const glRef = useRef<WebGLRenderingContext | null>(null)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [supportsWebGL, setSupportsWebGL] = useState(true)
  
  // Check for reduced motion preference and WebGL support on mount
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)
    
    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }
    mediaQuery.addEventListener('change', handleChange)
    
    // Check WebGL support
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    setSupportsWebGL(!!gl)
    
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])
  
  const render = useCallback((time: number) => {
    const gl = glRef.current
    const program = programRef.current
    const canvas = canvasRef.current
    
    if (!gl || !program || !canvas) return
    
    // Update time uniform (slower if reduced motion)
    const timeLocation = gl.getUniformLocation(program, 'u_time')
    const effectiveSpeed = prefersReducedMotion ? speed * 0.1 : speed
    gl.uniform1f(timeLocation, time * 0.001 * effectiveSpeed)
    
    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    
    animationRef.current = requestAnimationFrame(render)
  }, [speed, prefersReducedMotion])
  
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const gl = canvas.getContext('webgl', { 
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance'
    })
    if (!gl) {
      console.error('WebGL not supported')
      return
    }
    
    glRef.current = gl
    
    // Create shaders
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource)
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource)
    
    if (!vertexShader || !fragmentShader) return
    
    // Create program
    const program = createProgram(gl, vertexShader, fragmentShader)
    if (!program) return
    
    programRef.current = program
    gl.useProgram(program)
    
    // Set up geometry (full-screen quad)
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ])
    
    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)
    
    const positionLocation = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
    
    // Handle resize
    const handleResize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2)
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
      gl.viewport(0, 0, canvas.width, canvas.height)
      
      // Update resolution uniform
      const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
      
      // Update intensity uniform
      const intensityLocation = gl.getUniformLocation(program, 'u_intensity')
      gl.uniform1f(intensityLocation, intensity)
    }
    
    handleResize()
    window.addEventListener('resize', handleResize)
    
    // Start animation
    animationRef.current = requestAnimationFrame(render)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animationRef.current)
      
      // Cleanup WebGL resources
      gl.deleteProgram(program)
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)
      gl.deleteBuffer(positionBuffer)
    }
  }, [intensity, render])
  
  // Fallback for browsers without WebGL
  if (!supportsWebGL) {
    return (
      <div 
        className={`fixed inset-0 w-full h-full -z-10 ${className}`}
        style={{ 
          background: 'radial-gradient(ellipse at center, #1a1a1a 0%, #0a0a0a 100%)' 
        }}
        aria-hidden="true"
      />
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className={`fixed inset-0 w-full h-full -z-10 ${className}`}
      style={{ background: '#0a0a0a' }}
      aria-hidden="true"
    />
  )
}
