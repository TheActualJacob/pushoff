/**
 * Lazy-loads TensorFlow.js and creates a MoveNet MultiPose Lightning detector.
 * All heavy imports are dynamic so SSR stays clean.
 */

let detector = null;
let loadPromise = null;

export async function getDetector() {
  if (detector) return detector;

  if (!loadPromise) {
    loadPromise = (async () => {
      const tf = await import('@tensorflow/tfjs-core');

      // Try WebGL first, fall back to WASM for devices without GPU support.
      try {
        await import('@tensorflow/tfjs-backend-webgl');
        await tf.setBackend('webgl');
      } catch {
        await import('@tensorflow/tfjs-backend-wasm');
        await tf.setBackend('wasm');
      }

      await tf.ready();

      const pd = await import('@tensorflow-models/pose-detection');
      detector = await pd.createDetector(pd.SupportedModels.MoveNet, {
        modelType: pd.movenet.modelType.MULTIPOSE_LIGHTNING,
        enableTracking: true,
        trackerType: pd.TrackerType.BoundingBox,
      });

      return detector;
    })();
  }

  return loadPromise;
}
