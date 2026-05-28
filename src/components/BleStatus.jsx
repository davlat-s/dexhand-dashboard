import React, { useState, useRef, useEffect } from 'react'
import './BleStatus.css'

const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
const NUS_RX_CHAR = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'

// view: 'button' | 'indicator' | 'all'
export default function BleStatus({ onConnect, onStatusChange, view = 'all' }) {
  const [status, setStatus]         = useState('disconnected')
  const [deviceName, setDeviceName] = useState(null)
  const deviceRef      = useRef(null)
  const rxCharRef      = useRef(null)
  const onStatusChangeRef = useRef(onStatusChange)
  useEffect(() => { onStatusChangeRef.current = onStatusChange }, [onStatusChange])

  function notifyStatus(s, name) {
    onStatusChangeRef.current?.(s, name ?? null)
  }

  const disconnecting  = useRef(false)  // guard against double handleDisconnect
  const pendingMsg  = useRef(null)
  const flushTimer  = useRef(null)
  const heartbeat   = useRef(null)
  const writing       = useRef(false)  // true while a writeValueWithResponse is in-flight
  const failStreak    = useRef(0)      // consecutive write failures; disconnect after 3
  const nextWrite     = useRef(null)   // latest slider value queued (latest wins)
  const bulkQueue     = useRef([])     // ordered queue for multi-sends (reset etc.)
  const mirrorPending = useRef(null)   // accumulates latest angles between snapshots
  const mirrorDrain   = useRef([])     // current snapshot being sent (drains one cmd at a time)
  const mirrorTimer   = useRef(null)   // rate-limit timer
  const hbPending     = useRef(false)  // heartbeat was skipped while writing; send ASAP

  useEffect(() => () => {
    clearTimeout(flushTimer.current)
    clearTimeout(mirrorTimer.current)
    clearInterval(heartbeat.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function connect() {
    if (!navigator.bluetooth) {
      alert('Web Bluetooth not supported. Use Chrome or Edge.')
      return
    }
    try {
      disconnecting.current = false
      setStatus('connecting')
      notifyStatus('connecting', null)
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [NUS_SERVICE] },
          { name: 'DexHand' },
          { namePrefix: 'Dex' },
        ],
        optionalServices: [NUS_SERVICE],
      })
      deviceRef.current = device
      device.addEventListener('gattserverdisconnected', () => handleDisconnect(true))
      const server  = await device.gatt.connect()
      const service = await server.getPrimaryService(NUS_SERVICE)
      const rxChar  = await service.getCharacteristic(NUS_RX_CHAR)
      rxCharRef.current = rxChar

      console.log('[BLE] RX char properties:', rxChar.properties)

      setDeviceName(device.name)
      setStatus('connected')
      notifyStatus('connected', device.name)

      // Heartbeat: keep link alive while idle. Skip silently if a write is
      // already in-flight — stacking concurrent GATT ops destabilises the link.
      // Firmware disconnects after 30 s without an 'hb' command — send every 10 s
      heartbeat.current = setInterval(() => {
        if (!writing.current) sendNow('hb\n')
        else hbPending.current = true  // write in flight — send hb as soon as it completes
      }, 10000)

      onConnect({ send, queue, mirror })
    } catch (err) {
      console.error('[BLE] connect error:', err)
      setStatus('disconnected')
      notifyStatus('disconnected', null)
    }
  }

  // Throttled send — buffers latest message and flushes at most every 100ms
  function send(msg) {
    pendingMsg.current = msg
    if (!flushTimer.current) {
      flushTimer.current = setTimeout(() => {
        flushTimer.current = null
        const toSend = pendingMsg.current
        pendingMsg.current = null
        if (toSend) sendNow(toSend)
      }, 100)
    }
  }

  async function sendNow(msg) {
    if (writing.current) {
      nextWrite.current = msg   // latest slider value wins; bulk queue is unaffected
      return
    }
    const rxChar = rxCharRef.current
    if (!rxChar) return
    writing.current = true
    let failed = false
    try {
      await rxChar.writeValueWithResponse(new TextEncoder().encode(msg))
      failStreak.current = 0
    } catch (err) {
      console.warn('[BLE] write error:', err.name, err.message, '| msg:', msg.trim(), '| streak:', failStreak.current + 1)
      failStreak.current++
      // NetworkError is unambiguous. NotSupportedError can be transient (GATT
      // queue hiccup), so we tolerate up to 3 before treating it as a real drop.
      if (err.name === 'NetworkError' || failStreak.current >= 3) {
        failed = true
      }
    } finally {
      if (failed) {
        console.error('[BLE] disconnecting — cause:', failed, '| last msg:', msg.trim(),
          '| bulkQueue:', bulkQueue.current.length,
          '| mirrorDrain:', mirrorDrain.current.length,
          '| mirrorPending:', !!mirrorPending.current,
          '| failStreak:', failStreak.current)
        failStreak.current = 0; handleDisconnect(); return
      }
      writing.current = false

      // After a write error, pause 200 ms before the next write. A NotSupportedError
      // destabilises the Nina W102 GATT stack — backing off gives it time to recover
      // before we send again, reducing the chance it resets the connection entirely.
      const nextDelay = failStreak.current > 0 ? 200 : 0

      // Flush a queued heartbeat first — keeps the firmware connection alive even
      // when mirror mode keeps writing.current = true for long stretches.
      if (hbPending.current) {
        hbPending.current = false
        setTimeout(() => sendNow('hb\n'), nextDelay)
        return
      }

      // Priority: bulk (reset) → mirror drain → pending snapshot → slider
      // Mirror drain also gets a 40 ms breathing gap per command (even without errors)
      // to prevent the GATT queue from filling up under continuous hand-tracking.
      if (bulkQueue.current.length) {
        setTimeout(() => sendNow(bulkQueue.current.shift()), nextDelay)
      } else if (mirrorDrain.current.length) {
        setTimeout(() => {
          if (mirrorDrain.current.length) sendNow(mirrorDrain.current.shift())
          else if (mirrorPending.current) flushMirror()
        }, Math.max(40, nextDelay))
      } else if (mirrorPending.current) {
        // Current drain finished — immediately start next accumulated snapshot
        setTimeout(() => flushMirror(), nextDelay)
      } else if (nextWrite.current) {
        const next = nextWrite.current
        nextWrite.current = null
        setTimeout(() => sendNow(next), nextDelay)
      }
    }
  }

  // Send an ordered list of commands — each waits for the previous to complete.
  // Used for reset so every servo gets its own set: command rather than a single
  // firmware 'default\n' that can block long enough to trigger a write timeout.
  function queue(msgs) {
    bulkQueue.current.push(...msgs)
    if (!writing.current) sendNow(bulkQueue.current.shift())
  }

  // Rate-limited mirror: accumulates the latest servo angles from MediaPipe.
  // A drain cycle sends every servo in the snapshot one-by-one. When a drain
  // finishes, the accumulated pending snapshot starts immediately — we never
  // replace mirrorDrain mid-drain so ring/pinky commands aren't cut off.
  function flushMirror() {
    const snap = mirrorPending.current
    mirrorPending.current = null
    if (!snap) return
    mirrorDrain.current = Object.entries(snap).map(([i, v]) => `set:${i}:${v}\n`)
    if (mirrorDrain.current.length) sendNow(mirrorDrain.current.shift())
  }

  function mirror(angles) {
    mirrorPending.current = { ...(mirrorPending.current || {}), ...angles }
    // Only kick off a new cycle if nothing is currently running
    if (!writing.current && !bulkQueue.current.length &&
        !mirrorDrain.current.length && !mirrorTimer.current) {
      mirrorTimer.current = setTimeout(() => {
        mirrorTimer.current = null
        flushMirror()
      }, 100)
    }
  }

  function handleDisconnect(fromEvent) {
    if (disconnecting.current) { console.warn('[BLE] handleDisconnect: already handling, ignoring duplicate'); return }
    disconnecting.current = true
    console.warn('[BLE] handleDisconnect called', fromEvent ? '← gattserverdisconnected event' : '← write failure',
      '| writing:', writing.current,
      '| failStreak:', failStreak.current)
    clearInterval(heartbeat.current)
    clearTimeout(mirrorTimer.current)
    heartbeat.current     = null
    mirrorTimer.current   = null
    mirrorPending.current = null
    mirrorDrain.current   = []
    rxCharRef.current     = null
    writing.current       = false
    hbPending.current     = false
    failStreak.current    = 0
    nextWrite.current     = null
    bulkQueue.current     = []
    setStatus('disconnected')
    setDeviceName(null)
    notifyStatus('disconnected', null)
    onConnect(null)
  }

  function disconnect() {
    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect()
    }
    handleDisconnect()
  }

  const statusLabel =
    status === 'connected'  ? (deviceName ?? 'Connected') :
    status === 'connecting' ? 'Connecting…' :
                              'Disconnected'

  const btn = status !== 'connected'
    ? <button className="ble-btn" onClick={connect} disabled={status === 'connecting'}>
        {status === 'connecting' ? 'Connecting…' : 'Connect'}
      </button>
    : <button className="ble-btn" onClick={disconnect}>Disconnect</button>

  const indicator = (
    <div className="ble-indicator">
      <div className={`ble-dot ${status}`} />
      <span className="ble-label">{statusLabel}</span>
    </div>
  )

  if (view === 'button')    return btn
  if (view === 'indicator') return indicator
  return (
    <div className="ble-status">
      {btn}
      {indicator}
    </div>
  )
}
