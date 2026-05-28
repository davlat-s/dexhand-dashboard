import { useEffect, useRef } from 'react'

const SPACING      = 28
const DOT_R        = 1.2
const REPEL_RADIUS = 120
const REPEL_FORCE  = 2
const RETURN       = 0.03
const DAMPING      = 0.88

export default function DotGrid() {
  const canvasRef = useRef()

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let dots = []
    let mouse = { x: -9999, y: -9999 }
    let raf
    let pressing = false

    function build() {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
      dots = []
      const cols = Math.ceil(canvas.width  / SPACING) + 2
      const rows = Math.ceil(canvas.height / SPACING) + 2
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          dots.push({ hx: c * SPACING, hy: r * SPACING, x: c * SPACING, y: r * SPACING, vx: 0, vy: 0 })
        }
      }
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#2a2a2a'
      for (const d of dots) {
        if (pressing) {
          const dx = d.x - mouse.x, dy = d.y - mouse.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < REPEL_RADIUS && dist > 0) {
            const f = (1 - dist / REPEL_RADIUS) * REPEL_FORCE
            d.vx += (dx / dist) * f
            d.vy += (dy / dist) * f
          }
        }
        d.vx += (d.hx - d.x) * RETURN
        d.vy += (d.hy - d.y) * RETURN
        d.vx *= DAMPING
        d.vy *= DAMPING
        d.x  += d.vx
        d.y  += d.vy
        ctx.beginPath()
        ctx.arc(d.x, d.y, DOT_R, 0, Math.PI * 2)
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }

    build()
    raf = requestAnimationFrame(draw)

    const onMove   = e => { mouse.x = e.clientX; mouse.y = e.clientY }
    const onDown   = () => { pressing = true }
    const onUp     = () => { pressing = false }
    const onResize = () => build()

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup',   onUp)
    window.addEventListener('resize',    onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup',   onUp)
      window.removeEventListener('resize',    onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 0, pointerEvents: 'none' }}
    />
  )
}
