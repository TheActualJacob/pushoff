'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function LandingPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [joinMode, setJoinMode] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const nameRef = useRef(null);

  function saveName() {
    const trimmed = name.trim();
    if (trimmed) {
      localStorage.setItem('pushup_name', trimmed);
    }
    return trimmed;
  }

  function handleCreate() {
    const n = saveName();
    if (!n) { setError('Enter your name first'); nameRef.current?.focus(); return; }
    router.push(`/room/${generateRoomCode()}`);
  }

  function handleJoin() {
    if (!joinMode) { setJoinMode(true); return; }
    const n = saveName();
    if (!n) { setError('Enter your name first'); nameRef.current?.focus(); return; }
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) { setError('Code must be 6 characters'); return; }
    router.push(`/room/${trimmed}`);
  }

  // Load saved name after mount (localStorage is browser-only)
  useEffect(() => {
    const saved = localStorage.getItem('pushup_name');
    if (saved) setName(saved);
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background texture */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              0deg, transparent, transparent 39px,
              oklch(0.75 0.17 52) 39px, oklch(0.75 0.17 52) 40px
            )`,
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-sm flex flex-col gap-8">
        {/* Wordmark */}
        <div className="text-center">
          <h1
            className="font-display tracking-widest leading-none"
            style={{ fontSize: 'clamp(4rem, 22vw, 7rem)', color: 'oklch(0.75 0.17 52)' }}
          >
            PUSH
          </h1>
          <p className="text-sm font-medium tracking-[0.25em] uppercase text-muted-foreground mt-1">
            Pushup competition
          </p>
        </div>

        {/* Form card */}
        <div
          className="rounded-2xl p-6 flex flex-col gap-4"
          style={{ background: 'oklch(0.14 0.009 55)', border: '1px solid oklch(1 0 0 / 0.08)' }}
        >
          {/* Name input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground" htmlFor="player-name">
              Your name
            </label>
            <input
              id="player-name"
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && (joinMode ? handleJoin() : handleCreate())}
              placeholder="Enter your name"
              maxLength={24}
              autoComplete="off"
              className="w-full rounded-xl px-4 py-3 text-sm font-medium bg-background border border-border placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring transition"
            />
          </div>

          {/* Join code input */}
          {joinMode && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground" htmlFor="room-code">
                Room code
              </label>
              <input
                id="room-code"
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value.toUpperCase().slice(0, 6)); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                placeholder="BICEP7"
                maxLength={6}
                autoComplete="off"
                className="w-full rounded-xl px-4 py-3 text-sm font-display tracking-widest text-center bg-background border border-border placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring transition uppercase"
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          {/* Buttons */}
          <div className="flex flex-col gap-2 pt-1">
            <button
              onClick={handleCreate}
              className="w-full rounded-xl py-3 text-sm font-bold tracking-wider uppercase transition-all active:scale-[0.97]"
              style={{
                background: 'oklch(0.75 0.17 52)',
                color: 'oklch(0.10 0.008 55)',
              }}
            >
              Create Room
            </button>
            <button
              onClick={handleJoin}
              className="w-full rounded-xl py-3 text-sm font-semibold tracking-wider uppercase transition-all active:scale-[0.97]"
              style={{
                background: joinMode ? 'oklch(0.20 0.010 55)' : 'transparent',
                border: '1px solid oklch(1 0 0 / 0.12)',
                color: 'oklch(0.75 0.008 60)',
              }}
            >
              {joinMode ? 'Join →' : 'Join Room'}
            </button>
            {joinMode && (
              <button
                onClick={() => { setJoinMode(false); setCode(''); setError(''); }}
                className="text-xs text-muted-foreground hover:text-foreground transition"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Footer hint */}
        <p className="text-center text-xs text-muted-foreground/50">
          No account needed. Your camera never leaves your device.
        </p>
      </div>
    </main>
  );
}
