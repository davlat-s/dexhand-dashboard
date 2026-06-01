// Gesture library
// To add a gesture:
//   1. Pose the hand using the control panel sliders
//   2. Click "Copy Angles" in the sidebar
//   3. Paste the angles object below as a new entry
//
// Servo index reference:
//   0  Index Lower    1  Index Upper    8  Index Tip
//   2  Middle Lower   3  Middle Upper   9  Middle Tip
//   4  Ring Lower     5  Ring Upper    10  Ring Tip
//   6  Pinky Lower    7  Pinky Upper   11  Pinky Tip
//  12  Thumb Tip     13  Thumb Right   14  Thumb Left   15  Thumb Rotate
//  16  Wrist Left    17  Wrist Right
//
// Key insight from shaka tuning: curl is driven almost entirely by the TIP servo.
// Lower + upper stay close to their "extended" values; tip goes to max to curl.
//
//   Index  curled: 0:180  1:132  8:180   (tip=180)
//   Middle curled: 2:163  3:0    9:180   (tip=180)
//   Ring   curled: 4:180  5:16  10:180   (confirmed from shaka + peace)
//   Pinky  curled: 6:180  7:180 11:180   (confirmed from peace)
//   Pinky  shaka-out (sideways): 6:47  7:107 11:0

export const GESTURES = [
  // ── Confirmed ────────────────────────────────────────────────────────────
  {
    id: 'open_default',
    name: 'Open',
    angles: {
      0: 64,  1: 38,  2: 49,  3: 113, 4: 49,  5: 120,
      6: 45,  7: 48,  8: 0,   9: 0,  10: 0,  11: 0,
      12: 180, 13: 0, 14: 0,  15: 90, 16: 60, 17: 120,
    },
  },
  {
    id: 'peace',
    name: 'Peace',
    angles: {
      0: 64,  1: 38,  2: 49,  3: 113, 4: 180, 5: 0,
      6: 180, 7: 180, 8: 0,   9: 0,  10: 180, 11: 180,
      12: 0,  13: 180, 14: 96, 15: 180, 16: 60, 17: 120,
    },
  },
  {
    id: 'devil_horns',
    name: 'Horns',
    // Confirmed from hardware
    angles: {
      0: 64,  1: 38,  2: 163, 3: 0,   4: 180, 5: 16,
      6: 45,  7: 48,  8: 0,   9: 180, 10: 180, 11: 0,
      12: 0,  13: 180, 14: 96, 15: 180, 16: 60, 17: 120,
    },
  },
]

// ── Shared base ───────────────────────────────────────────────────────────────
const OPEN = {
  0: 64, 1: 38, 2: 49, 3: 113, 4: 49, 5: 120,
  6: 45, 7: 48, 8: 0,  9: 0,  10: 0,  11: 0,
  12: 180, 13: 0, 14: 0, 15: 90, 16: 60, 17: 120,
}

// Individual finger "up" — confirmed from Fingers sequence (includes thumb compensation)
const IDX_UP = { 0: 180, 1: 143, 8: 49,  12: 43,  13: 50,  14: 89,  15: 180 }
const MID_UP = { 2: 168, 3: 9,   9: 85,  12: 50,  13: 80,  14: 180, 15: 180 }
const RNG_UP = { 4: 148, 5: 0,  10: 64,  12: 59,  13: 129, 14: 76,  15: 146 }
const PKY_UP = { 6: 157, 7: 180, 11: 51, 12: 59,  13: 148, 14: 90,  15: 146 }

// Finger-only "up" — no thumb servos, for sequences where thumb should stay still
const IDX_UP_F = { 0: 180, 1: 143, 8: 49  }
const MID_UP_F = { 2: 168, 3: 9,   9: 85  }
const RNG_UP_F = { 4: 148, 5: 0,  10: 64  }
const PKY_UP_F = { 6: 157, 7: 180, 11: 51 }

// Closed fist — from shaka tuning + peace (pinky)
const FIST = {
  0: 180, 1: 132, 8: 180,  // index curled (tip drives it)
  2: 163, 3: 0,   9: 180,  // middle curled
  4: 180, 5: 16, 10: 180,  // ring curled
  6: 180, 7: 180, 11: 180, // pinky curled (from peace)
  12: 0, 13: 180, 14: 96, 15: 180, // thumb tucked
  16: 60, 17: 120,
}

