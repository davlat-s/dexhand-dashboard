import { useState } from 'react'
import { GESTURES } from '../gestures.js'

export default function GesturesPanel({ onPlay }) {
  const [active, setActive] = useState(null)

  function play(gesture) {
    setActive(gesture.id)
    onPlay(gesture.angles)
  }

  if (GESTURES.length === 0) {
    return (
      <div style={s.panel}>
        <p style={s.empty}>
          No gestures yet — pose the hand, click <strong>Copy Angles</strong> in the sidebar,
          then paste into <code>src/gestures.js</code>.
        </p>
      </div>
    )
  }

  return (
    <div style={s.panel}>
      <p style={s.label}>Gestures</p>
      <div style={s.grid}>
        {GESTURES.map(g => (
          <button
            key={g.id}
            style={{ ...s.btn, ...(active === g.id ? s.btnActive : {}) }}
            onClick={() => play(g)}
          >
            {g.name}
          </button>
        ))}
      </div>
    </div>
  )
}

const s = {
  panel: {
    position: 'fixed',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 40,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    fontFamily: 'var(--font)',
    minWidth: 280,
    maxWidth: '80vw',
  },
  label: {
    fontSize: 10,
    fontWeight: 500,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    opacity: 0.5,
  },
  grid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  btn: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: '8px 16px',
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    letterSpacing: '-0.01em',
    transition: 'background 0.15s, border-color 0.15s, color 0.15s',
  },
  btnActive: {
    background: 'rgba(128,203,196,0.15)',
    borderColor: 'var(--accent)',
    color: 'var(--accent)',
  },
  empty: {
    fontSize: 12,
    color: 'var(--text-muted)',
    lineHeight: 1.6,
    maxWidth: 340,
  },
}
