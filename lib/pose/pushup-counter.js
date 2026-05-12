import { angleBetween } from './angles.js';

// MoveNet keypoint indices
const KP = {
  LEFT_SHOULDER: 5,  RIGHT_SHOULDER: 6,
  LEFT_ELBOW:    7,  RIGHT_ELBOW:    8,
  LEFT_WRIST:    9,  RIGHT_WRIST:    10,
  LEFT_HIP:      11, RIGHT_HIP:      12,
  LEFT_KNEE:     13, RIGHT_KNEE:     14,
  LEFT_ANKLE:    15, RIGHT_ANKLE:    16,
};

const UP_THRESHOLD   = 155;  // arms ~extended
const DOWN_THRESHOLD = 95;   // elbows bent past 90°
const MIN_CONFIDENCE = 0.4;
const COOLDOWN_MS    = 400;

// Plank check: shoulder→hip→(ankle|knee) must be near-straight.
// Using a knee fallback catches people sitting at a desk whose ankles
// are hidden under the table — a seated hip→knee angle is ~90°, failing the gate.
const BODY_ANGLE_MIN = 140;

// Straight-leg gate: hip→knee→ankle must be near-straight to block knee pushups.
const LEGS_ANGLE_MIN = 150;

// Wrists must stay planted. If they drift more than this fraction of upper-arm
// length between entering DOWN and exiting UP, the rep is rejected.
const WRIST_DRIFT_MAX = 0.4;

// Minimum time (ms) the state must remain DOWN before an UP transition counts.
// Prevents fast oscillations from counting as reps.
const MIN_DOWN_MS = 150;

