'use client';

import { use, useRef, useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import RepCounter from '@/components/rep-counter';
import Leaderboard from '@/components/leaderboard';
import ReadyCheck from '@/components/ready-check';
import Countdown from '@/components/countdown';
import { createPushupCounter } from '@/lib/pose/pushup-counter';
import { useGameStore, selectLeaderboard, selectConnectedPeers } from '@/lib/game/store';
import { useRoom } from '@/lib/game/use-room';
import { PHASE } from '@/lib/game/phases';
import { sounds } from '@/lib/sounds';

const CameraView = dynamic(() => import('@/components/camera-view'), { ssr: false });

// ── Debug log panel (press D to toggle) ───────────────────────────────────
function DebugPanel({ selfId, peers }) {
  const [show, setShow] = useState(false);
  const [logs, setLogs] = useState([]);
  useEffect(() => {
    const handler = () => setLogs([...(window.__pushLog ?? [])]);
    window.addEventListener('pushlog', handler);
    const key = (e) => { if (e.key === 'd' || e.key === 'D') setShow(v => !v); };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pushlog', handler); window.removeEventListener('keydown', key); };
  }, []);
  if (!show) return (
    <div className="fixed bottom-2 right-2 text-[10px] text-white/20 select-none z-50">press D for debug</div>
  );
  return (
    <div className="fixed bottom-2 right-2 z-50 w-80 max-h-72 overflow-y-auto rounded-lg bg-black/90 border border-white/10 p-2 text-[10px] font-mono text-green-400">
      <div className="flex justify-between mb-1">
        <span className="text-white/50">DEBUG — press D to hide</span>
        <span className="text-white/40">me: {selfId?.slice(0,6)}</span>
      </div>
      <div className="mb-1 text-yellow-300">
        peers: {JSON.stringify(Object.entries(peers).map(([id,p]) => ({id:id.slice(0,6),conn:p.connected,ready:p.ready})))}
      </div>
      {[...logs].reverse().map((l, i) => <div key={i} className="leading-4">{l}</div>)}
    </div>
  );
}

// ── Stable identity helpers ────────────────────────────────────────────────

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function loadIdentity() {
  if (typeof window === 'undefined') return { id: makeId(), name: '' };
  let id = localStorage.getItem('pushup:id');
  if (!id) { id = makeId(); localStorage.setItem('pushup:id', id); }
  const name = localStorage.getItem('pushup:name') || '';
  return { id, name };
}

// ── Component ─────────────────────────────────────────────────────────────

export default function RoomPage({ params }) {
  const { code } = use(params);

  // Identity — stable across the session
  const identityRef = useRef(null);
  if (!identityRef.current) identityRef.current = loadIdentity();
  const { id: selfId, name: savedName } = identityRef.current;

  const [selfName, setSelfName] = useState(savedName);
  const [nameConfirmed, setNameConfirmed] = useState(!!savedName);

  // Pose / rep counter
  const counterRef = useRef(null);
  const [repState, setRepState] = useState({ count: 0, poseState: 'UP', elbowAngle: null, bodyAligned: null });
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [alignmentGate, setAlignmentGate] = useState(true);
  const alignmentGateRef = useRef(alignmentGate);
  useEffect(() => { alignmentGateRef.current = alignmentGate; }, [alignmentGate]);

  // Game store
  const {
    phase, myReps, myReady, peers, duration,
    incrementRep, setMyReady, startLive, finishRound,
    setDuration,
  } = useGameStore();
  // Derived — use selectors so Object.assign in Zustand never freezes these as stale booleans
  const leaderboard = useGameStore(selectLeaderboard);
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Timer state (rAF-driven during LIVE phase)
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef(null);

  // Personal best
  const [personalBest, setPersonalBest] = useState(0);
  const [newRecord, setNewRecord] = useState(false);
  useEffect(() => {
    const pb = parseInt(localStorage.getItem('pushup:best') ?? '0', 10);
    setPersonalBest(pb);
  }, []);

  // UI
  const [copied, setCopied] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [portrait, setPortrait] = useState(false);

  // Pause warning when tab loses focus during LIVE round
  useEffect(() => {
    function onVis() { setTabHidden(document.hidden); }
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Landscape hint on mobile
  useEffect(() => {
    function check() {
      const mobile = window.innerWidth < 768;
      setPortrait(mobile && window.innerHeight > window.innerWidth);
    }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Room hook (WebRTC + signaling)
  const { startAt, connected, toggleReady, broadcastReset } = useRoom({
    code,
    selfId,
    selfName: selfName || selfId,
  });

  // ── Pose loop ─────────────────────────────────────────────────────────────

  function getCounter() {
    if (!counterRef.current) counterRef.current = createPushupCounter();
    return counterRef.current;
  }

  const prevCountRef = useRef(0);

  const onPoses = useCallback((keypoints) => {
    const result = getCounter().update(keypoints, alignmentGateRef.current);
    setRepState({
      count: result.count,
      poseState: result.state,
      elbowAngle: result.elbowAngle,
      bodyAligned: result.bodyAligned,
    });

    // Only count reps during the LIVE phase
    if (phaseRef.current === PHASE.LIVE && result.count > prevCountRef.current) {
      const delta = result.count - prevCountRef.current;
      for (let i = 0; i < delta; i++) incrementRep();
      prevCountRef.current = result.count;
      sounds.rep();
    }
  }, [incrementRep]);

  // Reset the local rep counter when a new round begins
  useEffect(() => {
    if (phase === PHASE.LIVE) {
      getCounter().reset();
      prevCountRef.current = 0;
      setRepState({ count: 0, poseState: 'UP', elbowAngle: null, bodyAligned: null });
    }
  }, [phase]);

  // ── Timer (rAF during LIVE phase) ─────────────────────────────────────────

  useEffect(() => {
    if (phase !== PHASE.LIVE || !startAt) return;

    // Anchor to the shared startAt so every player's timer expires at the same
    // absolute millisecond, regardless of local processing jitter.
    const deadline = startAt + duration;
    let raf;

    function tick() {
      const remaining = Math.max(0, deadline - Date.now());
      setElapsed(duration - remaining);
      if (remaining <= 0) {
        finishRound();
        const final = useGameStore.getState().myReps;
        const pb = parseInt(localStorage.getItem('pushup:best') ?? '0', 10);
        sounds.done();
        if (final > pb) {
          localStorage.setItem('pushup:best', String(final));
          setPersonalBest(final);
          setNewRecord(true);
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, duration, finishRound, startAt]);

  // ── Transition: COUNTDOWN → LIVE ─────────────────────────────────────────

  const handleCountdownDone = useCallback(() => {
    sounds.go();
    startLive(Date.now());
  }, [startLive]);

  // ── Actions ───────────────────────────────────────────────────────────────

  function handleReset() {
    setNewRecord(false);
    setElapsed(0);
    broadcastReset();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  }

  function confirmName() {
    const trimmed = selfName.trim() || `Player-${selfId.slice(0, 4)}`;
    setSelfName(trimmed);
    localStorage.setItem('pushup:name', trimmed);
    setNameConfirmed(true);
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const remaining = Math.max(0, duration - elapsed);
  const remainingPct = (remaining / duration) * 100;
  const connectedPeerList = Object.entries(peers)
    .filter(([, p]) => p.connected)
    .map(([id, p]) => ({ id, ...p }));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-background">

      {/* Countdown overlay */}
      {phase === PHASE.COUNTDOWN && startAt && (
        <Countdown startAt={startAt} onDone={handleCountdownDone} />
      )}

      {/* Tab hidden warning during live round */}
      {phase === PHASE.LIVE && tabHidden && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
          <div className="text-center space-y-2">
            <div className="text-4xl">⏸</div>
            <p className="text-lg font-bold text-white">Tab inactive</p>
            <p className="text-sm text-white/60">Return to this tab to keep counting.</p>
          </div>
        </div>
      )}

      {/* Portrait hint on mobile */}
      {portrait && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95">
          <div className="text-center space-y-3 px-8">
            <div className="text-5xl" style={{ transform: 'rotate(90deg)', display: 'inline-block' }}>📱</div>
            <p className="text-white font-bold text-lg">Rotate your phone</p>
            <p className="text-white/60 text-sm">Landscape mode works best for pushup detection.</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
        <a href="/" className="font-display text-xl tracking-widest text-primary">PUSH</a>

        <Button
          onClick={copyLink}
          variant="outline"
          size="sm"
          className={cn('gap-2 tracking-widest uppercase active:scale-95',
            copied && 'text-primary border-primary/40')}
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
          {phase === PHASE.DONE ? 'Rematch' : 'Reset'}
        </Button>
      </header>

      {/* ── DONE screen ─────────────────────────────────────────────────── */}
      {phase === PHASE.DONE && (
        <DoneScreen
          leaderboard={leaderboard}
          personalBest={personalBest}
          newRecord={newRecord}
          onRematch={handleReset}
        />
      )}

      {/* ── LOBBY / LIVE screens ─────────────────────────────────────────── */}
      {phase !== PHASE.DONE && (
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">

          {/* Camera panel */}
          <div className="flex-1 flex flex-col p-3 gap-3 min-h-0">
            {!nameConfirmed && (
              <NamePrompt
                value={selfName}
                onChange={setSelfName}
                onConfirm={confirmName}
              />
            )}

            <CameraView
              onPoses={onPoses}
              showSkeleton={showSkeleton}
              mirror
              className="flex-1"
              style={{ minHeight: '40vh' }}
            />

            {/* Timer bar (LIVE phase) */}
            {phase === PHASE.LIVE && (
              <TimerBar remaining={remaining} pct={remainingPct} duration={duration} />
            )}

            {/* Toggles */}
            <div className="flex items-center gap-2 justify-center flex-wrap">
              <Toggle label="Skeleton" active={showSkeleton} onToggle={() => setShowSkeleton((v) => !v)} />
              <Toggle label="Body check" active={alignmentGate} onToggle={() => setAlignmentGate((v) => !v)} />
              {phase === PHASE.LOBBY && (
                <DurationPicker value={duration} onChange={setDuration} />
              )}
            </div>
          </div>

          {/* Right panel */}
          <div className="flex flex-col px-5 py-6 lg:w-80 lg:border-l lg:border-border/40 gap-6 bg-background/60">

            {/* Rep counter */}
            <RepCounter
              count={phase === PHASE.LIVE ? myReps : repState.count}
              poseState={repState.poseState}
              elbowAngle={repState.elbowAngle}
              bodyAligned={repState.bodyAligned}
            />

            <div className="space-y-4">
              <hr className="border-t border-border/50" />

              {/* LOBBY: ready check */}
              {phase === PHASE.LOBBY && (
                <ReadyCheck
                  selfReady={myReady}
                  peers={connectedPeerList}
                  onToggle={toggleReady}
                />
              )}

              {/* LIVE: opponent leaderboard */}
              {phase === PHASE.LIVE && leaderboard.length > 1 && (
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground/60 font-semibold">
                    Live
                  </p>
                  <Leaderboard rows={leaderboard} />
                </div>
              )}

              {/* Hints */}
              {phase === PHASE.LOBBY && <HintCard />}
            </div>
          </div>
        </div>
      )}

      <DebugPanel selfId={selfId} peers={peers} />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function NamePrompt({ value, onChange, onConfirm }) {
  return (
    <div className="flex gap-2 items-center px-1">
      <input
        className="flex-1 rounded-lg border border-border bg-card text-sm px-3 py-2 outline-none focus:ring-2 focus:ring-ring/60"
        placeholder="Your name…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onConfirm()}
        autoFocus
        maxLength={20}
      />
      <Button size="sm" onClick={onConfirm}>Join</Button>
    </div>
  );
}

function TimerBar({ remaining, pct, duration }) {
  const secs = Math.ceil(remaining / 1000);
  const urgent = remaining < 10_000;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-mono text-muted-foreground/60">
        <span>Time</span>
        <span className={cn('tabular-nums', urgent && 'text-red-400 font-bold')}>
          {secs}s
        </span>
      </div>
      <div className="h-2 rounded-full bg-border/40 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-none',
            urgent ? 'bg-red-400' : 'bg-primary',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function DoneScreen({ leaderboard, personalBest, newRecord, onRematch }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8">
      {/* Trophy */}
      <div className="text-center space-y-1">
        <div className="text-6xl">🏆</div>
        <h2 className="font-display text-3xl tracking-widest text-primary uppercase">Done</h2>
        {newRecord && (
          <p className="text-sm font-semibold text-amber-400 animate-pulse">
            ✨ Personal best: {personalBest} reps!
          </p>
        )}
      </div>

      {/* Podium */}
      <div className="w-full max-w-sm space-y-2">
        {leaderboard.map((row, i) => (
          <PodiumRow key={row.id} row={row} rank={i + 1} />
        ))}
      </div>

      <Button onClick={onRematch} size="lg" className="uppercase tracking-widest px-10">
        Rematch
      </Button>
    </div>
  );
}

function PodiumRow({ row, rank }) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
  return (
    <div className={cn(
      'flex items-center gap-4 px-5 py-4 rounded-xl border transition-all',
      row.isSelf
        ? 'border-primary/30 bg-primary/8 scale-[1.02]'
        : 'border-border/50 bg-card/60',
    )}>
      <span className="text-2xl w-8 text-center">{medal}</span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{row.name}</div>
        {row.isSelf && <div className="text-xs text-primary/60">you</div>}
      </div>
      <span className="font-display text-3xl tabular-nums text-foreground/80">{row.reps}</span>
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

function DurationPicker({ value, onChange }) {
  const options = [
    { label: '30s', ms: 30_000 },
    { label: '1m', ms: 60_000 },
    { label: '2m', ms: 120_000 },
  ];
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-card">
      {options.map((o) => (
        <button
          key={o.ms}
          onClick={() => onChange(o.ms)}
          className={cn(
            'px-2.5 py-1 rounded-md text-xs font-semibold transition-all',
            value === o.ms
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function HintCard() {
  return (
    <Card className="p-0 rounded-xl">
      <CardContent className="px-4 py-3 text-xs leading-relaxed space-y-1">
        <p className="font-semibold text-[11px] uppercase tracking-widest mb-2 text-muted-foreground/70">Tips</p>
        <p className="text-muted-foreground">Position camera so your full body is visible from the side.</p>
        <p className="text-muted-foreground">
          Reps count on the <span className="text-primary">UP → DOWN → UP</span> transition.
        </p>
        <p className="text-muted-foreground">Keep your body flat for the alignment check to pass.</p>
      </CardContent>
    </Card>
  );
}
