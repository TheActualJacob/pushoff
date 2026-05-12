import { angleBetween } from './angles.js';

// MoveNet keypoint indices
const KP = {
  LEFT_SHOULDER: 5,
  RIGHT_SHOULDER: 6,
  LEFT_ELBOW: 7,
  RIGHT_ELBOW: 8,
  LEFT_WRIST: 9,
  RIGHT_WRIST: 10,
  LEFT_HIP: 11,
  RIGHT_HIP: 12,
  LEFT_ANKLE: 15,
  RIGHT_ANKLE: 16,
};

const UP_THRESHOLD = 155;   // arms ~extended
const DOWN_THRESHOLD = 95;  // elbows bent past 90°
const MIN_CONFIDENCE = 0.4;
const COOLDOWN_MS = 400;

// Body must be roughly horizontal (plank position).
// Math.acos is bounded to [0°, 180°] so 220° is unreachable — use a single
// lower-bound check instead of a two-sided gate.
const BODY_ANGLE_MIN = 140;

/** Shared "no pose detected" shape — same keys as the happy path. */
function noPose(state, count) {
  return { state, count, elbowAngle: null, bodyAligned: null, stateChanged: false };
}

/**
 * Creates a stateful pushup rep counter.
 *
 * Returns:
 *   update(keypoints, bodyAlignmentGate?) → { state, count, elbowAngle, bodyAligned, stateChanged }
 *   reset()
 *   getCount()
 *   getState()
 */
export function createPushupCounter() {
  let state = 'UP';
  let count = 0;
  let lastRepAt = 0;

  function update(keypoints, bodyAlignmentGate = true) {
    const kp = keypoints;
    if (!kp || kp.length < 17) return noPose(state, count);

    const ls = kp[KP.LEFT_SHOULDER];
    const rs = kp[KP.RIGHT_SHOULDER];
    const le = kp[KP.LEFT_ELBOW];
    const re = kp[KP.RIGHT_ELBOW];
    const lw = kp[KP.LEFT_WRIST];
    const rw = kp[KP.RIGHT_WRIST];
    const lh = kp[KP.LEFT_HIP];
    const rh = kp[KP.RIGHT_HIP];
    const la = kp[KP.LEFT_ANKLE];
    const ra = kp[KP.RIGHT_ANKLE];

    const leftArmOk = ls.score >= MIN_CONFIDENCE && le.score >= MIN_CONFIDENCE && lw.score >= MIN_CONFIDENCE;
    const rightArmOk = rs.score >= MIN_CONFIDENCE && re.score >= MIN_CONFIDENCE && rw.score >= MIN_CONFIDENCE;

    let elbowAngle = null;
    if (leftArmOk && rightArmOk) {
      const leftAngle = angleBetween(ls, le, lw);
      const rightAngle = angleBetween(rs, re, rw);
      elbowAngle = le.score >= re.score ? leftAngle : rightAngle;
    } else if (leftArmOk) {
      elbowAngle = angleBetween(ls, le, lw);
    } else if (rightArmOk) {
      elbowAngle = angleBetween(rs, re, rw);
    }

    if (elbowAngle === null) return noPose(state, count);

    // Optional plausibility gate: body must be roughly horizontal.
    let bodyAligned = true;
    if (bodyAlignmentGate) {
      const hipOk = lh.score >= MIN_CONFIDENCE && rh.score >= MIN_CONFIDENCE;
      const ankleOk = la.score >= MIN_CONFIDENCE && ra.score >= MIN_CONFIDENCE;
      const shoulderOk = ls.score >= MIN_CONFIDENCE && rs.score >= MIN_CONFIDENCE;

      if (hipOk && ankleOk && shoulderOk) {
        const shoulder = midpoint(ls, rs);
        const hip = midpoint(lh, rh);
        const ankle = midpoint(la, ra);
        bodyAligned = angleBetween(shoulder, hip, ankle) >= BODY_ANGLE_MIN;
        if (!bodyAligned) {
          return { state, count, elbowAngle: Math.round(elbowAngle), bodyAligned: false, stateChanged: false };
        }
      }
    }

    const now = Date.now();
    const prevState = state;

    if (state === 'UP' && elbowAngle < DOWN_THRESHOLD) {
      state = 'DOWN';
    } else if (state === 'DOWN' && elbowAngle > UP_THRESHOLD) {
      state = 'UP';
      if (now - lastRepAt > COOLDOWN_MS) {
        count++;
        lastRepAt = now;
      }
    }

    return {
      state,
      count,
      elbowAngle: Math.round(elbowAngle),
      bodyAligned,
      stateChanged: state !== prevState,
    };
  }

  function reset() {
    state = 'UP';
    count = 0;
    lastRepAt = 0;
  }

  return {
    update,
    reset,
    getCount: () => count,
    getState: () => state,
  };
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
