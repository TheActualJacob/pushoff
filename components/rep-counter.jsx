'use client';

/**
 * RepCounter — large visual rep display with pose state indicator.
 *
 * Props:
 *   count        — integer rep count
 *   poseState    — 'UP' | 'DOWN'
 *   elbowAngle   — current elbow angle in degrees (null if unknown)
 *   bodyAligned  — boolean (null if gate disabled or confidence too low)
 */
export default function RepCounter({ count = 0, poseState = 'UP', elbowAngle = null, bodyAligned = null }) {
  const isDown = poseState === 'DOWN';

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      {/* Big number */}
      <div
        className="font-display tabular-nums leading-none transition-all duration-100"
        style={{
          fontSize: 'clamp(4rem, 20vw, 10rem)',
          color: isDown ? 'oklch(0.75 0.17 52)' : 'oklch(0.95 0.005 55)',
          textShadow: isDown ? '0 0 40px oklch(0.75 0.17 52 / 0.4)' : 'none',
        }}
      >
        {String(count).padStart(2, '0')}
      </div>

      {/* State pill */}
      <div
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold tracking-wider uppercase transition-all duration-150"
        style={{
          background: isDown
            ? 'oklch(0.75 0.17 52 / 0.15)'
            : 'oklch(0.95 0.005 55 / 0.08)',
          color: isDown ? 'oklch(0.75 0.17 52)' : 'oklch(0.65 0.005 55)',
          border: `1px solid ${isDown ? 'oklch(0.75 0.17 52 / 0.4)' : 'oklch(0.95 0.005 55 / 0.12)'}`,
        }}
      >
        <span
          className="w-2 h-2 rounded-full transition-all duration-150"
          style={{ background: isDown ? 'oklch(0.75 0.17 52)' : 'oklch(0.55 0.005 55)' }}
        />
        {isDown ? 'DOWN' : 'UP'}
      </div>

      {/* Debug info row */}
      {(elbowAngle !== null || bodyAligned !== null) && (
        <div className="flex gap-3 text-xs font-mono text-white/30">
          {elbowAngle !== null && (
            <span>{elbowAngle}° elbow</span>
          )}
          {bodyAligned !== null && (
            <span style={{ color: bodyAligned ? 'oklch(0.7 0.18 130 / 0.6)' : 'oklch(0.65 0.22 30 / 0.7)' }}>
              {bodyAligned ? '✓ aligned' : '⚠ align body'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
