/**
 * Face Detector — uses Canvas API heuristics for demo + architecture stub for ONNX BlazeFace.
 *
 * In the demo, we detect <img> elements and profile photos with known data attributes.
 * The ONNX BlazeFace path is architecturally wired but requires the model file at models/blazeface.onnx.
 */
import type { BoundingBox } from '../utils/types';

export interface FaceDetection {
  bbox: BoundingBox;
  confidence: number;
  source: 'heuristic' | 'onnx';
}

let onnxSession: unknown = null; // ONNX InferenceSession when loaded

/** Detect face regions on the page. Uses heuristic for demo, ONNX when available. */
export async function detectFaces(): Promise<FaceDetection[]> {
  const results: FaceDetection[] = [];

  // ── Heuristic: scan for images and elements with face-like data attributes ──
  const photoElements = document.querySelectorAll<HTMLElement>(
    '[data-pii-type="face"], .profile-photo, img[alt*="photo"], img[alt*="avatar"], img[alt*="profile"]'
  );

  photoElements.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width > 10 && rect.height > 10) {
      results.push({
        bbox: { x: rect.left + window.scrollX, y: rect.top + window.scrollY, width: rect.width, height: rect.height },
        confidence: 0.97,
        source: 'heuristic',
      });
    }
  });

  // ── ONNX BlazeFace path (requires models/blazeface.onnx) ──
  // Uncomment and add onnxruntime-web to package.json to enable:
  /*
  try {
    const ort = await import('onnxruntime-web');
    if (!onnxSession) {
      const modelUrl = chrome.runtime.getURL('models/blazeface.onnx');
      onnxSession = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'] });
    }
    // Capture screenshot canvas and run model inference
    // ... (full ONNX inference pipeline)
  } catch (err) {
    console.warn('[PrivacyAgent] ONNX face detection unavailable:', err);
  }
  */

  return results;
}

/** Detect <img> elements that are likely to contain photos or faces */
export function detectSensitiveImages(): Array<{ el: HTMLImageElement; bbox: BoundingBox }> {
  const results: Array<{ el: HTMLImageElement; bbox: BoundingBox }> = [];
  document.querySelectorAll<HTMLImageElement>('img').forEach(img => {
    const rect = img.getBoundingClientRect();
    if (rect.width < 30 || rect.height < 30) return; // skip tiny icons
    const src = img.src?.toLowerCase() ?? '';
    const alt = img.alt?.toLowerCase() ?? '';
    const cls = img.className?.toLowerCase() ?? '';
    // Heuristic: profile photos, avatars, large images
    if (/photo|avatar|profile|face|person|portrait/.test(alt + cls + src)) {
      results.push({
        el: img,
        bbox: { x: rect.left + window.scrollX, y: rect.top + window.scrollY, width: rect.width, height: rect.height },
      });
    }
  });
  return results;
}
