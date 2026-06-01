#ifndef GESTURE_PLAYER_H
#define GESTURE_PLAYER_H

#include <Arduino.h>

// ── Limits ───────────────────────────────────────────────────
#define GP_MAX_GESTURES  16
#define GP_MAX_FRAMES    16
#define GP_NUM_SERVOS    18

// ── Packet command bytes ──────────────────────────────────────
// CONFIG (7  bytes): [0x01][id][numFrames]
//                    [fms_hi][fms_lo][hms_hi][hms_lo]
// FRAME  (20 bytes): [0x02][(id<<4)|fi][s0..s17]
//                    id = upper 4 bits (0-15), fi = lower 4 bits (0-15)
// PLAY   (2  bytes): [0x03][id]
// STOP   (1  byte ): [0x04]
#define GP_CMD_CONFIG  0x01
#define GP_CMD_FRAME   0x02
#define GP_CMD_PLAY    0x03
#define GP_CMD_STOP    0x04

class ManagedServo;

struct GestureFrame {
  uint8_t angles[GP_NUM_SERVOS];
};

struct GestureEntry {
  bool     valid;
  uint8_t  numFrames;
  uint16_t frameDurMs;   // transition duration per frame
  uint16_t holdDurMs;    // hold duration at each peak
  GestureFrame frames[GP_MAX_FRAMES];
};

class GesturePlayer {
public:
  GesturePlayer(ManagedServo* servos, uint8_t numServos);

  // Feed raw bytes from BLE gestureCharacteristic handler
  void handlePacket(const uint8_t* data, uint16_t len);

  // Call every iteration of the main BLE while-loop
  void update();

  bool isPlaying() const { return mPlaying; }

private:
  ManagedServo* mServos;
  uint8_t       mNumServos;
  GestureEntry  mGestures[GP_MAX_GESTURES];

  bool     mPlaying;
  uint8_t  mActiveId;
  uint8_t  mFromFrame;
  uint8_t  mToFrame;
  uint32_t mPhaseStart;
  bool     mHolding;
  uint32_t mLastUpdate;  // throttle to ~50 fps

  float ease(float t);
  void  applyFrame(uint8_t gid, uint8_t fi);
  void  applyInterpolated(uint8_t gid, uint8_t f0, uint8_t f1, float t);
};

#endif
