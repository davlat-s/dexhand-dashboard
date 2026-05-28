import { useState } from 'react'
import BleStatus from './BleStatus.jsx'


export default function DashSidebar({ controlMode, mirrorActive, onToggleMirror, calibrate, onToggleCalibrate, onConnect, onStatusChange }) {
  const faded = controlMode || mirrorActive || calibrate
  return (
    <div style={{ ...s.sidebar, opacity: faded ? 0 : 1, pointerEvents: faded ? 'none' : 'all', transition: 'opacity 0.4s ease' }}>

      <p style={s.name}>DexHand Dashboard</p>

      <div style={s.section}>
        <p style={s.sectionLabel}>Mode</p>
        <ModeLink label="Mirror"    active={mirrorActive} onClick={onToggleMirror} />
        <ModeLink label="Calibrate" active={calibrate}    onClick={onToggleCalibrate} />
      </div>

      <div style={{ ...s.section, marginTop: 24 }}>
        <p style={s.sectionLabel}>Device</p>
        <BleStatus view="button" onConnect={onConnect} onStatusChange={onStatusChange} />
      </div>

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
