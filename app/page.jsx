'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

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
    if (trimmed) localStorage.setItem('pushup:name', trimmed);
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

  useEffect(() => {
    const saved = localStorage.getItem('pushup:name');
    if (saved) setName(saved);
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background rule texture using the primary token */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              0deg, transparent, transparent 39px,
              var(--color-primary) 39px, var(--color-primary) 40px
            )`,
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-sm flex flex-col gap-8">
        {/* Wordmark */}
        <div className="text-center">
          <h1
            className="font-display tracking-widest leading-none text-primary"
            style={{ fontSize: 'clamp(4rem, 22vw, 7rem)' }}
          >
            PUSH
          </h1>
          <p className="text-sm font-medium tracking-[0.25em] uppercase text-muted-foreground mt-1">
            Pushup competition
          </p>
        </div>

        {/* Form card */}
        <Card className="p-0 rounded-2xl">
          <CardContent className="p-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground" htmlFor="player-name">
                Your name
              </label>
              <Input
                id="player-name"
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && (joinMode ? handleJoin() : handleCreate())}
                placeholder="Enter your name"
                maxLength={24}
                autoComplete="off"
                className="h-auto py-3 rounded-xl text-sm font-medium"
              />
            </div>

            {joinMode && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground" htmlFor="room-code">
                  Room code
                </label>
                <Input
                  id="room-code"
                  type="text"
                  value={code}
                  onChange={(e) => { setCode(e.target.value.toUpperCase().slice(0, 6)); setError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                  placeholder="BICEP7"
                  maxLength={6}
                  autoComplete="off"
                  className="h-auto py-3 rounded-xl font-display tracking-widest text-center text-sm uppercase"
                />
              </div>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex flex-col gap-2 pt-1">
              <Button
                onClick={handleCreate}
                className="w-full h-auto py-3 rounded-xl text-sm font-bold tracking-wider uppercase active:scale-[0.97]"
              >
                Create Room
              </Button>
              <Button
                onClick={handleJoin}
                variant={joinMode ? 'secondary' : 'outline'}
                className="w-full h-auto py-3 rounded-xl text-sm font-semibold tracking-wider uppercase active:scale-[0.97]"
              >
                {joinMode ? 'Join →' : 'Join Room'}
              </Button>
              {joinMode && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setJoinMode(false); setCode(''); setError(''); }}
                  className="text-xs text-muted-foreground"
                >
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground/50">
          No account needed. Your camera never leaves your device.
        </p>
      </div>
    </main>
  );
}
