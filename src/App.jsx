import React, { useState } from 'react'
import HandMap from './components/HandMap.jsx'
import ServoPanel, { getServoConfig } from './components/ServoPanel.jsx'
import DashSidebar from './components/DashSidebar.jsx'
import DotGrid from './components/DotGrid.jsx'
import MediaPipeTracker from './components/MediaPipeTracker.jsx'
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
  const [bleClient,    setBleClient]    = useState(null)
  const [bleStatus,    setBleStatus]    = useState('disconnected')
  const [bleDevice,    setBleDevice]    = useState(null)
  const [mirrorActive, setMirrorActive] = useState(false)

  function handleAngleChange(servoIndex, angle) {
    setServoAngles(prev => ({ ...prev, [servoIndex]: angle }))
    if (bleClient) bleClient.send(`set:${servoIndex}:${angle}\n`)
  }

  function handleMirrorAngles(angles) {
    setServoAngles(prev => ({ ...prev, ...angles }))
    if (bleClient) bleClient.mirror(angles)
  }

  // Clicking a zone from the main page auto-enters control mode
  function handleSelectZone(zone) {
    setSelectedZone(zone)
    setEditing(false)
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
        onConnect={setBleClient}
        onStatusChange={(s, name) => { setBleStatus(s); setBleDevice(name) }}
      />

      {/* BLE status indicator — always visible bottom-left */}
      <div style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 50, display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: bleStatus === 'connected' ? '#4ade80' : bleStatus === 'connecting' ? '#f59e0b' : '#ef4444',
          boxShadow: bleStatus === 'connected' ? '0 0 5px rgba(74,222,128,0.5)' : 'none',
          animation: bleStatus === 'connecting' ? 'ble-pulse 1s infinite' : 'none',
        }} />
        <span style={{
          fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em',
          color: 'var(--text-muted)', fontFamily: 'var(--font)',
          whiteSpace: 'nowrap',
        }}>
          {bleStatus === 'connected'  ? (bleDevice ?? 'Connected') :
           bleStatus === 'connecting' ? 'Connecting…' :
                                        'Disconnected'}
        </span>
      </div>

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

      {!selectedZone && !calibrate && !mirrorActive && (
        <div style={{
          position: 'fixed',
          bottom: 40,
          left: 0, right: 0,
          textAlign: 'center',
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
          {bleStatus === 'connected' ? 'Select a zone to control' : 'Connect a device to get started'}
        </div>
      )}

      {mirrorActive && (
        <div style={{ position: 'fixed', top: 20, right: 0, display: 'flex', zIndex: 50 }}>
          <CtrlBtn onClick={() => setMirrorActive(false)}>Exit Mirror</CtrlBtn>
        </div>
      )}

      {calibrate && !controlMode && !mirrorActive && (
        <div style={{ position: 'fixed', top: 20, right: 0, display: 'flex', zIndex: 50 }}>
          <CtrlBtn onClick={() => setCalibrate(false)}>Exit Calibrate</CtrlBtn>
        </div>
      )}

      {controlMode && (
        <>
          {/* Left top: Reset Servos — only when a zone is selected */}
          {selectedZone && !editing && (
            <div style={{ position: 'fixed', top: 20, left: 0, display: 'flex', zIndex: 30 }}>
              <CtrlBtn onClick={resetServos}>Reset Servos</CtrlBtn>
            </div>
          )}

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
