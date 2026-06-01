import React, { useState, useEffect, useRef } from 'react'
import './ServoPanel.css'

const ZONES = ['index', 'middle', 'ring', 'pinky', 'thumb', 'wrist']

const ZONE_COLORS = {
  index:  '#f06292',
  middle: '#ffd54f',
  ring:   '#64b5f6',
  pinky:  '#81c784',
  thumb:  '#ba68c8',
  wrist:  '#e57373',
}

function BoundedInput({ value, min, max, onChange }) {
  const [raw, setRaw] = useState(String(value))
  useEffect(() => { setRaw(String(value)) }, [value])
  function commit(str) {
    const n = Number(str)
    if (!isNaN(n) && str.trim() !== '') onChange(Math.max(min, Math.min(max, n)))
    else setRaw(String(value))
  }
  return (
    <input
      type="number"
      className="edit-number"
      value={raw}
      onChange={e => setRaw(e.target.value)}
      onBlur={e => commit(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') { commit(e.target.value); e.target.blur() } }}
    />
  )
}

// Limits match firmware ManagedServo constructors: ManagedServo(pin, min, max, default, inverted)
const BASE_CONFIG = {
  index:  [
    { index: 0,  label: 'Lower',  min: 0, max: 180, def: 30  },
    { index: 1,  label: 'Upper',  min: 0, max: 180, def: 30  },
    { index: 8,  label: 'Tip',    min: 0, max: 180, def: 30  },
  ],
  middle: [
    { index: 2,  label: 'Lower',  min: 0, max: 180, def: 30  },
    { index: 3,  label: 'Upper',  min: 0, max: 180, def: 150 },
    { index: 9,  label: 'Tip',    min: 0, max: 180, def: 30  },
  ],
  ring:   [
    { index: 4,  label: 'Lower',  min: 0, max: 180, def: 30  },
    { index: 5,  label: 'Upper',  min: 0, max: 180, def: 150 },
    { index: 10, label: 'Tip',    min: 0, max: 180, def: 30  },
  ],
  pinky:  [
    { index: 6,  label: 'Lower',  min: 0, max: 180, def: 30  },
    { index: 7,  label: 'Upper',  min: 0, max: 180, def: 30  },
    { index: 11, label: 'Tip',    min: 0, max: 180, def: 30  },
  ],
  thumb:  [
    { index: 12, label: 'Tip',    min: 0, max: 180, def: 120 },
    { index: 13, label: 'Right',  min: 0, max: 180, def: 30  },
    { index: 14, label: 'Left',   min: 0, max: 180, def: 20  },
    { index: 15, label: 'Rotate', min: 0, max: 180, def: 30  },
  ],
  wrist:  [
    { index: 16, label: 'Left',   min: 0, max: 180, def: 95 },
    { index: 17, label: 'Right',  min: 0, max: 180, def: 95 },
  ],
}

const STORAGE_KEY = 'dexhand-servo-config'

// Returns the current servo config (from localStorage or BASE_CONFIG).
// Used by App to read the user's saved defaults for reset/connect.
export function getServoConfig() {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    return s ? JSON.parse(s) : BASE_CONFIG
  } catch { return BASE_CONFIG }
}
const MIN_H = 28
const MAX_H = 55

function loadConfig() {
  try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s) } catch {}
  return BASE_CONFIG
}
function saveConfig(cfg) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)) } catch {}
}

