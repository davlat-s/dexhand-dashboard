import { useEffect, useRef, useState } from 'react'
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { getServoConfig } from './ServoPanel.jsx'

// ── Landmark indices ──────────────────────────────────────────────────────────
// Each finger: [MCP, PIP, DIP, TIP] landmark indices in MediaPipe's 21-point model
const FINGERS = [
  { lms: [5,  6,  7,  8],  servos: [0, 1, 8]  },  // index
  { lms: [9,  10, 11, 12], servos: [2, 3, 9]  },  // middle
  { lms: [13, 14, 15, 16], servos: [4, 5, 10] },  // ring
  { lms: [17, 18, 19, 20], servos: [6, 7, 11] },  // pinky
]
// Thumb: CMC=1, MCP=2, IP=3, TIP=4
// Servo 12 = Thumb Tip (IP joint), 13 = Right, 14 = Left, 15 = Rotate

// ── Math helpers ──────────────────────────────────────────────────────────────
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z }
function mag(v)    { return Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2) }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z } }

// Angle (degrees) at `joint` looking from `parent` through to `child`.
// 0° = straight, 90° = fully bent.
function flexionDeg(lm, parent, joint, child) {
  const v1 = sub(lm[child], lm[joint])
  const v2 = sub(lm[parent], lm[joint])
  const cos = dot(v1, v2) / (mag(v1) * mag(v2))
  // acos gives 0 when straight, 180 when folded back — invert so 0=extended, 180=max bend
  return 180 - Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI
}

// Map normalised flexion [0,1] to a servo angle using dashboard min/max/def.
// Direction: if def is near min → flex toward max; if def is near max → flex toward min.
function flexionToServo(t, { min, max, def }) {
  const mid = (min + max) / 2
  const angle = def < mid
    ? def + t * (max - def)
    : def - t * (def - min)
  return Math.round(Math.max(min, Math.min(max, angle)))
}

// Build a flat servoIndex → config lookup from the current dashboard config
function buildConfigMap() {
  const cfg = getServoConfig()
  return Object.fromEntries(Object.values(cfg).flat().map(s => [s.index, s]))
}

// ── Hand skeleton ─────────────────────────────────────────────────────────────
// Each finger group: color + connection pairs + tip index
const FINGER_GROUPS = [
  { color: '#ba68c8', connections: [[0,1],[1,2],[2,3],[3,4]],         tip: 4  }, // thumb
  { color: '#f06292', connections: [[0,5],[5,6],[6,7],[7,8]],         tip: 8  }, // index
  { color: '#ffd54f', connections: [[0,9],[9,10],[10,11],[11,12]],    tip: 12 }, // middle
  { color: '#64b5f6', connections: [[0,13],[13,14],[14,15],[15,16]],  tip: 16 }, // ring
  { color: '#81c784', connections: [[0,17],[17,18],[18,19],[19,20]],  tip: 20 }, // pinky
]
const PALM_CONNECTIONS = [[5,9],[9,13],[13,17],[0,17]]

