'use client';

import { useEffect, useRef } from 'react';

/**
 * OpponentVideo — shows a peer's video feed or a contextual placeholder.
 *
 * Props:
 *   stream     — MediaStream when video is active, null otherwise
 *   videoState — 'connecting' | 'active' | 'blocked' | null (null = no peer yet)
 *   name       — display name
 *   reps       — current rep count
 */
export default function OpponentVideo({ stream, videoState, name, reps = 0 }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!videoState) return null;

  return (
    <div
      className="relative rounded-xl overflow-hidden bg-zinc-900"
      style={{ aspectRatio: '16/9' }}
    >
      {/* Live video */}
      {videoState === 'active' && stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
      )}

      {/* Connecting spinner */}
      {videoState === 'connecting' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <svg className="w-5 h-5 animate-spin text-white/30" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-xs text-white/30">Connecting video…</p>
        </div>
      )}

      {/* Blocked by firewall */}
      {videoState === 'blocked' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 text-center">
          <span className="text-xl">🔒</span>
          <p className="text-xs text-white/50 leading-snug">
            Their network is blocking direct video
          </p>
        </div>
      )}

      {/* Rep count overlay — always visible */}
      <div className="absolute bottom-2 right-2 bg-black/70 rounded-lg px-2 py-0.5">
        <span className="text-white font-mono font-bold text-base tabular-nums">
          {String(reps).padStart(2, '0')}
        </span>
      </div>

      {/* Name tag */}
      <div className="absolute top-2 left-2 bg-black/60 rounded px-2 py-0.5 max-w-[70%] truncate">
        <span className="text-white/70 text-xs">{name}</span>
      </div>
    </div>
  );
}