// Shaka pose without wrist — for the animated shaka sequence
const SHAKA_F = {
  0: 180, 1: 132, 2: 163, 3: 0,   4: 180, 5: 16,
  6: 47,  7: 107, 8: 180, 9: 180, 10: 180, 11: 0,
  12: 180, 13: 0, 14: 0,  15: 0,
}

// Finger-only fist — no thumb servos, for bye-bye where thumb should stay still
const FIST_F = {
  0: 180, 1: 132, 8: 180,  // index curled
  2: 163, 3: 0,   9: 180,  // middle curled
  4: 180, 5: 16, 10: 180,  // ring curled
  6: 180, 7: 180, 11: 180, // pinky curled
}

// ── Sequences ─────────────────────────────────────────────────────────────────
export const SEQUENCES = [
  {
    id: 'fingers',
    name: 'Fingers',
    loopCount: 2,
    frameMs: 600,
    holdMs:  300,
    frames: [
      { angles: { ...OPEN, ...IDX_UP }, holdMs: 600 },
      { angles: { ...OPEN } },
      { angles: { ...OPEN, ...MID_UP } },
      { angles: { ...OPEN } },
      { angles: { ...OPEN, ...RNG_UP } },
      { angles: { ...OPEN } },
      { angles: { ...OPEN, ...PKY_UP } },
      { angles: { ...OPEN } },
    ],
  },
  {
    id: 'wave',
    name: 'Hello',
    // Finger ripple: index → pinky → index. Thumb stays at OPEN throughout.
    // Wrist sweeps in the same direction as the ripple.
    frameMs: 180,
    holdMs:  60,
    frames: [
      { angles: { ...OPEN, ...IDX_UP_F, 16: 50, 17: 130 } },
      { angles: { ...OPEN, ...MID_UP_F, 16: 55, 17: 125 } },
      { angles: { ...OPEN, ...RNG_UP_F, 16: 65, 17: 115 } },
      { angles: { ...OPEN, ...PKY_UP_F, 16: 70, 17: 110 } },
      { angles: { ...OPEN, ...RNG_UP_F, 16: 65, 17: 115 } },
      { angles: { ...OPEN, ...MID_UP_F, 16: 55, 17: 125 } },
      { angles: { ...OPEN, ...IDX_UP_F, 16: 50, 17: 130 } },
      { angles: { ...OPEN } },
    ],
  },
  {
    id: 'shaka_wave',
    name: 'Shaka',
    // Hold shaka pose, rock wrist back and forth
    frameMs: 250,
    holdMs:  80,
    frames: [
      { angles: { ...OPEN, ...SHAKA_F, 16: 60, 17: 120 } },
      { angles: { ...OPEN, ...SHAKA_F, 16: 50, 17: 130 } },
      { angles: { ...OPEN, ...SHAKA_F, 16: 70, 17: 110 } },
      { angles: { ...OPEN, ...SHAKA_F, 16: 50, 17: 130 } },
      { angles: { ...OPEN, ...SHAKA_F, 16: 70, 17: 110 } },
      { angles: { ...OPEN, ...SHAKA_F, 16: 60, 17: 120 } },
    ],
  },
  {
    id: 'bye_bye',
    name: 'Bye Bye',
    // Open hand closes into fist 3× — wrist rocks side to side each cycle
    frameMs: 350,
    holdMs:  100,
    frames: [
      { angles: { ...OPEN } },
      { angles: { ...OPEN, ...FIST_F, 16: 50, 17: 130 } },
      { angles: { ...OPEN } },
      { angles: { ...OPEN, ...FIST_F, 16: 70, 17: 110 } },
      { angles: { ...OPEN } },
      { angles: { ...OPEN, ...FIST_F, 16: 50, 17: 130 } },
      { angles: { ...OPEN } },
    ],
  },
]

// ── Display order ─────────────────────────────────────────────────────────────
// Single ordered list for the sidebar. Items with `frames` are sequences;
// items without are static gestures.
export const ITEMS = [
  SEQUENCES.find(s => s.id === 'wave'),
  GESTURES.find(g => g.id === 'open_default'),
  GESTURES.find(g => g.id === 'devil_horns'),
  GESTURES.find(g => g.id === 'peace'),
  SEQUENCES.find(s => s.id === 'shaka_wave'),
  SEQUENCES.find(s => s.id === 'fingers'),
  SEQUENCES.find(s => s.id === 'bye_bye'),
]