function drawLandmarks(canvas, lm) {
  const ctx = canvas.getContext('2d')
  const { width: w, height: h } = canvas
  ctx.clearRect(0, 0, w, h)

  const px = i => (1 - lm[i].x) * w
  const py = i => lm[i].y * h

  const drawLine = (a, b, color, alpha = 0.7) => {
    ctx.beginPath()
    ctx.moveTo(px(a), py(a))
    ctx.lineTo(px(b), py(b))
    ctx.strokeStyle = color.replace(')', `, ${alpha})`).replace('rgb', 'rgba').replace('#', 'rgba(').replace('rgba(', color.startsWith('#') ? '' : 'rgba(')
    // simpler approach:
    ctx.strokeStyle = color
    ctx.globalAlpha = alpha
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // Palm connections in muted white
  ctx.globalAlpha = 0.3
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.5
  for (const [a, b] of PALM_CONNECTIONS) {
    ctx.beginPath()
    ctx.moveTo(px(a), py(a))
    ctx.lineTo(px(b), py(b))
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // Finger connections + joints
  for (const { color, connections, tip } of FINGER_GROUPS) {
    // Connections
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.globalAlpha = 0.75
    for (const [a, b] of connections) {
      ctx.beginPath()
      ctx.moveTo(px(a), py(a))
      ctx.lineTo(px(b), py(b))
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // Joints along this finger
    const indices = [connections[0][0], ...connections.map(c => c[1])]
    for (const i of indices) {
      const isTip = i === tip
      const r = isTip ? 5 : 3
      ctx.beginPath()
      ctx.arc(px(i), py(i), r, 0, Math.PI * 2)
      ctx.fillStyle = isTip ? color : '#ffffff'
      ctx.globalAlpha = isTip ? 0.95 : 0.85
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.5
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }

  // Wrist dot
  ctx.beginPath()
  ctx.arc(px(0), py(0), 4, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.globalAlpha = 0.7
  ctx.fill()
  ctx.globalAlpha = 1
}

// ── Main component ────────────────────────────────────────────────────────────
const SEND_THRESHOLD = 5  // degrees — skip update if servo moved less than this

export default function MediaPipeTracker({ active, onAngles }) {
  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const landmarker  = useRef(null)
  const rafRef      = useRef(null)
  const activeRef   = useRef(false)
  const lastSent    = useRef({})  // last angle sent per servo index
  const lastWrist   = useRef(null) // previous frame wrist position for jank detection
  const [status, setStatus] = useState('idle') // idle | loading | ready | error

  // Keep activeRef in sync so the rAF loop can read it without closure issues
  useEffect(() => { activeRef.current = active }, [active])

  // Initialise MediaPipe once on mount.
  // Cleanup closes the instance so React StrictMode's double-invoke doesn't
  // leave an orphaned WASM graph running in the background.
  useEffect(() => {
    let hl = null
    async function init() {
      setStatus('loading')
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        )
        hl = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
        })
        landmarker.current = hl
        setStatus('ready')
      } catch (e) {
        console.error('[MP] init error:', e)
        setStatus('error')
      }
    }
    init()
    return () => {
      hl?.close()
      landmarker.current = null
      setStatus('idle')
    }
  }, [])

  // Start / stop webcam and rAF loop when active changes
  useEffect(() => {
    if (!active || status !== 'ready') return
    let stream = null

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        if (!videoRef.current) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        loop()
      } catch (e) {
        console.error('[MP] camera error:', e)
        setStatus('error')
      }
    }

    function loop() {
      if (!activeRef.current || !videoRef.current || !landmarker.current) return
      const video = videoRef.current
      if (video.readyState >= 2) {
        const result = landmarker.current.detectForVideo(video, performance.now())
        const lm = result.landmarks?.[0]
        // Require all 21 landmarks. If macOS Reactions overlays confetti/balloons
        // the model may return garbage — skip the frame if the wrist teleports >0.3
        // normalised units between frames (real hand can't move that fast).
        if (lm && lm.length === 21) {
          const wrist = lm[0]
          const prev  = lastWrist.current
          const jank  = prev
            ? Math.sqrt((wrist.x-prev.x)**2 + (wrist.y-prev.y)**2 + (wrist.z-prev.z)**2)
            : 0
          lastWrist.current = wrist
          if (jank < 0.3) {
            processLandmarks(lm)
            if (canvasRef.current) drawLandmarks(canvasRef.current, lm)
          }
        } else if (canvasRef.current) {
          // No hand detected — clear the overlay
          const ctx = canvasRef.current.getContext('2d')
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    start()
    return () => {
      cancelAnimationFrame(rafRef.current)
      stream?.getTracks().forEach(t => t.stop())
      if (videoRef.current) videoRef.current.srcObject = null
      lastSent.current  = {}
      lastWrist.current = null
    }
  }, [active, status]) // eslint-disable-line react-hooks/exhaustive-deps

  function processLandmarks(lm) {
    const cfg = buildConfigMap()
    const angles = {}

    // ── Fingers (index, middle, ring, pinky) ─────────────────────────────────
    for (const { lms: [mcp, pip, dip, tip], servos: [lower, upper, tipIdx] } of FINGERS) {
      const wrist = 0
      const mcpFlex = Math.max(0, Math.min(1, flexionDeg(lm, wrist, mcp, pip)  / 90))
      const pipFlex = Math.max(0, Math.min(1, flexionDeg(lm, mcp,   pip, dip)  / 90))
      const dipFlex = Math.max(0, Math.min(1, flexionDeg(lm, pip,   dip, tip)  / 90))

      if (cfg[lower])  angles[lower]  = flexionToServo(mcpFlex, cfg[lower])
      if (cfg[upper])  angles[upper]  = flexionToServo(pipFlex, cfg[upper])
      if (cfg[tipIdx]) angles[tipIdx] = flexionToServo(dipFlex, cfg[tipIdx])
    }

    // ── Thumb ─────────────────────────────────────────────────────────────────
    // Thumb Tip (servo 12): IP joint flexion
    const thumbIPFlex = Math.max(0, Math.min(1, flexionDeg(lm, 2, 3, 4) / 90))
    if (cfg[12]) angles[12] = flexionToServo(thumbIPFlex, cfg[12])

    // Thumb MCP spread (servos 13/14 — Right/Left): CMC→MCP joint
    const thumbMCPFlex = Math.max(0, Math.min(1, flexionDeg(lm, 1, 2, 3) / 90))
    if (cfg[13]) angles[13] = flexionToServo(thumbMCPFlex, cfg[13])
    if (cfg[14]) angles[14] = flexionToServo(thumbMCPFlex, cfg[14])

    // Only send servos that moved more than the threshold — keeps BLE traffic low
    const changed = {}
    for (const [k, v] of Object.entries(angles)) {
      if (Math.abs(v - (lastSent.current[k] ?? -999)) >= SEND_THRESHOLD) {
        changed[k] = v
        lastSent.current[k] = v
      }
    }
    if (Object.keys(changed).length) onAngles(changed)
  }

  if (!active) return null

  const large = true  // mirror mode always shows large centered view

  return (
    <div style={large ? {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 40,
      borderRadius: 12,
      overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.1)',
      background: '#0a0a0f',
      width: 'min(60vw, calc(80vh * 4 / 3))',
      aspectRatio: '4 / 3',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    } : {
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 40,
      borderRadius: 10,
      overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.1)',
      background: '#0a0a0f',
      width: 160,
      height: 120,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <video
        ref={videoRef}
        muted
        playsInline
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
      />
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      {status !== 'ready' && (
        <div style={{
          position: 'absolute',
          fontSize: 10,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          {status === 'loading' ? 'Loading…' : status === 'error' ? 'Camera error' : ''}
        </div>
      )}
    </div>
  )
}
