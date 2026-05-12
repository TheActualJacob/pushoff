'use client';

import { use, useRef, useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import RepCounter from '@/components/rep-counter';
import { createPushupCounter } from '@/lib/pose/pushup-counter';

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

  function getCounter() {
    if (!counterRef.current) counterRef.current = createPushupCounter();
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
      // Clipboard API blocked in some contexts
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <a href="/" className="font-display text-xl tracking-widest text-primary">
          PUSH
        </a>

        <Button
          onClick={copyLink}
          variant="outline"
          size="sm"
          className={cn(
            'gap-2 tracking-widest uppercase active:scale-95',
            copied && 'text-primary border-primary/40',
          )}
        >
          <span className="font-display text-sm tracking-[0.2em]">{code}</span>
          <span>{copied ? '✓ Copied' : 'Copy link'}</span>
        </Button>

        <Button
          onClick={handleReset}
          variant="ghost"
          size="sm"
          className="uppercase tracking-wider text-muted-foreground"
        >
          Reset
        </Button>
      </header>

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

          <div className="flex items-center gap-2 justify-center flex-wrap">
            <Toggle label="Skeleton" active={showSkeleton} onToggle={() => setShowSkeleton((v) => !v)} />
            <Toggle label="Body check" active={alignmentGate} onToggle={() => setAlignmentGate((v) => !v)} />
          </div>
        </div>

        {/* Rep counter panel */}
        <div className="flex flex-col items-center justify-center px-8 py-10 lg:w-72 lg:border-l lg:border-border/40 gap-6 bg-background/60">
          <RepCounter
            count={repState.count}
            poseState={repState.poseState}
            elbowAngle={repState.elbowAngle}
            bodyAligned={repState.bodyAligned}
          />

          <div className="w-full space-y-3">
            <hr className="border-t border-border/70" />
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
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border',
        active
          ? 'bg-primary/12 border-primary/35 text-primary'
          : 'bg-card border-border text-muted-foreground',
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', active ? 'bg-primary' : 'bg-muted-foreground/40')} />
      {label}
    </button>
  );
}

function HintCard() {
  return (
    <Card className="p-0 rounded-xl">
      <CardContent className="px-4 py-3 text-xs leading-relaxed space-y-1">
        <p className="font-semibold text-[11px] uppercase tracking-widest mb-2 text-muted-foreground/70">
          Tips
        </p>
        <p className="text-muted-foreground">Position camera so your full body is visible from the side.</p>
        <p className="text-muted-foreground">
          Reps count on the <span className="text-primary">UP → DOWN → UP</span> transition.
        </p>
        <p className="text-muted-foreground">Keep your body flat for the alignment check to pass.</p>
      </CardContent>
    </Card>
  );
}
