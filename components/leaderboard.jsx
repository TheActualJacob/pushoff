'use client';

import { cn } from '@/lib/utils';

/**
 * Leaderboard — ranked rep counts for all players.
 *
 * Props:
 *   rows — [{ id, name, reps, isSelf }] sorted by reps desc
 *   maxReps — for the progress bar width (default: max of all rows)
 */
export default function Leaderboard({ rows = [], maxReps }) {
  if (!rows.length) return null;
  const top = maxReps ?? Math.max(1, ...rows.map((r) => r.reps));

  return (
    <div className="w-full space-y-2">
      {rows.map((row, i) => (
        <LeaderboardRow key={row.id} row={row} rank={i + 1} top={top} />
      ))}
    </div>
  );
}

function LeaderboardRow({ row, rank, top }) {
  const pct = Math.round((row.reps / top) * 100);
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;

  return (
    <div
      className={cn(
        'relative flex items-center gap-3 px-4 py-3 rounded-xl border transition-all',
        row.isSelf
          ? 'border-primary/30 bg-primary/6'
          : 'border-border/50 bg-card/60',
      )}
    >
      {/* Rank */}
      <span className="text-sm font-bold w-5 text-center text-muted-foreground/60 tabular-nums shrink-0">
        {medal ?? rank}
      </span>

      {/* Name + bar */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span
            className={cn(
              'text-sm font-semibold truncate',
              row.isSelf ? 'text-primary' : 'text-foreground',
            )}
          >
            {row.name}
            {row.isSelf && (
              <span className="ml-1.5 text-[10px] font-normal text-primary/60 uppercase tracking-wider">you</span>
            )}
          </span>
          <span className="text-sm font-bold tabular-nums text-foreground/80 ml-2 shrink-0">
            {row.reps}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 rounded-full bg-border/40 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              row.isSelf ? 'bg-primary' : 'bg-foreground/30',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
