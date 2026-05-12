'use client';

/**
 * useRoom — manages signaling, WebRTC mesh, and game state for a room.
 *
 * Rules:
 *  - polite = selfId < peerId  (deterministic, no coordination needed)
 *  - impolite peer creates the DataChannel and sends the first offer
 *  - organizer = connected peer with the lexicographically smallest ID;
 *    they broadcast the 'start' message once all peers are ready
 *
 * Video:
 *  - Pass `localStream` (from getUserMedia) to enable opponent video.
 *  - A separate STUN-only RTCPeerConnection per peer handles video.
 *    Signals are piped through the existing game DataChannel (type: 'vpeer').
 *  - If the STUN hole-punch fails within 8 s, videoStates[peerId] → 'blocked'.
 *  - remoteStreams[peerId] holds the MediaStream when active.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { createSignaling } from '@/lib/webrtc/signaling';
import { createPeer } from '@/lib/webrtc/peer';
import { createVideoPeer } from '@/lib/webrtc/video-peer';
import { getIceServers } from '@/lib/webrtc/ice-config';
import { useGameStore, selectAllReady } from './store';
import { PHASE } from './phases';

export function useRoom({ code, selfId, selfName, localStream }) {
  const store = useGameStore();
  const storeRef = useRef(store);
  useEffect(() => { storeRef.current = store; }, [store]);

  const allReady = useGameStore(selectAllReady);

  const sigRef = useRef(null);
  const peersRef = useRef({});       // game peers  { [peerId]: peer }
  const videoPeersRef = useRef({});  // video peers { [peerId]: videoPeer }
  const iceRef = useRef([{ urls: 'stun:stun.l.google.com:19302' }]);
  const startBroadcastedRef = useRef(false);
  const localStreamRef = useRef(localStream);

  const [startAt, setStartAt] = useState(null);
  const [connected, setConnected] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState({});   // { [peerId]: MediaStream }
  const [videoStates, setVideoStates] = useState({});      // { [peerId]: 'connecting'|'active'|'blocked' }

  // Keep localStreamRef current
  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);

  // When localStream becomes available, add the video track to any peers that
  // connected before the camera was ready.
  useEffect(() => {
    if (!localStream) return;
    const track = localStream.getVideoTracks()[0];
    if (!track) return;
    for (const vp of Object.values(videoPeersRef.current)) {
      vp.addTrack(track, localStream);
    }
  }, [localStream]);

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
          startBroadcastedRef.current = true;
          s.startCountdown();
          setStartAt(msg.startAt);
        }
        break;
      case 'reset':
        s.reset();
        startBroadcastedRef.current = false;
        setStartAt(null);
        break;
      case 'vpeer':
        // Route video signaling to the correct video peer.
        videoPeersRef.current[fromId]?.handleSignal({ desc: msg.desc, cand: msg.cand });
        break;
    }
  }, []);

  // ── Peer factory ─────────────────────────────────────────────────────────

  function getOrCreatePeer(peerId) {
    if (peersRef.current[peerId]) return peersRef.current[peerId];

    const polite = selfId < peerId;

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
        peersRef.current[peerId]?.send({ type: 'hello', name: selfName });
        if (storeRef.current.myReady) {
          peersRef.current[peerId]?.send({ type: 'ready', ready: true });
        }

        // ── Video peer (STUN-only) ────────────────────────────────────────
        if (!videoPeersRef.current[peerId]) {
          const vp = createVideoPeer({
            polite,
            onSignal: ({ desc, cand }) => {
              const gp = peersRef.current[peerId];
              if (desc) gp?.send({ type: 'vpeer', desc });
              if (cand) gp?.send({ type: 'vpeer', cand });
            },
            onStream: (stream) => {
              setRemoteStreams((prev) => ({ ...prev, [peerId]: stream }));
              setVideoStates((prev) => ({ ...prev, [peerId]: 'active' }));
            },
            onBlocked: () => {
              setVideoStates((prev) => ({ ...prev, [peerId]: 'blocked' }));
            },
          });

          videoPeersRef.current[peerId] = vp;
          setVideoStates((prev) => ({ ...prev, [peerId]: 'connecting' }));

          // Add local video track immediately if stream is ready.
          const stream = localStreamRef.current;
          if (stream) {
            const track = stream.getVideoTracks()[0];
            if (track) vp.addTrack(track, stream);
          }
        }
      },
      onDisconnect: () => {
        storeRef.current.setPeerConnected(peerId, false);
        const anyLeft = Object.values(storeRef.current.peers).some((p) => p.connected);
        if (!anyLeft) setConnected(false);

        // Clean up video peer on disconnect.
        videoPeersRef.current[peerId]?.close();
        delete videoPeersRef.current[peerId];
        setRemoteStreams((prev) => { const n = { ...prev }; delete n[peerId]; return n; });
        setVideoStates((prev) => { const n = { ...prev }; delete n[peerId]; return n; });
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

    const connectedIds = Object.entries(store.peers)
      .filter(([, p]) => p.connected)
      .map(([id]) => id);
    const allIds = [selfId, ...connectedIds].sort();
    if (allIds[0] !== selfId) return;

    startBroadcastedRef.current = true;
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
      for (const vp of Object.values(videoPeersRef.current)) vp.close();
      peersRef.current = {};
      videoPeersRef.current = {};
    };
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
    startAt,
    connected,
    remoteStreams,
    videoStates,
    toggleReady,
    broadcastReset,
    sendRepCount,
  };
}
