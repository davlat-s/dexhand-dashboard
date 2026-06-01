import { useState } from 'react'
import BleStatus from './BleStatus.jsx'
import { ITEMS } from '../gestures.js'

export default function DashSidebar({
  controlMode, mirrorActive, onToggleMirror,
  calibrate, onToggleCalibrate,
  onConnect, onStatusChange,
  onCopyAngles, onPasteAngles, onResetAngles,
  onPlayGesture, onPlaySequence,
}) {
  const [copied,     setCopied]     = useState(false)
  const [pasted,     setPasted]     = useState(false)
  const [pasteError, setPasteError] = useState(false)
  const [reset,      setReset]      = useState(false)
  const [activeGesture, setActiveGesture] = useState(null)
  const faded = calibrate

  function handleCopy() {
    onCopyAngles()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleGesture(id, fn) {
    setActiveGesture(id)
    fn()
  }

  return (
    <div style={{ ...s.sidebar, opacity: faded ? 0 : 1, pointerEvents: faded ? 'none' : 'all', transition: 'opacity 0.4s ease' }}>

      <p style={s.name}>DexHand Dashboard</p>

      <div style={s.section}>
        <p style={s.sectionLabel}>Device</p>
        <BleStatus view="button" onConnect={onConnect} onStatusChange={onStatusChange} />
      </div>

      {!mirrorActive && !controlMode && (
        <>
          <div style={{ ...s.section, marginTop: 24 }}>
            <p style={s.sectionLabel}>Mode</p>
            <ModeLink label="Mirror"    active={mirrorActive} onClick={onToggleMirror} />
            <ModeLink label="Calibrate" active={calibrate}    onClick={onToggleCalibrate} />
          </div>

          {ITEMS.length > 0 && (
            <div style={{ ...s.section, marginTop: 24 }}>
              <p style={s.sectionLabel}>Gestures</p>
              {ITEMS.map(item => (
                <ModeLink key={item.id} label={item.name} active={activeGesture === item.id}
                  onClick={() => handleGesture(item.id, () =>
                    item.frames ? onPlaySequence(item) : onPlayGesture(item)
                  )} />
              ))}
            </div>
          )}
        </>
      )}

      {!mirrorActive && (
        <div style={{ ...s.section, marginTop: 24 }}>
          <p style={s.sectionLabel}>Servo Angles</p>
          <ModeLink label={copied ? 'Copied ✓' : 'Copy'} active={copied} onClick={handleCopy} />
          <ModeLink
            label={pasted ? 'Applied ✓' : pasteError ? 'Wrong Input ✗' : 'Paste'}
            active={pasted}
            onClick={async () => {
              const ok = await onPasteAngles()
              if (ok) {
                setPasted(true)
                setTimeout(() => setPasted(false), 2000)
              } else {
                setPasteError(true)
                setTimeout(() => setPasteError(false), 2000)
              }
            }} />
          <ModeLink label={reset ? 'Reset ✓' : 'Reset'} active={reset} onClick={() => {
            onResetAngles()
            setReset(true)
            setTimeout(() => setReset(false), 2000)
          }} />
        </div>
      )}

    </div>
  )
}

function ModeLink({ label, active, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...s.link, color: active || hovered ? 'var(--text)' : 'var(--text-muted)' }}
    >
      {label}
    </button>
  )
}


const s = {
  sidebar: {
    position: 'fixed',
    top: 0, left: 0,
    height: '100vh',
    width: 200,
    padding: '32px 24px',
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    pointerEvents: 'all',
    fontFamily: 'var(--font)',
  },
  name: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text)',
    lineHeight: 1.3,
    letterSpacing: '-0.01em',
    marginBottom: 16,
  },
  social: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginBottom: 48,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 500,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    marginBottom: 0,
    opacity: 0.5,
  },
  link: {
    fontSize: 13,
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    transition: 'color 0.15s',
    cursor: 'pointer',
    letterSpacing: '-0.01em',
    background: 'none',
    border: 'none',
    padding: 0,
    fontFamily: 'var(--font)',
  },
}
