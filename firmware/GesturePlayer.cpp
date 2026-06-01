#include "GesturePlayer.h"
#include "ManagedServo.h"

GesturePlayer::GesturePlayer(ManagedServo* servos, uint8_t numServos)
  : mServos(servos), mNumServos(numServos),
    mPlaying(false), mActiveId(0),
    mFromFrame(0), mToFrame(0),
    mPhaseStart(0), mHolding(false), mLastUpdate(0)
{
  for (int i = 0; i < GP_MAX_GESTURES; i++)
    mGestures[i].valid = false;
}

// ── Packet handler ────────────────────────────────────────────

void GesturePlayer::handlePacket(const uint8_t* data, uint16_t len) {
  if (len < 1) return;

  switch (data[0]) {

    // CONFIG (7 bytes): timing info for a gesture slot
    case GP_CMD_CONFIG: {
      if (len < 7) return;
      const uint8_t  id    = data[1];
      const uint8_t  total = data[2];
      const uint16_t fms   = ((uint16_t)data[3] << 8) | data[4];
      const uint16_t hms   = ((uint16_t)data[5] << 8) | data[6];

      if (id >= GP_MAX_GESTURES) return;

      GestureEntry& g = mGestures[id];
      g.valid      = false;   // not playable until all frames arrive
      g.numFrames  = total;
      g.frameDurMs = fms;
      g.holdDurMs  = hms;

      Serial.print("[GP] CONFIG id="); Serial.print(id);
      Serial.print(" frames="); Serial.print(total);
      Serial.print(" fms="); Serial.print(fms);
      Serial.print(" hms="); Serial.println(hms);
      break;
    }

    // FRAME (20 bytes): servo angles for one frame
    // data[1] = (id << 4) | fi  — id in upper nibble, fi in lower nibble
    case GP_CMD_FRAME: {
      if (len < 20) return;
      const uint8_t id_fi = data[1];
      const uint8_t id    = (id_fi >> 4) & 0x0F;
      const uint8_t fi    = id_fi & 0x0F;

      if (id >= GP_MAX_GESTURES || fi >= GP_MAX_FRAMES) return;

      GestureEntry& g = mGestures[id];
      for (int i = 0; i < GP_NUM_SERVOS; i++)
        g.frames[fi].angles[i] = data[2 + i];

      // Mark playable once the last frame is stored
      if (g.numFrames > 0 && fi == (uint8_t)(g.numFrames - 1))
        g.valid = true;

      Serial.print("[GP] FRAME id="); Serial.print(id);
      Serial.print(" fi="); Serial.println(fi);
      break;
    }

    case GP_CMD_PLAY: {
      if (len < 2) return;
      const uint8_t id = data[1];
      if (id >= GP_MAX_GESTURES || !mGestures[id].valid) {
        Serial.print("[GP] PLAY failed — id not ready: "); Serial.println(id);
        return;
      }
      mPlaying    = true;
      mActiveId   = id;
      mFromFrame  = 0;
      mToFrame    = (mGestures[id].numFrames > 1) ? 1 : 0;
      mPhaseStart = millis();
      mHolding    = false;
      Serial.print("[GP] PLAY id="); Serial.println(id);
      break;
    }

    case GP_CMD_STOP: {
      mPlaying = false;
      Serial.println("[GP] STOP");
      break;
    }
  }
}

// ── Playback update (call every loop iteration) ───────────────

float GesturePlayer::ease(float t) {
  return t < 0.5f ? 2.0f*t*t : -1.0f + (4.0f - 2.0f*t)*t;
}

void GesturePlayer::applyFrame(uint8_t gid, uint8_t fi) {
  GestureEntry& g = mGestures[gid];
  for (int i = 0; i < GP_NUM_SERVOS && i < (int)mNumServos; i++)
    mServos[i].setServoPosition(g.frames[fi].angles[i]);
}

void GesturePlayer::applyInterpolated(uint8_t gid, uint8_t f0, uint8_t f1, float t) {
  GestureEntry& g = mGestures[gid];
  const float eased = ease(t);
  for (int i = 0; i < GP_NUM_SERVOS && i < (int)mNumServos; i++) {
    const int a = g.frames[f0].angles[i];
    const int b = g.frames[f1].angles[i];
    mServos[i].setServoPosition((uint8_t)(a + (b - a) * eased + 0.5f));
  }
}

void GesturePlayer::update() {
  if (!mPlaying) return;

  // Throttle to ~50 fps — no point hitting the ISR servo library faster
  const uint32_t now = millis();
  if (now - mLastUpdate < 20) return;
  mLastUpdate = now;

  GestureEntry& g   = mGestures[mActiveId];
  const uint32_t dt = now - mPhaseStart;

  if (!mHolding) {
    // ── Transition phase ──
    if (g.numFrames == 1 || g.frameDurMs == 0) {
      // Single-frame gesture: snap and hold (or finish)
      applyFrame(mActiveId, mFromFrame);
      if (g.holdDurMs == 0) { mPlaying = false; return; }
      mHolding    = true;
      mPhaseStart = now;
      return;
    }

    if (dt < g.frameDurMs) {
      const float t = (float)dt / (float)g.frameDurMs;
      applyInterpolated(mActiveId, mFromFrame, mToFrame, t);
    } else {
      // Transition complete — snap to exact target
      applyFrame(mActiveId, mToFrame);
      mHolding    = true;
      mPhaseStart = now;
    }

  } else {
    // ── Hold phase ──
    if (dt >= g.holdDurMs) {
      mFromFrame = mToFrame;
      mToFrame++;

      if (mToFrame >= g.numFrames) {
        mPlaying = false;  // sequence complete
        Serial.println("[GP] sequence complete");
        return;
      }

      mHolding    = false;
      mPhaseStart = now;
    }
  }
}