function noPose(state, count) {
  return { state, count, elbowAngle: null, bodyAligned: null, legsStr: null, rejectedReason: null, stateChanged: false };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Creates a stateful pushup rep counter.
 *
 * Returns:
 *   update(keypoints, bodyAlignmentGate?) → { state, count, elbowAngle, bodyAligned, legsStr, stateChanged }
 *   reset()
 *   getCount()
 *   getState()
 */
export function createPushupCounter() {
  let state = 'UP';
  let count = 0;
  let lastRepAt = 0;
  let enteredDownAt = 0;
  let wristAnchor = null; // { x, y, armLen } captured when entering DOWN

  function update(keypoints, bodyAlignmentGate = true) {
    const kp = keypoints;
    if (!kp || kp.length < 17) return noPose(state, count);

    const ls = kp[KP.LEFT_SHOULDER],  rs = kp[KP.RIGHT_SHOULDER];
    const le = kp[KP.LEFT_ELBOW],     re = kp[KP.RIGHT_ELBOW];
    const lw = kp[KP.LEFT_WRIST],     rw = kp[KP.RIGHT_WRIST];
    const lh = kp[KP.LEFT_HIP],       rh = kp[KP.RIGHT_HIP];
    const lk = kp[KP.LEFT_KNEE],      rk = kp[KP.RIGHT_KNEE];
    const la = kp[KP.LEFT_ANKLE],     ra = kp[KP.RIGHT_ANKLE];

    const leftArmOk  = ls.score >= MIN_CONFIDENCE && le.score >= MIN_CONFIDENCE && lw.score >= MIN_CONFIDENCE;
    const rightArmOk = rs.score >= MIN_CONFIDENCE && re.score >= MIN_CONFIDENCE && rw.score >= MIN_CONFIDENCE;

    // Average both arms when both visible — more stable than picking one.
    let elbowAngle = null;
    if (leftArmOk && rightArmOk) {
      elbowAngle = (angleBetween(ls, le, lw) + angleBetween(rs, re, rw)) / 2;
    } else if (leftArmOk) {
      elbowAngle = angleBetween(ls, le, lw);
    } else if (rightArmOk) {
      elbowAngle = angleBetween(rs, re, rw);
    }

    if (elbowAngle === null) return noPose(state, count);

    const shoulderOk = ls.score >= MIN_CONFIDENCE && rs.score >= MIN_CONFIDENCE;
    const hipOk      = lh.score >= MIN_CONFIDENCE && rh.score >= MIN_CONFIDENCE;
    const kneeOk     = lk.score >= MIN_CONFIDENCE && rk.score >= MIN_CONFIDENCE;
    const ankleOk    = la.score >= MIN_CONFIDENCE && ra.score >= MIN_CONFIDENCE;

    // Body alignment gate: plank position check.
    // Prefers ankle as end reference; falls back to knee when ankles are hidden
    // (e.g. feet under a desk). Seated hip→knee angle is ~90° so it still fails.
    let bodyAligned = null;
    if (bodyAlignmentGate && shoulderOk && hipOk && (ankleOk || kneeOk)) {
      const shoulder = midpoint(ls, rs);
      const hip      = midpoint(lh, rh);
      const ref      = ankleOk ? midpoint(la, ra) : midpoint(lk, rk);
      bodyAligned    = angleBetween(shoulder, hip, ref) >= BODY_ANGLE_MIN;
    }

    if (bodyAligned === false) {
      return { state, count, elbowAngle: Math.round(elbowAngle), bodyAligned: false, legsStr: null, rejectedReason: null, stateChanged: false };
    }

    // Straight-leg gate: blocks knee pushups.
    // A knee pushup has the hip→knee→ankle angle around 90–110°; a proper pushup
    // keeps it at 160–180°. Only evaluated when all three landmarks are confident.
    let legsStr = null;
    if (bodyAlignmentGate && hipOk && kneeOk && ankleOk) {
      const leftConfident  = lh.score >= MIN_CONFIDENCE && lk.score >= MIN_CONFIDENCE && la.score >= MIN_CONFIDENCE;
      const rightConfident = rh.score >= MIN_CONFIDENCE && rk.score >= MIN_CONFIDENCE && ra.score >= MIN_CONFIDENCE;
      const leftAngle  = leftConfident  ? angleBetween(lh, lk, la) : null;
      const rightAngle = rightConfident ? angleBetween(rh, rk, ra) : null;

      if (leftAngle !== null && rightAngle !== null) {
        legsStr = (leftAngle + rightAngle) / 2 >= LEGS_ANGLE_MIN;
      } else if (leftAngle !== null) {
        legsStr = leftAngle >= LEGS_ANGLE_MIN;
      } else if (rightAngle !== null) {
        legsStr = rightAngle >= LEGS_ANGLE_MIN;
      }
    }

    if (legsStr === false) {
      return { state, count, elbowAngle: Math.round(elbowAngle), bodyAligned, legsStr: false, rejectedReason: null, stateChanged: false };
    }

    // Derive arm length and wrist midpoint for the stability check.
    const armLen  = leftArmOk ? dist(ls, le) : dist(rs, re);
    const wristMid = (leftArmOk && rightArmOk) ? midpoint(lw, rw)
                   : leftArmOk ? { x: lw.x, y: lw.y }
                   : { x: rw.x, y: rw.y };

    const now = Date.now();
    const prevState = state;
    let rejectedReason = null;

    if (state === 'UP' && elbowAngle < DOWN_THRESHOLD) {
      state = 'DOWN';
      enteredDownAt = now;
      // Anchor wrist position at the start of the down phase.
      wristAnchor = { x: wristMid.x, y: wristMid.y, armLen };

    } else if (state === 'DOWN' && elbowAngle > UP_THRESHOLD) {
      const dwellOk = (now - enteredDownAt) >= MIN_DOWN_MS;

      // Wrist stability: planted wrists shouldn't drift during a rep.
      // Catching someone standing up from the floor, shifting weight, etc.
      let wristOk = true;
      if (wristAnchor && wristAnchor.armLen > 0) {
        wristOk = dist(wristMid, wristAnchor) <= WRIST_DRIFT_MAX * wristAnchor.armLen;
      }

      state = 'UP';
      if (dwellOk && wristOk && now - lastRepAt > COOLDOWN_MS) {
        count++;
        lastRepAt = now;
      } else {
        // Rep attempt detected but rejected — surface the primary reason.
        if (!dwellOk)        rejectedReason = 'too_fast';
        else if (!wristOk)   rejectedReason = 'wrists_moved';
        else                 rejectedReason = 'too_fast'; // cooldown edge case
      }
      wristAnchor = null;
    }

    return {
      state,
      count,
      elbowAngle: Math.round(elbowAngle),
      bodyAligned,
      legsStr,
      rejectedReason,
      stateChanged: state !== prevState,
    };
  }

  function reset() {
    state = 'UP';
    count = 0;
    lastRepAt = 0;
    enteredDownAt = 0;
    wristAnchor = null;
  }

  return {
    update,
    reset,
    getCount: () => count,
    getState: () => state,
  };
}
