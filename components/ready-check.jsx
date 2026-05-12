'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * ReadyCheck — pre-game ready toggle and player status list.
 *
 * Props:
 *   selfReady    — boolean
 *   peers        — [{ id, name, ready, connected }]
 *   onToggle()   — called when user toggles their ready state
 *   disabled     — disable the button (e.g. no peers connected)
 */
export default function ReadyCheck({ selfReady, peers = [], onToggle, disabled }) {
  const connectedPeers = peers.filter((p) => p.connected);
  const hasOpponents = connectedPeers.length > 0;

  return (
    <div className="flex flex-col items-center gap-5 w-full">
      {/* Ready button */}
      <Button
        onClick={onToggle}
        disabled={disabled || !hasOpponents}
        size="lg"
        className={cn(
          'w-full max-w-xs h-14 text-base font-bold uppercase tracking-[0.15em] transition-all duration-200',
          selfReady
            ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20'
            : 'bg-primary text-primary-foreground hover:bg-primary/90',
        )}
        variant={selfReady ? 'outline' : 'default'}
      >
        {selfReady ? '✓ Ready' : 'Ready Up'}
      </Button>

      {!hasOpponents && (
        <p className="text-xs text-muted-foreground/60 text-center">
          Waiting for opponents to join…
          <br />
          Share the room code to invite them.
        </p>
      )}

      {/* Peer status list */}
      {connectedPeers.length > 0 && (
        <div className="w-full space-y-1.5">
          {connectedPeers.map((p) => (
            <PeerRow key={p.id} peer={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function PeerRow({ peer }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-card border border-border/50">
      <span className="text-sm font-medium text-foreground truncate">{peer.name}</span>
      <span
        className={cn(
          'text-xs font-semibold px-2 py-0.5 rounded-full',
          peer.ready
            ? 'bg-emerald-500/15 text-emerald-400'
            : 'bg-muted/50 text-muted-foreground/60',
        )}
      >
        {peer.ready ? 'Ready' : 'Waiting…'}
      </span>
    </div>
  );
}
