/**
 * Face Detector — High-speed on-device face & visual PII detector.
 *
 * Combines:
 * 1. Pixel-level skin chrominance and facial geometry analysis via Vision Model Engine
 * 2. Visual scan of DOM elements (profile photos, user avatars, face-tagged elements, ID badges)
 * 3. Extracts exact client bounding boxes in page coordinate space for redaction overlay and canvas blurring.
 *
 * All inference and detection happens 100% locally on-device.
 */

import type { BoundingBox } from '../utils/types';
import { evaluateScreenState } from './vision-model';

export interface FaceDetection {
  bbox: BoundingBox;
  confidence: number;
  source: 'heuristic' | 'vision_model';
  domElement?: HTMLElement;
  isFixed?: boolean;
}

export function isElementFixedOrSticky(el: Element | null): boolean {
  let cur = el;
  while (cur && cur !== document.body && cur !== document.documentElement) {
    try {
      const style = window.getComputedStyle(cur);
      const pos = style.position;
      if (pos === 'fixed' || pos === 'sticky' || pos === '-webkit-sticky') return true;
    } catch {}
    cur = cur.parentElement;
  }
  return false;
}

/**
 * Detect faces, avatar regions, and visual ID photos on the current page.
 */
export async function detectFaces(screenCanvas?: HTMLCanvasElement): Promise<FaceDetection[]> {
  const results: FaceDetection[] = [];
  const GENERIC_PLACEHOLDER_REGEX = /default|placeholder|silhouette|anonymous|nobody|guest|generic|dummy|sample|empty|no-avatar|no-photo|no-image|avatar-default|default-avatar|default_avatar|user-silhouette|user-icon|user-placeholder|profile-placeholder|avatar_placeholder|icon-user|account-icon|auth\/user|icons\/user|\buser\.(?:png|svg|jpg|webp)|\bavatar\.(?:png|svg|jpg|webp)|\bdefault\.(?:png|svg|jpg|webp)/i;

  try {
    // ── 1. If screen canvas is provided, run on-device vision model on screen pixels ──
    if (screenCanvas) {
      try {
        const evalResult = await evaluateScreenState(screenCanvas, window.scrollX, window.scrollY);
        for (const reg of evalResult.sensitiveRegions) {
          if (reg.type === 'face') {
            // Validate against the DOM: Ensure the detected region is an actual user photo, not a placeholder silhouette
            const centerX = Math.round(reg.bbox.x - window.scrollX + reg.bbox.width / 2);
            const centerY = Math.round(reg.bbox.y - window.scrollY + reg.bbox.height / 2);
            if (centerX >= 0 && centerX <= window.innerWidth && centerY >= 0 && centerY <= window.innerHeight) {
              const elAtPoint = document.elementFromPoint(centerX, centerY);
              if (elAtPoint) {
                // If the element is an SVG, font icon, or contains placeholder icon classes, skip it!
                const isSvgOrIcon = !!elAtPoint.closest('svg, i, [role="img"]') || ['svg', 'path', 'i'].includes(elAtPoint.tagName.toLowerCase());
                const combinedInfo = `${elAtPoint.className || ''} ${elAtPoint.id || ''} ${elAtPoint.getAttribute('aria-label') || ''}`.toLowerCase();
                if (isSvgOrIcon || GENERIC_PLACEHOLDER_REGEX.test(combinedInfo)) {
                  continue;
                }
                const img = elAtPoint instanceof HTMLImageElement ? elAtPoint : elAtPoint.querySelector('img');
                if (img) {
                  const src = (img.src || '').toLowerCase();
                  const alt = (img.alt || '').toLowerCase();
                  const cls = (img.className || '').toLowerCase();
                  if (src.includes('.svg') || src.startsWith('data:image/svg') || GENERIC_PLACEHOLDER_REGEX.test(`${src} ${alt} ${cls}`)) {
                    continue; // Skip generic placeholder silhouette
                  }
                } else if (!elAtPoint.hasAttribute('data-pii-type')) {
                  // Check if there is a real background photo
                  const bg = window.getComputedStyle(elAtPoint).backgroundImage;
                  if (!bg || bg === 'none' || bg.includes('.svg')) {
                    continue; // Pure CSS vector/container, not a human photograph
                  }
                }
              }
            }

            results.push({
              bbox: reg.bbox,
              confidence: reg.confidence,
              source: 'vision_model',
            });
          }
        }
      } catch (visErr) {
        console.warn('[FaceDetector] Pixel vision model warning:', visErr);
      }
    }

    // ── 2. DOM Pattern 1: Elements with explicit avatar attributes or class names ──
    const photoElements = document.querySelectorAll<HTMLElement>(
      '[data-pii-type="face"], .profile-photo, .user-avatar, .avatar, [class*="avatar"], [class*="profile-img"], [class*="user-photo"], img[alt*="photo" i], img[alt*="avatar" i], img[alt*="profile" i], img[alt*="face" i], img[alt*="user" i]'
    );

    photoElements.forEach(el => {
      const isExplicitFace = el.getAttribute('data-pii-type') === 'face';

      // Skip pure SVG or font glyphs
      if (!isExplicitFace) {
        if (el.closest('svg, i') || ['SVG', 'PATH', 'I'].includes(el.tagName)) return;
        if (el.querySelector('svg') && !el.querySelector('img')) return;
      }

      let targetEl: HTMLElement = el;
      const childImg = el.querySelector<HTMLImageElement>('img');
      if (childImg) {
        targetEl = childImg;
      } else if (!isExplicitFace) {
        const isImage = ['IMG', 'PICTURE'].includes(el.tagName);
        if (!isImage) return;
      }

      // Check if target image is a generic default/placeholder avatar
      if (!isExplicitFace && targetEl instanceof HTMLImageElement) {
        const src = (targetEl.src || '').toLowerCase();
        const alt = (targetEl.alt || '').toLowerCase();
        const cls = (targetEl.className || '').toLowerCase();
        if (src.includes('.svg') || src.startsWith('data:image/svg') || GENERIC_PLACEHOLDER_REGEX.test(`${src} ${alt} ${cls}`)) {
          return; // Skip generic placeholder silhouette
        }
      }

      const rect = targetEl.getBoundingClientRect();
      if (rect.width < 16 || rect.height < 16) return; // Too small

      // Avatars and faces are roughly square (aspect ratio between 0.5 and 2.0).
      const aspect = rect.width / rect.height;
      if (aspect < 0.5 || aspect > 2.0) return;

      const bbox: BoundingBox = {
        x: Math.round(rect.left + window.scrollX),
        y: Math.round(rect.top + window.scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };

      // Deduplicate overlapping bboxes (avoid multiple boxes on the same avatar)
      const alreadyExists = results.some(r => {
        const xOverlap = Math.max(0, Math.min(r.bbox.x + r.bbox.width, bbox.x + bbox.width) - Math.max(r.bbox.x, bbox.x));
        const yOverlap = Math.max(0, Math.min(r.bbox.y + r.bbox.height, bbox.y + bbox.height) - Math.max(r.bbox.y, bbox.y));
        const overlapArea = xOverlap * yOverlap;
        const minArea = Math.min(r.bbox.width * r.bbox.height, bbox.width * bbox.height);
        return minArea > 0 && overlapArea / minArea > 0.4;
      });

      if (!alreadyExists) {
        results.push({
          bbox,
          confidence: 0.95,
          source: 'heuristic',
          domElement: targetEl,
          isFixed: isElementFixedOrSticky(targetEl),
        });
      }
    });

    // ── 3. DOM Pattern 2: Scan all visible images for personal photo signatures ──
    document.querySelectorAll<HTMLImageElement>('img').forEach(img => {
      const rect = img.getBoundingClientRect();
      if (rect.width < 24 || rect.height < 24) return; // Skip small icons

      const src = (img.src || '').toLowerCase();
      const alt = (img.alt || '').toLowerCase();
      const cls = (img.className || '').toLowerCase();
      const combined = `${src} ${alt} ${cls}`;

      // Skip generic placeholder silhouettes, vector SVGs, and default icons
      if (src.includes('.svg') || src.startsWith('data:image/svg') || GENERIC_PLACEHOLDER_REGEX.test(combined)) {
        return;
      }

      if (/avatar|profile|portrait|author|selfie|passport|headshot|person|user/.test(combined)) {
        const aspect = rect.width / rect.height;
        if (aspect < 0.5 || aspect > 2.0) return;

        const bbox: BoundingBox = {
          x: Math.round(rect.left + window.scrollX),
          y: Math.round(rect.top + window.scrollY),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };

        const alreadyExists = results.some(r => {
          const xOverlap = Math.max(0, Math.min(r.bbox.x + r.bbox.width, bbox.x + bbox.width) - Math.max(r.bbox.x, bbox.x));
          const yOverlap = Math.max(0, Math.min(r.bbox.y + r.bbox.height, bbox.y + bbox.height) - Math.max(r.bbox.y, bbox.y));
          const overlapArea = xOverlap * yOverlap;
          const minArea = Math.min(r.bbox.width * r.bbox.height, bbox.width * bbox.height);
          return minArea > 0 && overlapArea / minArea > 0.4;
        });

        if (!alreadyExists) {
          results.push({
            bbox,
            confidence: 0.90,
            source: 'heuristic',
            domElement: img,
            isFixed: isElementFixedOrSticky(img),
          });
        }
      }
    });
  } catch (err) {
    console.warn('[FaceDetector] Face detection warning:', err);
  }

  return results;
}

/** Detect <img> elements that likely contain personal or sensitive identification */
export function detectSensitiveImages(): Array<{ el: HTMLImageElement; bbox: BoundingBox }> {
  const results: Array<{ el: HTMLImageElement; bbox: BoundingBox }> = [];
  try {
    document.querySelectorAll<HTMLImageElement>('img').forEach(img => {
      const rect = img.getBoundingClientRect();
      if (rect.width < 24 || rect.height < 24) return;
      const hint = `${img.src} ${img.alt} ${img.className}`.toLowerCase();
      if (/photo|avatar|profile|face|person|signature|id.card|aadhaar|pan|passport/.test(hint)) {
        results.push({
          el: img,
          bbox: {
            x: Math.round(rect.left + window.scrollX),
            y: Math.round(rect.top + window.scrollY),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        });
      }
    });
  } catch (err) {
    console.warn('[FaceDetector] Image scan warning:', err);
  }
  return results;
}
