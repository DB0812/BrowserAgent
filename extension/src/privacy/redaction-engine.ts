/**
 * Redaction Engine — applies redaction to text, canvas regions, and DOM context
 */
import type { PIIEntity, UIElement, BoundingBox } from '../utils/types';

const SENSITIVITY_COLORS: Record<string, string> = {
  CRITICAL: '#dc2626', HIGH: '#f57c00', MEDIUM: '#ca8a04', LOW: '#2563eb',
};

export interface OverlayBox {
  bbox: BoundingBox;
  label: string;
  color: string;
}

/** Replace raw PII values in text with semantic placeholders */
export function redactText(text: string, entities: PIIEntity[]): string {
  let redacted = text;
  const sorted = [...entities].filter(e => e.rawValue).sort((a, b) => (b.rawValue?.length ?? 0) - (a.rawValue?.length ?? 0));
  for (const entity of sorted) {
    if (!entity.rawValue) continue;
    const escaped = entity.rawValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      redacted = redacted.replace(new RegExp(escaped, 'gi'), entity.placeholder);
    } catch {
      redacted = redacted.split(entity.rawValue).join(entity.placeholder);
    }
  }
  return redacted;
}

/** Generate overlay boxes for visual display */
export function buildOverlayBoxes(entities: PIIEntity[]): OverlayBox[] {
  return entities.filter(e => e.bbox).map(e => ({
    bbox: e.bbox!,
    label: `${e.type.toUpperCase()} (${Math.round(e.confidence * 100)}%)`,
    color: SENSITIVITY_COLORS[e.sensitivity] ?? '#6b7280',
  }));
}

/** Apply box blur to a canvas region (for face/visual PII blurring) */
export function blurCanvasRegion(ctx: CanvasRenderingContext2D, bbox: BoundingBox, radius = 20): void {
  const { x, y, width, height } = bbox;
  if (width <= 0 || height <= 0) return;
  const imageData = ctx.getImageData(x, y, width, height);
  const blurredArr = boxBlur(imageData.data, width, height, Math.min(radius, Math.floor(Math.min(width, height) / 2)));
  const blurredClamped = new Uint8ClampedArray(blurredArr);
  ctx.putImageData(new ImageData(blurredClamped, width, height), x, y);
  ctx.fillStyle = 'rgba(220,38,38,0.75)';
  ctx.fillRect(x, y, width, 22);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px monospace';
  ctx.fillText('[REDACTED]', x + 4, y + 15);
}

/** Redact all PII regions on a canvas screenshot and return base64 dataURL */
export function redactScreenshot(canvas: HTMLCanvasElement, entities: PIIEntity[], scrollX: number, scrollY: number): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.toDataURL();
  for (const entity of entities) {
    if (!entity.bbox) continue;
    const bbox: BoundingBox = { x: entity.bbox.x - scrollX, y: entity.bbox.y - scrollY, width: entity.bbox.width, height: entity.bbox.height };
    if (entity.redactionMethod === 'blur' || entity.type === 'face') {
      blurCanvasRegion(ctx, bbox, 25);
    } else {
      ctx.fillStyle = SENSITIVITY_COLORS[entity.sensitivity] ?? '#6b7280';
      ctx.fillRect(bbox.x, bbox.y, bbox.width, bbox.height);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px monospace';
      const tw = ctx.measureText(entity.placeholder).width;
      ctx.fillText(entity.placeholder, bbox.x + Math.max(0, (bbox.width - tw) / 2), bbox.y + bbox.height / 2 + 4);
    }
  }
  return canvas.toDataURL('image/webp', 0.8);
}

/** Strip sensitive values from UIElements before server transmission */
export function sanitizeElements(elements: UIElement[], entities: PIIEntity[]): UIElement[] {
  const sensitiveSelectors = new Set(entities.map(e => e.domSelector).filter(Boolean));
  return elements.map(el => {
    if (!el.sensitive && !sensitiveSelectors.has(el.domSelector)) return el;
    const entity = entities.find(e => e.domSelector === el.domSelector);
    return { ...el, value: undefined, attributes: sanitizeAttributes(el.attributes), placeholder: entity?.placeholder ?? `[${el.type.toUpperCase()} REDACTED]` };
  });
}

function sanitizeAttributes(attrs: Record<string, string>): Record<string, string> {
  const SKIP = new Set(['value', 'data-value', 'data-token', 'data-key']);
  return Object.fromEntries(Object.entries(attrs).filter(([k]) => !SKIP.has(k.toLowerCase())));
}

function boxBlur(srcData: Uint8ClampedArray, w: number, h: number, r: number): number[] {
  const out: number[] = new Array(srcData.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rs = 0, gs = 0, bs = 0, n = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = Math.min(w-1, Math.max(0, x+dx)), ny = Math.min(h-1, Math.max(0, y+dy));
          const i = (ny*w+nx)*4; rs += srcData[i]; gs += srcData[i+1]; bs += srcData[i+2]; n++;
        }
      }
      const i = (y*w+x)*4;
      out[i]=rs/n; out[i+1]=gs/n; out[i+2]=bs/n; out[i+3]=srcData[i+3];
    }
  }
  return out;
}
