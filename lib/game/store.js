/**
 * Zustand game store — single source of truth on the client.
 *
 * peers: { [peerId]: { name, reps, ready, connected } }
 */

import { create } from 'zustand';
import { PHASE } from './phases';

export const useGameStore = create((set, get) => ({
  // ── Identity ──────────────────────────────────────────────────────────────
  selfId: null,
  selfName: '',

  // ── Phase & timing ────────────────────────────────────────────────────────
  phase: PHASE.LOBBY,
  startTime: null,       // epochMs when the round started
  duration: 60_000,      // configurable: 30k | 60k | 120k ms

  // ── Self ──────────────────────────────────────────────────────────────────
  myReps: 0,
  myReady: false,

  // ── Peers ─────────────────────────────────────────────────────────────────
  /** { [peerId]: { name, reps, ready, connected } } */
  peers: {},

  // ── Actions ───────────────────────────────────────────────────────────────

  init({ selfId, selfName, duration }) {
    // Full reset so stale phase/reps from a previous room don't bleed through.
    set({
      selfId, selfName, duration: duration ?? 60_000,
      phase: PHASE.LOBBY,
      myReps: 0,
      myReady: false,
      startTime: null,
      peers: {},
    });
  },

  setDuration(ms) {
    set({ duration: ms });
  },

  // Peer list arrives from the signaling join response
  setPeers(peerIds) {
    const { peers, selfId } = get();
    const next = { ...peers };
    for (const id of peerIds) {
      if (id === selfId) continue;
      if (!next[id]) next[id] = { name: id, reps: 0, ready: false, connected: false };
    }
    set({ peers: next });
  },

  setPeerConnected(peerId, connected) {
    const { peers } = get();
    set({ peers: { ...peers, [peerId]: { ...peers[peerId], connected } } });
  },

  setPeerName(peerId, name) {
    const { peers } = get();
    set({ peers: { ...peers, [peerId]: { ...(peers[peerId] ?? {}), name } } });
  },

  setPeerReps(peerId, reps) {
    const { peers } = get();
    set({ peers: { ...peers, [peerId]: { ...(peers[peerId] ?? {}), reps } } });
  },

  setPeerReady(peerId, ready) {
    const { peers } = get();
    set({ peers: { ...peers, [peerId]: { ...(peers[peerId] ?? {}), ready } } });
  },

  incrementRep() {
    set((s) => ({ myReps: s.myReps + 1 }));
  },

  setMyReady(ready) {
    set({ myReady: ready });
  },

  startCountdown() {
    set({ phase: PHASE.COUNTDOWN });
  },

  startLive(startTime) {
    set({ phase: PHASE.LIVE, startTime });
  },

  finishRound() {
    set({ phase: PHASE.DONE });
  },

  reset() {
    const { peers } = get();
    const clearedPeers = Object.fromEntries(
      Object.entries(peers).map(([id, p]) => [id, { ...p, reps: 0, ready: false }])
    );
    set({
      phase: PHASE.LOBBY,
      myReps: 0,
      myReady: false,
      startTime: null,
      peers: clearedPeers,
    });
  },

}));

// Derived selectors — computed outside the store so Zustand's Object.assign
// state-merge never freezes them as stale data properties.

export function selectAllReady(s) {
  const connected = Object.values(s.peers).filter((p) => p.connected);
  return s.myReady && connected.length > 0 && connected.every((p) => p.ready);
}

export function selectLeaderboard(s) {
  const rows = [
    { id: s.selfId, name: s.selfName || 'You', reps: s.myReps, isSelf: true },
    ...Object.entries(s.peers)
      .filter(([, p]) => p.connected)
      .map(([id, p]) => ({ id, name: p.name || id, reps: p.reps, isSelf: false })),
  ];
  return rows.sort((a, b) => b.reps - a.reps);
}

export function selectConnectedPeers(s) {
  return Object.entries(s.peers)
    .filter(([, p]) => p.connected)
    .map(([id, p]) => ({ id, ...p }));
}
