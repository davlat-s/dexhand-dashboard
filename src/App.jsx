import React, { useState, useRef, useEffect } from 'react'
import HandMap from './components/HandMap.jsx'
import ServoPanel, { getServoConfig } from './components/ServoPanel.jsx'
import DashSidebar from './components/DashSidebar.jsx'
import DotGrid from './components/DotGrid.jsx'
import MediaPipeTracker from './components/MediaPipeTracker.jsx'
import GesturesPanel from './components/GesturesPanel.jsx'
import { GESTURES, SEQUENCES } from './gestures.js'
import './App.css'

function CtrlBtn({ children, onClick, active }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'none',
        border: 'none',
        padding: '12px 16px',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: '-0.01em',
        color: active
          ? hovered ? 'var(--text-muted)' : 'var(--accent)'
          : hovered ? 'var(--text)' : 'var(--text-muted)',
        fontFamily: 'var(--font)',
        transition: 'color 0.15s',
      }}
    >
      {children}
    </button>
  )
}

export default function App() {
  const [selectedZone, setSelectedZone]  = useState(null)
  const [controlMode,  setControlMode]   = useState(false)
  const [calibrate,    setCalibrate]     = useState(false)
  const [editing,      setEditing]       = useState(false)
  // Defaults match firmware ManagedServo(pin, min, max, default, inverted)
  const [servoAngles,  setServoAngles]   = useState({
     0: 30,   // Index Lower
     1: 30,   // Index Upper
     2: 30,   // Middle Lower
     3: 150,  // Middle Upper
     4: 30,   // Ring Lower
     5: 150,  // Ring Upper
     6: 30,   // Pinky Lower
     7: 30,   // Pinky Upper
     8: 30,   // Index Tip
     9: 30,   // Middle Tip
    10: 30,   // Ring Tip
    11: 30,   // Pinky Tip
    12: 120,  // Thumb Tip
    13: 30,   // Thumb Right
    14: 20,   // Thumb Left
    15: 30,   // Thumb Rotate
    16: 95,   // Wrist Left
    17: 95,   // Wrist Right
  })
  const [bleClient,     setBleClient]    = useState(null)
  const [bleStatus,     setBleStatus]    = useState('disconnected')
  const [bleDevice,     setBleDevice]    = useState(null)
  const [mirrorActive,  setMirrorActive] = useState(false)
  const [synced,        setSynced]       = useState(false)  // gestures programmed to firmware
  const firmwareIds     = useRef({})   // { gestureId → firmwareId }
  const seqTimer        = useRef(null) // fallback sequence timer

  // Auto-sync whenever a new BLE client connects (if firmware supports gestures)
  useEffect(() => {
    if (bleClient?.defineGestureFrame) {
      syncGestures(bleClient)
    }
  }, [bleClient]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleAngleChange(servoIndex, angle) {
    setServoAngles(prev => ({ ...prev, [servoIndex]: angle }))
    if (bleClient) bleClient.send(`set:${servoIndex}:${angle}\n`)
  }

  function handleMirrorAngles(angles) {
    setServoAngles(prev => ({ ...prev, ...angles }))
    if (bleClient) bleClient.mirror(angles)
  }

  function handleGesturePlay(gesture) {
    clearTimeout(seqTimer.current)
    // Update local UI state
    setServoAngles(prev => {
      const known = Object.fromEntries(
        Object.entries(gesture.angles).filter(([k]) => k in prev)
      )
      return { ...prev, ...known }
    })
    if (!bleClient) return
    if (synced && firmwareIds.current[gesture.id] != null) {
      // Firmware knows this gesture — send a single 2-byte play command
      bleClient.playGesture(firmwareIds.current[gesture.id])
    } else {
      // Fallback: send individual set commands over UART
      bleClient.queue(
        Object.entries(gesture.angles)
          .filter(([k]) => Number(k) < 18)
          .map(([k, v]) => `set:${k}:${v}\n`)
      )
    }
  }

  function handleSequencePlay(sequence) {
    clearTimeout(seqTimer.current)
    if (!bleClient) return
    if (synced && firmwareIds.current[sequence.id] != null) {
      // Firmware handles interpolation — single play command
      bleClient.playGesture(firmwareIds.current[sequence.id])
    } else {
      // Fallback: send each frame sequentially over UART
      playSequenceFallback(sequence, 0)
    }
  }

  function playSequenceFallback(sequence, fi, loop = 0, settled = false) {
    if (!bleClient) return

    // Before the very first loop, settle to OPEN so every loop starts from
    // the same known position — fixes the "first index feels rushed" issue.
    if (fi === 0 && loop === 0 && !settled) {
      const openGesture = GESTURES.find(g => g.id === 'open_default')
      if (openGesture) {
        setServoAngles(prev => ({ ...prev, ...openGesture.angles }))
        bleClient.queue(
          Object.entries(openGesture.angles)
            .filter(([k]) => Number(k) < 18)
            .map(([k, v]) => `set:${k}:${v}\n`)
        )
      }
      seqTimer.current = setTimeout(
        () => playSequenceFallback(sequence, 0, 0, true),
        sequence.frameMs ?? 600
      )
      return
    }

    // End of one loop pass
    if (fi >= sequence.frames.length) {
      const nextLoop = loop + 1
      if (nextLoop < (sequence.loopCount ?? 1)) {
        playSequenceFallback(sequence, 0, nextLoop, true)
      }
      return
    }

    const frame = sequence.frames[fi]
    const { angles } = frame
    setServoAngles(prev => ({ ...prev, ...angles }))
    bleClient.queue(
      Object.entries(angles)
        .filter(([k]) => Number(k) < 18)
        .map(([k, v]) => `set:${k}:${v}\n`)
    )
    const delay = (frame.frameMs ?? sequence.frameMs ?? 600) + (frame.holdMs ?? sequence.holdMs ?? 300)
    seqTimer.current = setTimeout(() => playSequenceFallback(sequence, fi + 1, loop, settled), delay)
  }

  // Program all gestures and sequences into firmware RAM.
  // Two packets per gesture slot: CONFIG (7 bytes) then FRAME(s) (20 bytes each).
  // Pass `client` explicitly so the auto-sync useEffect doesn't race with state.
  async function syncGestures(client = bleClient) {
    if (!client) return
    setSynced('syncing')
    const ids = {}
    let fwId = 0
    try {
      // ── Single-frame gestures ─────────────────────────────────
      for (const g of GESTURES) {
        await client.defineGestureFrame(buildConfigPacket(fwId, 1, 500, 0))
        await client.defineGestureFrame(buildFramePacket(fwId, 0, g.angles))
        ids[g.id] = fwId
        fwId++
      }
      // ── Multi-frame sequences ─────────────────────────────────
      for (const seq of SEQUENCES) {
        const fms = seq.frameMs ?? 600
        const hms = seq.holdMs  ?? 300
        // Expand loopCount for firmware (firmware doesn't loop natively)
        const fwFrames = Array.from({ length: seq.loopCount ?? 1 }, () => seq.frames).flat()
        await client.defineGestureFrame(buildConfigPacket(fwId, fwFrames.length, fms, hms))
        for (let fi = 0; fi < fwFrames.length; fi++) {
          await client.defineGestureFrame(buildFramePacket(fwId, fi, fwFrames[fi].angles))
        }
        ids[seq.id] = fwId
        fwId++
      }
      firmwareIds.current = ids
      setSynced(true)
    } catch (err) {
      console.error('[sync] failed:', err)
      setSynced(false)
    }
  }

  // CONFIG packet (7 bytes): [0x01][id][numFrames][fms_hi][fms_lo][hms_hi][hms_lo]
  function buildConfigPacket(id, numFrames, frameMs, holdMs) {
    const p = new Uint8Array(7)
    p[0] = 0x01; p[1] = id; p[2] = numFrames
    p[3] = (frameMs >> 8) & 0xFF; p[4] = frameMs & 0xFF
    p[5] = (holdMs  >> 8) & 0xFF; p[6] = holdMs  & 0xFF
    return p
  }

  // FRAME packet (20 bytes): [0x02][(id<<4)|fi][s0..s17]
  function buildFramePacket(id, fi, angles) {
    const p = new Uint8Array(20)
    p[0] = 0x02; p[1] = ((id & 0x0F) << 4) | (fi & 0x0F)
    for (let i = 0; i < 18; i++) p[2 + i] = angles[i] ?? 0
    return p
  }

  function copyAngles() {
    const line = Object.entries(servoAngles)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
    navigator.clipboard.writeText(`{ ${line} }`)
  }

  async function pasteAngles() {
    try {
      const text = await navigator.clipboard.readText()
      const angles = {}
      for (const [, k, v] of text.matchAll(/(\d+):\s*(\d+)/g))
        angles[parseInt(k)] = parseInt(v)
      if (!Object.keys(angles).length) return false
      setServoAngles(prev => ({ ...prev, ...angles }))
      if (bleClient) bleClient.queue(Object.entries(angles).map(([k, v]) => `set:${k}:${v}\n`))
      return true
    } catch (e) {
      console.error('[paste angles]', e)
      return false
    }
  }

  // Clicking a zone from the main page auto-enters control mode
  function handleSelectZone(zone) {
    setSelectedZone(zone)
    if (zone) setControlMode(true)
  }

  function exitControl() {
    setSelectedZone(null)
    setCalibrate(false)
    setEditing(false)
    setControlMode(false)
  }

  function resetServos() {
    window.dispatchEvent(new CustomEvent('dexhand:resetServos'))
    if (bleClient) {
      const config = getServoConfig()
      const cmds = Object.values(config).flat().map(({ index, def }) =>
        `set:${index}:${def}\n`
      )
      bleClient.queue(cmds)
    }
  }

  return (
    <>
      <DotGrid />
      <DashSidebar
        controlMode={controlMode}
        mirrorActive={mirrorActive}
        onToggleMirror={() => setMirrorActive(v => !v)}
        calibrate={calibrate}
        onToggleCalibrate={() => setCalibrate(v => !v)}
        onConnect={client => { setBleClient(client); if (!client) { setSynced(false); firmwareIds.current = {} } }}
        onStatusChange={(s, name) => { setBleStatus(s); setBleDevice(name) }}
        onCopyAngles={copyAngles}
        onPasteAngles={pasteAngles}
        onResetAngles={resetServos}
        onPlayGesture={handleGesturePlay}
        onPlaySequence={handleSequencePlay}
      />

      {/* Hand model — fixed full-screen layer, same as every other element */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1,
        opacity: mirrorActive ? 0 : 1,
        transition: 'opacity 0.4s ease',
        pointerEvents: mirrorActive ? 'none' : 'all',
      }}>
        <HandMap
          selectedZone={selectedZone}
          onSelectZone={handleSelectZone}
          controlMode={controlMode}
          calibrate={calibrate}
        />
      </div>

      {!selectedZone && !calibrate && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          textAlign: 'right',
          fontSize: 12,
          fontWeight: 400,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          opacity: 0.5,
          pointerEvents: 'none',
          fontFamily: 'var(--font)',
          zIndex: 30,
        }}>
          {mirrorActive && bleStatus === 'connected' ? 'Use your hand to teleoperate DexHand' :
           bleStatus === 'connected' ? 'Select a zone to control' :
           'Connect a device to get started'}
        </div>
      )}

      {mirrorActive && (
        <div style={{ position: 'fixed', top: 20, right: 0, display: 'flex', zIndex: 50 }}>
          <CtrlBtn onClick={() => setMirrorActive(false)}>Exit Mirror</CtrlBtn>
        </div>
      )}

      {calibrate && !controlMode && !mirrorActive && (
        <div style={{ position: 'fixed', top: 20, right: 0, display: 'flex', zIndex: 50 }}>
          <CtrlBtn onClick={() => { window.dispatchEvent(new CustomEvent('dexhand:resetZones')); setCalibrate(false) }}>Exit Calibrate</CtrlBtn>
        </div>
      )}

      {controlMode && (
        <>
          {/* Right top: Exit Control */}
          <div style={{ position: 'fixed', top: 20, right: 0, display: 'flex', zIndex: 30 }}>
            <CtrlBtn onClick={exitControl}>Exit Control</CtrlBtn>
          </div>

          {selectedZone && (
            <ServoPanel
              zone={selectedZone}
              onSelectZone={handleSelectZone}
              angles={servoAngles}
              onChange={handleAngleChange}
              onResetZone={servos => {
                const updates = Object.fromEntries(servos.map(({ index, def }) => [index, def]))
                setServoAngles(prev => ({ ...prev, ...updates }))
                if (bleClient) bleClient.queue(servos.map(({ index, def }) => `set:${index}:${def}\n`))
              }}
              editing={editing}
              onToggleEditing={() => setEditing(v => !v)}
            />
          )}
        </>
      )}
      <MediaPipeTracker active={mirrorActive} onAngles={handleMirrorAngles} />
    </>
  )
}
