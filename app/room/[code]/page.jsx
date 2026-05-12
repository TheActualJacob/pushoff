'use client';

import { use, useRef, useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import RepCounter from '@/components/rep-counter';
import { createPushupCounter } from '@/lib/pose/pushup-counter';

// CameraView uses TFJS — must be client-only with no SSR
const CameraView = dynamic(() => import('@/components/camera-view'), { ssr: false });

export default function RoomPage({ params }) {
  const { code } = use(params);

  const counterRef = useRef(null);
  const [repState, setRepState] = useState({ count: 0, poseState: 'UP', elbowAngle: null, bodyAligned: null });
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [alignmentGate, setAlignmentGate] = useState(true);
  const [copied, setCopied] = useState(false);
  const alignmentGateRef = useRef(alignmentGate);

  useEffect(() => { alignmentGateRef.current = alignmentGate; }, [alignmentGate]);

  // Lazy-init counter
  function getCounter() {
    if (!counterRef.current) {
      counterRef.current = createPushupCounter();
    }
    return counterRef.current;
  }

  const onPoses = useCallback((keypoints) => {
    const result = getCounter().update(keypoints, alignmentGateRef.current);
    setRepState({
      count: result.count,
      poseState: result.state,
      elbowAngle: result.elbowAngle,
      bodyAligned: result.bodyAligned,
    });
  }, []);

  function handleReset() {
    getCounter().reset();
    setRepState({ count: 0, poseState: 'UP', elbowAngle: null, bodyAligned: null });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be blocked in some contexts
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'oklch(0.08 0.006 55)' }}
    >
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <a href="/" className="font-display text-xl tracking-widest" style={{ color: 'oklch(0.75 0.17 52)' }}>
          PUSH
        </a>

        <button
          onClick={copyLink}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-widest uppercase transition-all active:scale-95"
          style={{
            background: 'oklch(0.16 0.009 55)',
            border: '1px solid oklch(1 0 0 / 0.08)',
            color: copied ? 'oklch(0.75 0.17 52)' : 'oklch(0.65 0.006 60)',
          }}
        >
          <span className="font-display text-sm tracking-[0.2em]">{code}</span>
          <span>{copied ? '✓ Copied' : 'Copy link'}</span>
        </button>

        <button
          onClick={handleReset}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all active:scale-95"
          style={{
            background: 'oklch(0.16 0.009 55)',
            border: '1px solid oklch(1 0 0 / 0.08)',
            color: 'oklch(0.58 0.008 60)',
          }}
        >
          Reset
        </button>
      </header>

      {/* Main area */}
      <div className="flex-1 flex flex-col lg:flex-row gap-0">
        {/* Camera panel */}
        <div className="flex-1 flex flex-col p-3 gap-3 min-h-0">
          <CameraView
            onPoses={onPoses}
            showSkeleton={showSkeleton}
            mirror
            className="flex-1"
            style={{ minHeight: '40vh' }}
          />

          {/* Controls row */}
          <div className="flex items-center gap-2 justify-center flex-wrap">
            <Toggle
              label="Skeleton"
              active={showSkeleton}
              onToggle={() => setShowSkeleton((v) => !v)}
            />
            <Toggle
              label="Body check"
              active={alignmentGate}
              onToggle={() => setAlignmentGate((v) => !v)}
            />
          </div>
        </div>

        {/* Rep counter panel */}
        <div
          className="flex flex-col items-center justify-center px-8 py-10 lg:w-72 lg:border-l lg:border-border/40 gap-6"
          style={{ background: 'oklch(0.10 0.008 55 / 0.6)' }}
        >
          <RepCounter
            count={repState.count}
            poseState={repState.poseState}
            elbowAngle={repState.elbowAngle}
            bodyAligned={repState.bodyAligned}
          />

          <div className="w-full space-y-3">
            <Divider />
            <HintCard />
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, active, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
      style={{
        background: active ? 'oklch(0.75 0.17 52 / 0.12)' : 'oklch(0.16 0.009 55)',
        border: `1px solid ${active ? 'oklch(0.75 0.17 52 / 0.35)' : 'oklch(1 0 0 / 0.08)'}`,
        color: active ? 'oklch(0.75 0.17 52)' : 'oklch(0.55 0.008 60)',
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: active ? 'oklch(0.75 0.17 52)' : 'oklch(0.38 0.008 60)' }}
      />
      {label}
    </button>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'oklch(1 0 0 / 0.07)' }} />;
}

function HintCard() {
  return (
    <div
      className="rounded-xl px-4 py-3 text-xs leading-relaxed space-y-1"
      style={{ background: 'oklch(0.14 0.009 55)', color: 'oklch(0.52 0.006 60)' }}
    >
      <p className="font-semibold text-[11px] uppercase tracking-widest mb-2" style={{ color: 'oklch(0.42 0.006 60)' }}>
        Tips
      </p>
      <p>Position camera so your full body is visible from the side.</p>
      <p>Reps count on the <span style={{ color: 'oklch(0.75 0.17 52)' }}>UP → DOWN → UP</span> transition.</p>
      <p>Keep your body flat for the alignment check to pass.</p>
    </div>
  );
}
