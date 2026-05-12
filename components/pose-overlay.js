/**
 * Canvas drawing utilities for MoveNet pose keypoints and skeleton.
 * Pure JS — no React. Safe to import in client components.
 */

// MoveNet skeleton edges [from, to] by keypoint index
const SKELETON_EDGES = [
  // Face
  [0, 1], [0, 2], [1, 3], [2, 4],
  // Shoulders
  [5, 6],
  // Left arm
  [5, 7], [7, 9],
  // Right arm
  [6, 8], [8, 10],
  // Torso
  [5, 11], [6, 12], [11, 12],
  // Left leg
  [11, 13], [13, 15],
  // Right leg
  [12, 14], [14, 16],
];

const MIN_SCORE = 0.35;

/**
 * Draw all poses onto a canvas context.
 * Keypoints are in the video's intrinsic coordinate space;
 * scaleX/scaleY map them to canvas display dimensions.
 */
export function drawPoses(ctx, poses, scaleX = 1, scaleY = 1) {
  for (const pose of poses) {
    drawSkeleton(ctx, pose.keypoints, scaleX, scaleY);
    drawKeypoints(ctx, pose.keypoints, scaleX, scaleY);
  }
}

function drawKeypoints(ctx, keypoints, scaleX, scaleY) {
  for (const kp of keypoints) {
    if (kp.score < MIN_SCORE) continue;

    const x = kp.x * scaleX;
    const y = kp.y * scaleY;
    const r = 4 + kp.score * 3; // slightly bigger for high-confidence joints

    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = `oklch(0.88 0.28 130 / ${0.5 + kp.score * 0.5})`; // lime-green
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawSkeleton(ctx, keypoints, scaleX, scaleY) {
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';

  for (const [i, j] of SKELETON_EDGES) {
    const a = keypoints[i];
    const b = keypoints[j];
    if (!a || !b || a.score < MIN_SCORE || b.score < MIN_SCORE) continue;

    const confidence = (a.score + b.score) / 2;
    ctx.strokeStyle = `oklch(0.78 0.19 52 / ${0.35 + confidence * 0.55})`; // amber

    ctx.beginPath();
    ctx.moveTo(a.x * scaleX, a.y * scaleY);
    ctx.lineTo(b.x * scaleX, b.y * scaleY);
    ctx.stroke();
  }
}
