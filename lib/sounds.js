/**
 * Tiny Web Audio API sound effects — no file downloads needed.
 * All sounds are synthesized in <1 ms using the AudioContext.
 *
 * Usage:
 *   import { sounds } from '@/lib/sounds';
 *   sounds.rep();        // short click on each rep
 *   sounds.countdown();  // beep for 3-2-1
 *   sounds.go();         // higher beep for GO
 *   sounds.done();       // victory chord
 */

let ctx = null;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  // Resume suspended context (Safari suspends until user gesture)
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function beep({ frequency = 440, duration = 0.08, gain = 0.18, type = 'sine', ramp = true }) {
  try {
    const c = getCtx();
    const osc = c.createOscillator();
    const vol = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, c.currentTime);
    vol.gain.setValueAtTime(gain, c.currentTime);
    if (ramp) vol.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
    osc.connect(vol);
    vol.connect(c.destination);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + duration + 0.02);
  } catch { /* AudioContext unavailable */ }
}

export const sounds = {
  /** Short tactile click on each rep */
  rep() {
    beep({ frequency: 880, duration: 0.05, gain: 0.12, type: 'square' });
  },

  /** Countdown tick (3-2-1) */
  countdown() {
    beep({ frequency: 660, duration: 0.12, gain: 0.16 });
  },

  /** "GO!" */
  go() {
    beep({ frequency: 1046, duration: 0.22, gain: 0.22 });
  },

  /** Round end — two-note chord */
  done() {
    beep({ frequency: 523, duration: 0.5, gain: 0.14 });
    setTimeout(() => beep({ frequency: 784, duration: 0.5, gain: 0.14 }), 80);
    setTimeout(() => beep({ frequency: 1046, duration: 0.6, gain: 0.14 }), 160);
  },
};
