/**
 * Lazy-loads TensorFlow.js and creates a MoveNet SinglePose Thunder detector.
 * All heavy imports are dynamic so SSR stays clean.
 *
 * SinglePose Thunder is the correct choice here: higher accuracy than Lightning,
 * no person-detector overhead from MultiPose, and tracking is irrelevant since
 * keypoints never leave this device.
 */

let detector = null;
let loadPromise = null;

export async function getDetector() {
  if (detector) return detector;

  if (!loadPromise) {
    loadPromise = (async () => {
      const tf = await import('@tensorflow/tfjs-core');

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
        modelType: pd.movenet.modelType.SINGLEPOSE_THUNDER,
      });

      return detector;
    })().catch((err) => {
      // Clear cached promise so the next call retries rather than returning
      // the same rejection forever (e.g. if WebGL init throws transiently).
      loadPromise = null;
      throw err;
    });
  }

  return loadPromise;
}

export function disposeDetector() {
  if (detector) {
    try { detector.dispose(); } catch { /* ignore */ }
    detector = null;
  }
  loadPromise = null;
}
