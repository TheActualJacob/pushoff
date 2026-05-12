'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { drawPoses } from '@/components/pose-overlay';

/**
 * CameraView — webcam feed with MoveNet pose overlay.
 *
 * Props:
 *   onPoses(keypoints)  — called each frame with the first detected pose's keypoints
 *   mirror              — flip horizontally for selfie feel (default true)
 *   showSkeleton        — draw keypoints + bones on canvas (default true)
 *   className           — extra CSS classes on the wrapper
 */
export default function CameraView({ onPoses, onStream, mirror = true, showSkeleton = true, className = '' }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const detectorRef = useRef(null);
  const onPosesRef = useRef(onPoses);
  const showSkeletonRef = useRef(showSkeleton);

  const [status, setStatus] = useState('idle');

  // FPS counter: computed at 1 Hz via ref + direct DOM write to avoid 30 React
  // renders/sec for the whole CameraView subtree just to show a number.
  const fpsDisplayRef = useRef(null);
  const fpsTimestamps = useRef([]);
  const lastFpsUpdateRef = useRef(0);

  // Keep refs in sync so the rAF loop doesn't stale-close over them
  useEffect(() => { onPosesRef.current = onPoses; }, [onPoses]);
  useEffect(() => { showSkeletonRef.current = showSkeleton; }, [showSkeleton]);

  const runLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const detector = detectorRef.current;
    if (!video || !canvas || !detector) return;

    async function frame() {
      if (video.readyState < 2) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      const vw = video.videoWidth;
      const vh = video.videoHeight;

      if (canvas.width !== vw || canvas.height !== vh) {
        canvas.width = vw;
        canvas.height = vh;
      }

      try {
        const poses = await detector.estimatePoses(video);

        // FPS: accumulate timestamps, but only write to DOM once per second.
        const now = performance.now();
        fpsTimestamps.current.push(now);
        fpsTimestamps.current = fpsTimestamps.current.filter((t) => now - t < 1000);
        if (now - lastFpsUpdateRef.current >= 1000) {
          lastFpsUpdateRef.current = now;
          if (fpsDisplayRef.current) {
            fpsDisplayRef.current.textContent = `${fpsTimestamps.current.length} fps`;
          }
        }

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, vw, vh);

        if (showSkeletonRef.current && poses.length > 0) {
          drawPoses(ctx, poses, 1, 1);
        }

        if (poses.length > 0) {
          onPosesRef.current?.(poses[0].keypoints);
        }
      } catch (err) {
        console.error('Pose detection error:', err);
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let active = true;

    async function init() {
      setStatus('loading');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        onStream?.(stream);

        const video = videoRef.current;
        video.srcObject = stream;
        await new Promise((resolve, reject) => {
          video.onloadedmetadata = resolve;
          video.onerror = reject;
        });
        await video.play();

        const { getDetector } = await import('@/lib/pose/detector');
        detectorRef.current = await getDetector();

        if (!active) return;
        setStatus('ready');
        runLoop();
      } catch (err) {
        if (!active) return;
        console.error('Camera/detector init failed:', err);
        setStatus('error');
      }
    }

    init();

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const video = videoRef.current;
      if (video?.srcObject) {
        video.srcObject.getTracks().forEach((t) => t.stop());
      }
      // Detector is a module singleton; dispose it so GPU textures aren't
      // accumulated across navigations.
      import('@/lib/pose/detector').then(({ disposeDetector }) => disposeDetector());
    };
  }, [runLoop]);

  const mirrorStyle = mirror ? { transform: 'scaleX(-1)' } : {};

  return (
    <div className={`relative rounded-xl overflow-hidden bg-black ${className}`}>
      <video
        ref={videoRef}
        playsInline
        muted
        className="w-full h-full object-cover"
        style={mirrorStyle}
      />

      {/* Pose overlay canvas — same transform so coordinates align */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ objectFit: 'cover', ...mirrorStyle }}
      />

      {/* FPS badge — written directly via ref at 1 Hz, no React re-render */}
      {status === 'ready' && (
        <div
          ref={fpsDisplayRef}
          className="absolute top-2 left-2 text-[11px] font-mono tabular-nums text-white/60 bg-black/50 px-2 py-0.5 rounded-full pointer-events-none select-none"
        >
          — fps
        </div>
      )}

      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
          <LoadingSpinner />
          <p className="text-sm text-white/70">Loading camera & AI model…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80">
          <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 10l4.553-2.069A1 1 0 0121 8.806V17a2 2 0 01-2 2H5a2 2 0 01-2-2V8.806a1 1 0 01.447-.875L8 10m7 0v4m0 0H9m6 0l3 3m-3-3l3-3" />
          </svg>
          <p className="text-sm text-red-400">Camera access denied</p>
          <p className="text-xs text-white/40">Allow camera permissions and reload</p>
        </div>
      )}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg className="w-8 h-8 animate-spin text-amber-400" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
