# DexHand Dashboard — Context

## What is this project

A web-based control dashboard for the DexHand open-source robotic hand. The dashboard connects to the hand via BLE directly from the browser (Web Bluetooth API) and lets the user individually control each of the 18 servo positions through a visual UI.

---

## Hardware

**Hand**: DexHand V1.0 open-source robotic hand
- Original project by Rob Knight / IoT Design Shop
- 18 servos total (fingers, thumb, wrist)
- Controlled via PWM signals

**Microcontroller**: Arduino Nano RP2040 Connect
- BLE via Nina W102 co-processor
- Nordic UART Service (NUS) over BLE
- 18 GPIO pins used for servos (D0–D17)
- Nina W102 uses internal SPI — D17/D18 area can conflict with BLE if used for servos

**Power**: External 5V bench supply, 3–5A required for 18 servos. USB alone is insufficient.

---

## Firmware

**Location**: Downloaded from DexHand repo, flashed to Nano RP2040
- Original repo: `https://github.com/iotdesignshop/dexhand-ble`
- Local firmware dir: `/Users/davlatsirojitdinov/Downloads/dexhand-ble-main/`
- BLE Python script (for reference): `/Users/davlatsirojitdinov/dexhand/dexhand-ble.py`

**BLE protocol**:
- Service UUID: `6e400001-b5a3-f393-e0a9-e50e24dcca9e` (Nordic UART Service)
- RX characteristic (write to hand): `6e400002-b5a3-f393-e0a9-e50e24dcca9e`
- TX characteristic (notifications from hand): `6e400003-b5a3-f393-e0a9-e50e24dcca9e`
- Device name: `DexHand`

**Commands sent to hand**:
- `DOF:<index>:<angle>\n` — set servo angle (e.g. `DOF:0:90\n`)
- `HB:<n>\n` — heartbeat, must be sent every ~10s or hand disconnects (30s timeout)
- `relax\n` — detach all servos
- `wake\n` — re-attach all servos

---

## Servo Map (current physical wiring)

| Index | Name         | Pin |
|-------|--------------|-----|
| 0     | Index Lower  | D10 |
| 1     | Index Upper  | D1  |
| 2     | Middle Lower | D12 |
| 3     | Middle Upper | D11 |
| 4     | Ring Lower   | D6  |
| 5     | Ring Upper   | D8  |
| 6     | Pinky Lower  | D7  |
| 7     | Pinky Upper  | D9  |
| 8     | Index Tip    | D15 |
| 9     | Middle Tip   | D13 |
| 10    | Ring Tip     | D2  |
| 11    | Pinky Tip    | D0  |
| 12    | Thumb Tip    | D17 |
| 13    | Thumb Right  | D14 |
| 14    | Thumb Left   | D16 |
| 15    | Thumb Rotate | D5  |
| 16    | Wrist Left   | D3  |
| 17    | Wrist Right  | D4  |

**Note**: D7 (Pinky Lower) had zero movement during sweep test — may be a dead pin or cold solder joint on this board. Needs re-investigation.

---

## Dashboard Project

**Location**: `/Users/davlatsirojitdinov/dexhand-dashboard/`

**Stack**: React 18 + Vite, vanilla CSS, no component library

**Key files**:
```
src/
  App.jsx               — layout, state (selectedZone, servoAngles, bleClient)
  App.css
  index.css             — CSS variables (colors, font)
  components/
    HandMap.jsx         — 2D hand SVG + clickable hit zones
    HandMap.css
    ServoPanel.jsx      — slider controls per zone
    ServoPanel.css
    BleStatus.jsx       — Web Bluetooth connect/disconnect
    BleStatus.css
public/
  Dexhand.svg           — 2D line art exported from Blender (Grease Pencil)
```

**Run**: `cd /Users/davlatsirojitdinov/dexhand-dashboard && npm run dev`

---

## 2D Hand SVG

- Exported from Blender using Grease Pencil + Line Art modifier
- Source model: `Dexhand.glb` (in old dashboard: `/Users/davlatsirojitdinov/dexhand-dashboard-old/public/Dexhand.glb`)
- SVG canvas: 1920×1080 (landscape)
- Hand bounding box within SVG: X: 341–1513, Y: 298–767
- SVG has white strokes on transparent/dark background (no invert needed)
- Displayed rotated 90° CW in the dashboard so fingers point up

**Hit zone approach**: Transparent `<div>` overlays positioned over the SVG using a rotated wrapper. Zones are defined in landscape coordinate space (before CSS rotation). Currently being calibrated — zones and SVG rotation are misaligned (zones are horizontal, hand is vertical).

---

## Current Status

### Working
- React app scaffolded and running
- BLE connect/disconnect UI (BleStatus.jsx)
- Servo panel with sliders per zone (ServoPanel.jsx)
- SVG renders correctly, rotated to portrait, white lines visible
- Zone click → servo panel appears

### In Progress
- **Hit zone calibration**: zones need to be aligned with the SVG hand regions
  - Figma frame W:1172 H:469 (cropped to hand bounding box, rotated -90° in Figma)
  - Index zone measured: fX:210.31, fY:4.01, W:77, H:272
  - Middle zone measured: fX:125.31, fY:4.01, W:77, H:272
  - Ring, Pinky, Thumb, Wrist zones still need to be measured in Figma
  - Core issue: the CSS rotate wrapper and the hit zone coordinate system are misaligned — zones appear horizontal while the hand is vertical

### Not Started
- BLE DOF write on slider change (wired up in App.jsx but untested with hardware)
- Heartbeat sender (needed to keep BLE connection alive past 30s)
- Pose save/load
- Relax / Wake all buttons

---

## Known Issues / Watch-outs

- **D7 dead pin**: Pinky Lower servo on D7 showed no movement in sweep test
- **BLE rate limiting**: DOF writes must be throttled (~8fps / 125ms delay) to avoid overwhelming the Nina W102
- **Heartbeat required**: Send `HB:<n>\n` every ~10s. Use `asyncio.wait_for(timeout=2s)` pattern to avoid blocking (see dexhand-ble.py for reference)
- **BLE only works in Chrome/Edge**: Web Bluetooth API not supported in Safari/Firefox
- **Nina SPI conflict**: Pins D17/D18 area can conflict with BLE — D17 is currently used for Thumb Tip, monitor for issues

---

## Resources

- DexHand GitHub: `https://github.com/iotdesignshop/dexhand-ble`
- DexHand build guide: `/Users/davlatsirojitdinov/dexhand/dexhand-mechanical-build-main/`
- Arduino Nano RP2040 Connect pinout: `https://docs.arduino.cc/hardware/nano-rp2040-connect`
- Web Bluetooth API docs: `https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API`
- Nordic UART Service spec: `https://developer.nordicsemi.com/nRF_Connect_SDK/doc/latest/nrf/libraries/bluetooth_services/services/nus.html`
