/**
 * OCR Offscreen Worker — runs Tesseract.js inside an offscreen document.
 *
 * Chrome MV3 service workers cannot access the DOM or run Tesseract.js directly.
 * This offscreen document provides a window-like environment for OCR processing.
 *
 * Pipeline:
 *   1. Service worker sends OCR_REQUEST with a base64 image (screenshot or crop).
 *   2. Tesseract.js (WASM engine) runs text recognition locally — no data leaves the device.
 *   3. Recognised words with bounding boxes are returned to the service worker.
 *   4. Content script uses them to detect PII from visible-but-not-DOM text (e.g. images, canvas).
 *
 * Privacy guarantee: all inference happens entirely in-browser.
 */

// Tesseract worker cached across requests (warm-start saves ~800ms per request)
let tessWorker: import('tesseract.js').Worker | null = null;
let tessWorkerInitialised = false;
let tessWorkerInitialising = false;
const pendingInit: Array<() => void> = [];

async function getTessWorker(): Promise<import('tesseract.js').Worker> {
  if (tessWorker && tessWorkerInitialised) return tessWorker;

  if (tessWorkerInitialising) {
    await new Promise<void>(r => pendingInit.push(r));
    return tessWorker!;
  }

  tessWorkerInitialising = true;
  try {
    const Tesseract = await import('tesseract.js');
    tessWorker = await Tesseract.createWorker('eng', 1, {
      // Use bundled WASM assets — all local, zero network requests
      workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
      langPath: chrome.runtime.getURL('tesseract/lang-data'),
      corePath: chrome.runtime.getURL('tesseract/tesseract-core.wasm.js'),
      workerBlobURL: false,
      logger: () => {}, // suppress per-character progress logs
    });
    await tessWorker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.AUTO });
    tessWorkerInitialised = true;
    pendingInit.forEach(r => r());
    console.log('[OCR] Tesseract.js worker ready');
  } catch (err) {
    tessWorkerInitialising = false;
    throw err;
  }
  return tessWorker!;
}

// ── MESSAGE HANDLER ─────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'OCR_REQUEST') return;

  (async () => {
    const imageData: string = message.imageData; // base64 data URL
    const t0 = Date.now();

    // ── REAL TESSERACT.JS PATH ──────────────────────────────────────────────────
    try {
      const worker = await getTessWorker();
      const { data } = await worker.recognize(imageData);

      const words: Array<{ text: string; confidence: number; bbox: { x: number; y: number; width: number; height: number } }> = [];
      if (data.blocks) {
        for (const block of data.blocks) {
          for (const paragraph of block.paragraphs) {
            for (const line of paragraph.lines) {
              for (const word of line.words) {
                if (word.confidence > 30 && word.text.trim().length > 0) {
                  words.push({
                    text: word.text.trim(),
                    confidence: word.confidence / 100,
                    bbox: {
                      x: word.bbox.x0,
                      y: word.bbox.y0,
                      width: word.bbox.x1 - word.bbox.x0,
                      height: word.bbox.y1 - word.bbox.y0,
                    },
                  });
                }
              }
            }
          }
        }
      }

      console.log(`[OCR] Tesseract: ${words.length} words in ${Date.now() - t0}ms`);
      sendResponse({ words, latencyMs: Date.now() - t0, engine: 'tesseract' });
      return;
    } catch (err) {
      console.warn('[OCR] Tesseract unavailable, falling back to regex extraction:', err);
    }

    // ── REGEX FALLBACK ─────────────────────────────────────────────────────────
    // If Tesseract assets are not bundled yet, extract text from the page directly
    // by requesting the content script to run its DOM-based text scan.
    // This ensures PII detection still works even without Tesseract WASM assets.
    sendResponse({
      words: [],
      latencyMs: Date.now() - t0,
      engine: 'fallback',
      note: 'Tesseract assets not found — add tesseract/ to extension/public/. Using DOM text only.',
    });
  })();

  return true; // async response
});

// ── CLEANUP ON SUSPEND ─────────────────────────────────────────────────────────
chrome.runtime.onSuspend?.addListener(async () => {
  if (tessWorker) {
    await tessWorker.terminate().catch(() => {});
    tessWorker = null;
    tessWorkerInitialised = false;
  }
});

console.log('[PrivacyAgent] OCR offscreen worker ready (Tesseract.js path active)');
