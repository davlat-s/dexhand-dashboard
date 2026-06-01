import React, { useState, useRef, useCallback, useEffect } from 'react'
import './HandMap.css'

// area: [L, T, W, H] — landscape-inner coordinate space (before CSS rotation)
// After 90° CW rotation, visual portrait position:
//   visual_top    = L        visual_height = W
//   visual_left   = 100-T-H  visual_width  = H
// H=6.9 uniform across all four fingers (visual width); T adjusted to keep visual center fixed
const INITIAL_ZONES = {
  pinky:  { label: 'Pinky',  color: '#81c784', area: [20.5, 64.4, 14.8, 6.9], rot: -8.7 },
  ring:   { label: 'Ring',   color: '#64b5f6', area: [18.4, 58.4, 16.8, 6.9], rot: -4.2 },
  middle: { label: 'Middle', color: '#ffd54f', area: [17.1, 51.9, 17.3, 6.9], rot: 0.7  },
  index:  { label: 'Index',  color: '#f06292', area: [17.8, 45.8, 16,   6.9], rot: 3.5  },
  thumb:  { label: 'Thumb',  color: '#ba68c8', area: [26.6, 35.4, 22,   8.8], rot: 45.2 },
  wrist:  { label: 'Wrist',  color: '#e57373', area: [43.8, 46.2, 8.8, 23.1], rot: 0    },
}

function r1(v) { return Math.round(v * 10) / 10 }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

// ─── coordinate math ────────────────────────────────────────────────────────
// landscape-inner is rotated 90° CW. getBoundingClientRect() returns the
// VISUAL bounding box, so:
//   rect.width  = landscape CSS height  (visual width  after rotation)
//   rect.height = landscape CSS width   (visual height after rotation)
//
// Mouse delta → landscape delta:
//   dL = +dy_screen / rect.height * 100   (visual Y → landscape X, same sign)
//   dT = -dx_screen / rect.width  * 100   (visual X → landscape Y, INVERTED)
// ────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'dexhand-zones'

function loadZones() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : INITIAL_ZONES
  } catch { return INITIAL_ZONES }
}

