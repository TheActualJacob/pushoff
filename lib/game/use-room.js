'use client';

/**
 * useRoom — manages signaling, WebRTC mesh, and game state for a room.
 *
 * Rules:
 *  - polite = selfId < peerId  (deterministic, no coordination needed)
 *  - impolite peer creates the DataChannel and sends the first offer
 *  - organizer = connected peer with the lexicographically smallest ID;
 *    they broadcast the 'start' message once all peers are ready
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { createSignaling } from '@/lib/webrtc/signaling';
import { createPeer } from '@/lib/webrtc/peer';
import { getIceServers } from '@/lib/webrtc/ice-config';
import { useGameStore, selectAllReady } from './store';
import { PHASE } from './phases';

export function useRoom({ code, selfId, selfName }) {
  const store = useGameStore();
  const storeRef = useRef(store);
  useEffect(() => { storeRef.current = store; }, [store]);

  // Derived — computed via selector so it's always fresh (never frozen by Object.assign)
  const allReady = useGameStore(selectAllReady);

  const sigRef = useRef(null);          // createSignaling() instance
  const peersRef = useRef({});          // { [peerId]: peer instance }
  const iceRef = useRef([{ urls: 'stun:stun.l.google.com:19302' }]);
  const startBroadcastedRef = useRef(false);

  const [startAt, setStartAt] = useState(null);
  const [connected, setConnected] = useState(false); // at least one peer connected

  // ── Helpers ──────────────────────────────────────────────────────────────

  function broadcastToAll(msg) {
    for (const peer of Object.values(peersRef.current)) {
      try { peer.send(msg); } catch { /* peer may be closing */ }
    }
  }

  // ── Incoming game messages over DataChannel ───────────────────────────────

  const handleGameMessage = useCallback((fromId, msg) => {
    const s = storeRef.current;
    switch (msg.type) {
      case 'hello':
        s.setPeerName(fromId, msg.name);
        break;
      case 'ready':
        s.setPeerReady(fromId, msg.ready);
        break;
      case 'rep':
        s.setPeerReps(fromId, msg.count);
        break;
      case 'start':
        if (s.phase === PHASE.LOBBY) {
          startBroadcastedRef.current = true; // don't re-broadcast
          s.startCountdown();
          setStartAt(msg.startAt);
        }
        break;
      case 'reset':
        s.reset();
        startBroadcastedRef.current = false;
        setStartAt(null);
        break;
    }
  }, []);

  // ── Peer factory ─────────────────────────────────────────────────────────

  function getOrCreatePeer(peerId) {
    if (peersRef.current[peerId]) return peersRef.current[peerId];

    const polite = selfId < peerId; // deterministic: lower ID is polite

    const peer = createPeer({
      selfId,
      peerId,
      polite,
      signaling: sigRef.current,
      iceServers: iceRef.current,
      onMessage: (msg) => handleGameMessage(peerId, msg),
      onConnect: () => {
        storeRef.current.setPeerConnected(peerId, true);
        setConnected(true);
        // Announce ourselves
        peersRef.current[peerId]?.send({ type: 'hello', name: selfName });
        // Sync ready state if already ready
        if (storeRef.current.myReady) {
          peersRef.current[peerId]?.send({ type: 'ready', ready: true });
        }
      },
      onDisconnect: () => {
        storeRef.current.setPeerConnected(peerId, false);
        const anyLeft = Object.values(storeRef.current.peers).some((p) => p.connected);
        if (!anyLeft) setConnected(false);
      },
    });

    peersRef.current[peerId] = peer;
    return peer;
  }

  // ── Incoming signaling messages ───────────────────────────────────────────

  function handleSignalMessage(msg) {
    const { from, description, candidate } = msg;
    if (!description && !candidate) return;
    const peer = getOrCreatePeer(from);
    peer.handleSignal({ description, candidate });
  }

  function handlePeerList(peerObjs) {
    const peerIds = peerObjs.map((p) => p.peerId).filter((id) => id !== selfId);
    storeRef.current.setPeers(peerIds);
    for (const id of peerIds) {
      getOrCreatePeer(id);
    }
  }

  // ── Organizer: broadcast start when all ready ─────────────────────────────

  useEffect(() => {
    if (!allReady || store.phase !== PHASE.LOBBY) return;
    if (startBroadcastedRef.current) return;

    // Only the smallest ID among self + connected peers acts as organizer
    const connectedIds = Object.entries(store.peers)
      .filter(([, p]) => p.connected)
      .map(([id]) => id);
    const allIds = [selfId, ...connectedIds].sort();
    if (allIds[0] !== selfId) return; // not the organizer

    startBroadcastedRef.current = true;
    // 4000ms = four even 1s buckets: 3, 2, 1, GO
    const at = Date.now() + 4000;
    broadcastToAll({ type: 'start', startAt: at });
    store.startCountdown();
    setStartAt(at);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allReady, store.phase, selfId]);

  // ── Broadcast rep count when it changes ───────────────────────────────────

  useEffect(() => {
    if (store.phase !== PHASE.LIVE) return;
    broadcastToAll({ type: 'rep', count: store.myReps });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.myReps, store.phase]);

  // ── Initialise ICE + signaling on mount ───────────────────────────────────

  useEffect(() => {
    if (!selfId) return;

    store.init({ selfId, selfName });

    let cancelled = false;

    async function setup() {
      // Fetch TURN creds first so every RTCPeerConnection gets them from the start.
      iceRef.current = await getIceServers();
      if (cancelled) return;

      const sig = createSignaling({ roomCode: code, selfId });
      sigRef.current = sig;

      const peerObjs = await sig.join();
      if (cancelled) return;

      handlePeerList(peerObjs);
      sig.startPolling(handleSignalMessage, handlePeerList);
    }

    setup().catch(console.error);

    return () => {
      cancelled = true;
      sigRef.current?.stop();
      for (const peer of Object.values(peersRef.current)) peer.close();
      peersRef.current = {};
    };
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Public actions ────────────────────────────────────────────────────────

  function toggleReady() {
    const next = !store.myReady;
    store.setMyReady(next);
    broadcastToAll({ type: 'ready', ready: next });
  }

  function broadcastReset() {
    store.reset();
    startBroadcastedRef.current = false;
    setStartAt(null);
    broadcastToAll({ type: 'reset' });
  }

  function sendRepCount(count) {
    broadcastToAll({ type: 'rep', count });
  }

  return {
    // state
    startAt,
    connected,
    // actions
    toggleReady,
    broadcastReset,
    sendRepCount,
  };
}
