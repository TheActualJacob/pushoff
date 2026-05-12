/**
 * Bundler-level stub for @mediapipe/pose.
 *
 * This app uses MoveNet — the MediaPipe Pose class is never instantiated.
 * The stub satisfies the static ESM import that @tensorflow-models/pose-detection
 * unconditionally includes in its bundle.
 *
 * Wired via turbopack.resolveAlias in next.config.mjs (no patch-package needed).
 */
export class Pose {}
export const POSE_CONNECTIONS = [];
export const POSE_LANDMARKS = {};
export const VERSION = '0.5';