export default function HandMap({ selectedZone, onSelectZone, controlMode, calibrate }) {
  const [zones, setZones] = useState(loadZones)
  const [defaults, setDefaults] = useState(loadZones)
  const [copied, setCopied] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const innerRef = useRef(null)
  const drag = useRef(null)

  const startDrag = useCallback((e, key, mode) => {
    e.preventDefault()
    e.stopPropagation()
    drag.current = {
      key, mode,
      x0: e.clientX, y0: e.clientY,
      area0: [...zones[key].area],
      rot0: zones[key].rot ?? 0,
    }
  }, [zones])

  useEffect(() => {
    function onReset() { setZones(defaults) }
    window.addEventListener('dexhand:resetZones', onReset)
    return () => window.removeEventListener('dexhand:resetZones', onReset)
  }, [defaults])

  useEffect(() => {
    if (!calibrate) return
    function onMove(e) {
      if (!drag.current || !innerRef.current) return
      const { key, mode, x0, y0, area0, rot0 } = drag.current
      const rect = innerRef.current.getBoundingClientRect()

      const sx = e.clientX - x0
      const sy = e.clientY - y0

      if (mode === 'rotate') {
        setZones(prev => ({ ...prev, [key]: { ...prev[key], rot: r1(rot0 + sx * 0.35) } }))
        return
      }

      const dL = sy / rect.height * 100
      const dT = -sx / rect.width  * 100
      const [l0, t0, w0, h0] = area0
      let nl = l0, nt = t0, nw = w0, nh = h0

      if (mode === 'move') {
        nl = clamp(l0 + dL, 0, 100 - w0)
        nt = clamp(t0 + dT, 0, 100 - h0)
      } else if (mode === 'resize-bottom') {
        nw = clamp(w0 + dL, 2, 100 - l0)
      } else if (mode === 'resize-top') {
        nl = clamp(l0 + dL, 0, l0 + w0 - 2)
        nw = clamp(w0 - dL, 2, 100)
      } else if (mode === 'resize-right') {
        nh = clamp(h0 - dT, 2, 100 - t0)
        nt = clamp(t0 + dT, 0, 100 - h0)
      } else if (mode === 'resize-left') {
        nh = clamp(h0 + dT, 2, 100 - t0)
        nt = clamp(t0 - dT, 0, 100 - h0)
      }

      setZones(prev => ({ ...prev, [key]: { ...prev[key], area: [r1(nl), r1(nt), r1(nw), r1(nh)] } }))
    }
    function onUp() { drag.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [calibrate])

  function copyCoords() {
    const lines = Object.entries(zones).map(([k, z]) => {
      const [l, t, w, h] = z.area
      const rot = z.rot ?? 0
      return `  ${k.padEnd(6)}: { label: '${z.label}', color: '${z.color}', area: [${l}, ${t}, ${w}, ${h}], rot: ${rot} },`
    })
    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="handmap">
      <div className="rotate-wrapper">
        <div className="landscape-inner" ref={innerRef}>
          <img src="/Dexhand.svg" className="hand-svg" alt="DexHand" draggable={false} />

          {Object.entries(zones).map(([key, zone]) => {
            const [l, t, w, h] = zone.area
            const rot = zone.rot ?? 0
            return (
              <div
                key={key}
                className={`hit-zone ${selectedZone === key ? 'active' : ''}`}
                style={{
                  left: `${l}%`, top: `${t}%`,
                  width: `${w}%`, height: `${h}%`,
                  transform: rot !== 0 ? `rotate(${rot}deg)` : undefined,
                  '--zone-color': zone.color,
                  background: calibrate ? zone.color + '44' : undefined,
                  borderColor: calibrate ? zone.color : undefined,
                  cursor: calibrate ? 'move' : 'pointer',
                  opacity: !calibrate && !controlMode && selectedZone !== key ? 0.7 : 1,
                }}
                onMouseDown={calibrate ? e => startDrag(e, key, 'move') : undefined}
                onClick={!calibrate ? () => onSelectZone(selectedZone === key ? null : key) : undefined}
              >
                {calibrate && <span className="zone-label">{zone.label}</span>}

                {calibrate && <>
                  <div className="rh rh-top"    onMouseDown={e => { e.stopPropagation(); startDrag(e, key, 'resize-top') }} />
                  <div className="rh rh-bottom" onMouseDown={e => { e.stopPropagation(); startDrag(e, key, 'resize-bottom') }} />
                  <div className="rh rh-right"  onMouseDown={e => { e.stopPropagation(); startDrag(e, key, 'resize-right') }} />
                  <div className="rh rh-left"   onMouseDown={e => { e.stopPropagation(); startDrag(e, key, 'resize-left') }} />
                  <div className="rh rh-rotate" onMouseDown={e => { e.stopPropagation(); startDrag(e, key, 'rotate') }}>↻</div>
                </>}
              </div>
            )
          })}
        </div>
      </div>

      {calibrate && (
        <div className="cal-panel">
          <div className="cal-panel-zones">
            {Object.entries(zones).map(([key, zone]) => {
              const [l, t, w, h] = zone.area
              const rot = zone.rot ?? 0
              return (
                <div key={key} className="cal-zone-row">
                  <span className="cal-zone-dot" style={{ background: zone.color }} />
                  <span className="cal-zone-name">{zone.label}</span>
                  <span className="cal-zone-coords">
                    [{l}, {t}, {w}, {h}]{rot !== 0 ? ` ${rot}°` : ''}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="cal-panel-footer">
            <button className="cal-panel-btn" onClick={() => setZones(defaults)}>Reset</button>
            <button className="cal-panel-btn" onClick={() => {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(zones))
              setDefaults(zones)
              setSavedFlash(true)
              setTimeout(() => setSavedFlash(false), 2000)
            }}>{savedFlash ? 'Saved ✓' : 'Set Default'}</button>
            <button className="cal-panel-btn" onClick={copyCoords}>
              {copied ? 'Copied ✓' : 'Copy Coords'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
