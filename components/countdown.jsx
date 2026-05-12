'use client';

import { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { sounds } from '@/lib/sounds';

/**
 * Countdown — full-screen 3-2-1-GO overlay.
 *
 * Props:
 *   startAt  — epochMs when the round officially begins (from room creator)
 *   onDone() — called after "GO" animates out
 */
export default function Countdown({ startAt, onDone }) {
  const [display, setDisplay] = useState(null);
  const [animKey, setAnimKey] = useState(0);
  const prevDisplayRef = useRef(null);

  useEffect(() => {
    if (!startAt) return;

    function tick() {
      const remaining = startAt - Date.now();
      let next;

      if (remaining > 3000) {
        next = '3';
      } else if (remaining > 2000) {
        next = '2';
      } else if (remaining > 1000) {
        next = '1';
      } else if (remaining > 0) {
        next = 'GO';
      } else {
        onDone?.();
        return;
      }

      if (next !== prevDisplayRef.current) {
        prevDisplayRef.current = next;
        setDisplay(next);
        setAnimKey((k) => k + 1);
        // Play beep on each new number
        if (next !== 'GO') sounds.countdown();
      }

      requestAnimationFrame(tick);
    }

    const raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [startAt, onDone]);

  if (!display) return null;

  const isGo = display === 'GO';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <span
        key={animKey}
        className={cn(
          'font-display leading-none select-none',
          'animate-countdown-pop',
          isGo ? 'text-primary' : 'text-white',
        )}
        style={{ fontSize: 'clamp(6rem, 30vw, 16rem)' }}
      >
        {display}
      </span>
    </div>
  );
}