export default function ServoPanel({ zone, onSelectZone, angles, onChange, onResetZone, editing, onToggleEditing }) {
  const [config, setConfig] = useState(loadConfig)
  const [active, setActive] = useState(zone || 'index')
  const [panelH,  setPanelH]  = useState(36)
  const drag = useRef(null)

  useEffect(() => { if (zone) setActive(zone) }, [zone])

  // Reset ALL servos across all zones to their defaults
  useEffect(() => {
    function handleReset() {
      Object.values(config).forEach(zone =>
        zone.forEach(({ index, def }) => onChange(index, def))
      )
    }
    window.addEventListener('dexhand:resetServos', handleReset)
    return () => window.removeEventListener('dexhand:resetServos', handleReset)
  }, [config, onChange])

  // Drag-to-resize (same logic as playground)
  useEffect(() => {
    function onMove(e) {
      if (!drag.current) return
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      const deltaVh = ((drag.current.startY - clientY) / window.innerHeight) * 100
      setPanelH(Math.min(MAX_H, Math.max(MIN_H, drag.current.startH + deltaVh)))
    }
    function onUp() { drag.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend',  onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend',  onUp)
    }
  }, [])

  function startDrag(clientY) {
    drag.current = { startY: clientY, startH: panelH }
  }

  function switchTab(z) {
    setActive(z)
    onSelectZone?.(z)
  }

  const servos = config[active]
  const zoneColor = ZONE_COLORS[active] ?? 'var(--accent)'

  function updateServo(servoIndex, patch) {
    setConfig(prev => {
      const next = { ...prev, [active]: prev[active].map(s => s.index === servoIndex ? { ...s, ...patch } : s) }
      saveConfig(next)
      return next
    })
  }

  function resetToDefaults() {
    // Pass current zone's servos to App so it can bulk-queue via bleClient.queue()
    // (calling onChange per-servo uses send() which is latest-wins and drops commands)
    if (onResetZone) onResetZone(servos)
  }

  return (
    <div className="servo-panel" style={{ height: `${panelH}vh` }}>

      {/* ── Drag handle ── */}
      <div
        className="panel-drag-handle"
        onMouseDown={e => startDrag(e.clientY)}
        onTouchStart={e => startDrag(e.touches[0].clientY)}
      >
        <div className="panel-drag-pill" />
      </div>

      {/* ── Tabs ── */}
      <div className="panel-tabs">
        {ZONES.map(z => (
          <button
            key={z}
            className={`panel-tab ${active === z ? 'panel-tab-active' : ''}`}
            style={active === z ? { color: ZONE_COLORS[z] } : undefined}
            onClick={() => switchTab(z)}
          >
            {z.charAt(0).toUpperCase() + z.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Sliders ── */}
      <div className="servo-list">
        {servos.map(({ index, label, min, max, def }) => {
          const value  = Math.max(min, Math.min(max, angles[index] ?? def))
          const pct    = max > min ? ((value - min) / (max - min)) * 100 : 0
          const defPct = max > min ? ((def   - min) / (max - min)) * 100 : 0

          return (
            <div key={index} className="servo-row">
              <div className="servo-meta">
                <span className="servo-label">{index}.&nbsp;{label}</span>

                <div className="slider-track">
                  {editing && <div className="slider-default-marker" style={{ left: `${defPct}%`, background: zoneColor, opacity: 0.5 }} />}
                  <div className="slider-fill" style={{ width: `${pct}%`, background: value === def ? zoneColor : undefined, opacity: value === def ? 0.5 : undefined }} />
                  <input
                    type="range" min={min} max={max} value={value}
                    onChange={e => onChange(index, Number(e.target.value))}
                    className="slider"
                  />
                </div>

                {editing ? (
                  <>
                    <input
                      type="number" className="servo-angle-input"
                      value={value} min={min} max={max}
                      onChange={e => onChange(index, Math.max(min, Math.min(max, Number(e.target.value))))}
                    />
                    <button className="set-def-btn" style={{ color: zoneColor, opacity: 0.5 }} onClick={() => updateServo(index, { def: value })}>
                      Set default
                    </button>
                    <button className="set-def-btn" onClick={() => updateServo(index, { min: value })}>
                      Set min
                    </button>
                    <BoundedInput value={min} min={0} max={max - 1}
                      onChange={v => updateServo(index, { min: v })} />
                    <button className="set-def-btn" onClick={() => updateServo(index, { max: value })}>
                      Set max
                    </button>
                    <BoundedInput value={max} min={min + 1} max={180}
                      onChange={v => updateServo(index, { max: v })} />
                  </>
                ) : (
                  <span className="servo-angle">{value}°</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Footer: Reset + Edit ── */}
      <div className="servo-footer">
        <button className="servo-reset-btn" onClick={resetToDefaults}>Reset</button>
        <button className="servo-reset-btn" onClick={onToggleEditing}
          style={{ color: editing ? zoneColor : undefined }}>
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

    </div>
  )
}
