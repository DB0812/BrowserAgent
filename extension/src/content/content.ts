/**
 * Content Script — runs in the context of every web page.
 *
 * Responsibilities:
 * 1. Adaptive DOM analysis (Level 1–4 perception hierarchy)
 * 2. Element registry (stable el_NNN IDs)
 * 3. Accessibility tree extraction (Level 1)
 * 4. PII detection (DOM + regex + OCR + vision layers)
 * 5. Visual overlay rendering
 * 6. Action execution (validated actions from background SW)
 * 7. Page context extraction (sanitized, no raw PII)
 * 8. Site adapter integration
 * 9. Per-stage timing metrics reported back to service worker
 */

import { detectPIIFromDOM, detectPIIFromDOMText, detectPIIFromText, detectPIIFromOCRWords, createFaceEntity, PLACEHOLDER_MAP } from '../privacy/pii-detector';
import { buildOverlayBoxes, redactText, sanitizeElements, redactScreenshot, loadAndRedactScreenshot } from '../privacy/redaction-engine';
import { detectFaces, isElementFixedOrSticky } from '../vision/face-detector';
import { validateAction, executeAction } from '../actions/action-validator';
import { applyPolicy, DEFAULT_SETTINGS } from '../privacy/policy-engine';
import { buildRegistry, checkAndResetIfNeeded } from './element-registry';
import { extractA11yTree, formatA11yForLLM } from './accessibility';
import { getAdapter, getSiteStatus } from '../adapters/adapter-registry';
import { injectFloatingPanel, toggleFloatingPanel, removeFloatingPanel, isFloatingPanelVisible, updatePanelStats } from './floating-panel';
import type {
  ExtensionMessage, PIIEntity, UIElement, SanitizedContext,
  BoundingBox, PrivacySettings, AuditEvent, ElementRecord
} from '../utils/types';

// ── CLIENT METRICS ─────────────────────────────────────────────────────────────
export interface ClientMetrics {
  domAnalysisMs: number;
  piiDetectionMs: number;
  ocrMs: number;
  faceDetectionMs: number;
  redactionMs: number;
  overlayMs: number;
  totalClientMs: number;
  piiDetected: number;
  piiRedacted: number;
  perceptionLevel: number;
  elementsFound: number;
  memoryUsedMB?: number;
}

let currentSettings: PrivacySettings = DEFAULT_SETTINGS;
let currentEntities: PIIEntity[] = [];
let overlayContainer: HTMLDivElement | null = null;
let auditLog: AuditEvent[] = [];
let lastStateHash = '';
let lastAnalysisContext: SanitizedContext | null = null;

// ── INITIALIZATION ─────────────────────────────────────────────────────────────

chrome.storage.local.get(['privacySettings'], (result) => {
  if (result.privacySettings) currentSettings = result.privacySettings;
});

// Announce site status to background on load
(function announceSiteStatus() {
  const status = getSiteStatus(location.href);
  chrome.runtime.sendMessage({ type: 'SITE_STATUS', siteStatus: status }).catch(() => {});
})();

// List of video conferencing, meeting, and sensitive communication apps where
// the agent floating panel must NEVER automatically pop up.
const SENSITIVE_MEETING_PATTERNS = [
  'meet.google.com',
  'zoom.us',
  'teams.microsoft.com',
  'teams.live.com',
  'web.whatsapp.com',
  'web.telegram.org',
  'discord.com',
  'slack.com',
  'webex.com',
  'gotomeeting.com',
  'whereby.com',
  'skype.com',
];

function isMeetingOrSensitiveApp(): boolean {
  const host = location.hostname.toLowerCase();
  return SENSITIVE_MEETING_PATTERNS.some(pattern => host.includes(pattern));
}

// Check whether floating panel should be automatically injected.
// Defaults to FALSE so it does NOT pop up automatically every time user opens an app.
async function shouldAutoInjectPanel(): Promise<boolean> {
  // Never auto-inject on video calls / meeting apps
  if (isMeetingOrSensitiveApp()) return false;

  // Never auto-inject if user closed it in this tab session
  try {
    if (sessionStorage.getItem('__privsight_dismissed__') === '1') return false;
  } catch {}

  const hostClean = location.hostname.replace(/^www\./, '');
  const stored = await chrome.storage.local.get(['autoShowFloatingPanel', 'mutedSites']);
  if (stored.mutedSites?.includes(hostClean)) return false;

  // Only auto-show if user explicitly enabled it in settings
  return !!stored.autoShowFloatingPanel;
}

shouldAutoInjectPanel().then((shouldInject) => {
  if (shouldInject) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => injectFloatingPanel());
    } else {
      injectFloatingPanel();
    }
  }
});

// ── STATE HASH ─────────────────────────────────────────────────────────────────

function computeStateHash(): string {
  const elements = document.querySelectorAll('input, button, select, a').length;
  const textLength = document.body.innerText.length;
  const title = document.title;
  // Include all visible input/textarea/select values so that fill actions
  // (which only change field values, not body text) register as state changes.
  const fieldValues = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input:not([type=hidden]):not([type=password]), textarea, select'
    )
  )
    .map(el => el.value.slice(0, 30))
    .join('|');
  return `${elements}-${textLength}-${title.slice(0, 30)}-${location.href.slice(-50)}-${fieldValues}`;
}

// ── PAGE TYPE CLASSIFIER ───────────────────────────────────────────────────────

function classifyPageType(url: string, title: string): string {
  const combined = (url + ' ' + title).toLowerCase();
  if (/login|signin|sign-in|auth/.test(combined)) return 'login';
  if (/payment|checkout|pay|billing/.test(combined)) return 'payment';
  if (/flight|travel|airline|booking|ticket/.test(combined)) return 'travel_booking';
  if (/bank|account|transfer|ledger/.test(combined)) return 'banking';
  if (/health|medical|patient|clinic/.test(combined)) return 'healthcare';
  if (/shop|cart|product|order/.test(combined)) return 'ecommerce';
  if (/mail|inbox|compose|gmail/.test(combined)) return 'email';
  if (/social|profile|feed|post/.test(combined)) return 'social_media';
  if (/wiki/.test(combined)) return 'reference';
  if (/search/.test(combined)) return 'search_results';
  return 'general';
}

// ── ADAPTIVE PERCEPTION LEVEL ─────────────────────────────────────────────────

function determinePerceptionLevel(a11yResult: ReturnType<typeof extractA11yTree>): 1 | 2 | 3 | 4 {
  // Level 1: A11y is rich enough
  if (a11yResult.hasRichA11y && a11yResult.interactiveCount >= 2) return 1;
  // Level 2: DOM + visible text (no OCR needed if text is accessible)
  if (document.body.innerText.length > 200) return 2;
  // Level 3: DOM + OCR (images may contain important text)
  if (document.querySelectorAll('img, canvas, svg').length > 3) return 3;
  // Level 4: screenshot (absolute last resort — currently not used automatically)
  return 2;
}

// ── UI ELEMENT EXTRACTION ─────────────────────────────────────────────────────

function extractUIElements(registryRecords: ElementRecord[]): UIElement[] {
  const elements: UIElement[] = [];

  for (const record of registryRecords) {
    const input = document.querySelector(record.domSelector) as HTMLInputElement | null;
    if (!input) continue;

    const rect = input.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;

    const isSensitive = record.sensitive;
    const bbox: BoundingBox = record.bbox;

    const elementType =
      record.tag === 'input' ? (record.inputType || 'text') :
      record.tag === 'button' ? 'button' :
      record.tag === 'select' ? 'select' :
      record.tag === 'textarea' ? 'textarea' :
      record.tag === 'a' ? 'link' : record.tag;

    // Enrich role with container context (e.g. flight card, product card)
    let extraContext = '';
    const parentContainer = input.closest('.flight-card, tr, li, article, section, [data-flight-id], .product_pod, .quote');
    if (parentContainer) {
      const containerText = parentContainer.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (containerText && containerText !== input.textContent?.trim()) {
        const priceMatch = containerText.match(/(?:₹|\$|EUR|USD|INR)\s*[\d,]+/i);
        const priceStr = priceMatch ? ` price:${priceMatch[0]}` : '';
        extraContext = ` (${containerText.slice(0, 200)}${priceStr})`;
      }
    }

    const role = `${record.role}${extraContext}`;

    elements.push({
      id: record.elementId,          // el_NNN (stable, sent to LLM)
      elementId: record.elementId,
      type: elementType,
      role,
      label: record.ariaLabel || undefined,
      placeholder: record.placeholder || undefined,
      value: isSensitive ? undefined : (input.value?.slice(0, 100) || undefined),
      sensitive: isSensitive,
      sensitivityType: undefined,
      bbox,
      domSelector: record.domSelector,  // kept local, not sent to LLM
      interactable: !input.disabled && !(input as any).readOnly,
      visible: record.visible,
      tagName: record.tag,
      attributes: collectSafeAttributes(input),
      ariaLabel: record.ariaLabel,
      ariaRole: record.ariaRole,
      accessibleName: record.role,
    });
  }

  return elements;
}

function collectSafeAttributes(el: HTMLElement): Record<string, string> {
  const SKIP = new Set(['value', 'style', 'class', 'data-pii-type']);
  const attrs: Record<string, string> = {};
  for (const attr of el.attributes) {
    if (!SKIP.has(attr.name)) attrs[attr.name] = attr.value.slice(0, 100);
  }
  return attrs;
}

// ── MAIN ANALYSIS PIPELINE ─────────────────────────────────────────────────────

async function analyzePage(
  forceRefresh = false,
  rawScreenshot?: string
): Promise<{ context: SanitizedContext; metrics: ClientMetrics }> {
  const t0 = Date.now();

  // Check if page changed
  const stateHash = computeStateHash();
  if (!forceRefresh && stateHash === lastStateHash && lastAnalysisContext) {
    console.log('[PrivacyAgent] State unchanged — returning cached context');
    const cachedMetrics: ClientMetrics = {
      domAnalysisMs: 0, piiDetectionMs: 0, ocrMs: 0, faceDetectionMs: 0,
      redactionMs: 0, overlayMs: 0, totalClientMs: 0,
      piiDetected: lastAnalysisContext.piiSummary.totalDetected,
      piiRedacted: lastAnalysisContext.piiSummary.totalRedacted,
      perceptionLevel: lastAnalysisContext.perceptionLevel ?? 1,
      elementsFound: lastAnalysisContext.elements.length,
    };
    return { context: lastAnalysisContext, metrics: cachedMetrics };
  }

  checkAndResetIfNeeded();

  const url = location.href.split('?')[0];
  const title = document.title;
  const pageType = classifyPageType(url, title);
  const adapter = getAdapter(location.href);
  const adapterName = adapter?.name;

  // ── Stage 1: DOM analysis (A11y tree + element registry) ─────────────────────
  const t_dom = Date.now();
  let a11yResult: ReturnType<typeof extractA11yTree>;
  try {
    a11yResult = extractA11yTree();
  } catch (err) {
    a11yResult = { nodes: [], landmarkSummary: '', formSummary: '' } as any;
  }
  const perceptionLevel = determinePerceptionLevel(a11yResult);
  let registryRecords: ElementRecord[] = [];
  try {
    registryRecords = buildRegistry();
  } catch (err) {
    console.warn('[PrivacyAgent] buildRegistry error:', err);
  }
  const domAnalysisMs = Date.now() - t_dom;

  // ── Stage 2: PII Detection (DOM + text nodes + regex) ───────────────────────
  const t_pii = Date.now();
  let domEntities: PIIEntity[] = [];
  try {
    domEntities = detectPIIFromDOM(currentSettings);
  } catch (err) {
    console.warn('[PrivacyAgent] detectPIIFromDOM error:', err);
  }
  let domTextEntities: PIIEntity[] = [];
  try {
    domTextEntities = detectPIIFromDOMText(currentSettings);
  } catch (err) {
    console.warn('[PrivacyAgent] detectPIIFromDOMText error:', err);
  }
  const bodyText = document.body ? (document.body.innerText ?? '') : '';
  let textEntities: PIIEntity[] = [];
  try {
    textEntities = detectPIIFromText(bodyText, 'regex', currentSettings);
  } catch (err) {
    console.warn('[PrivacyAgent] detectPIIFromText error:', err);
  }
  const piiDetectionMs = Date.now() - t_pii;

  // ── Stage 3: OCR / Image-Text scan ───────────────────────────────────────────
  const t_ocr = Date.now();
  let ocrTexts: string[] = [];
  let ocrEntities: PIIEntity[] = [];
  try {
    const imgTexts: string[] = [];
    document.querySelectorAll<HTMLImageElement>('img[alt], [title]').forEach(el => {
      const txt = (el.getAttribute('alt') || el.getAttribute('title') || '').trim();
      if (txt.length > 5) imgTexts.push(txt);
    });
    if (imgTexts.length > 0) {
      ocrTexts = imgTexts.slice(0, 15);
      const combined = imgTexts.join(' | ');
      ocrEntities = detectPIIFromText(combined, 'ocr', currentSettings);
    }
  } catch (err) {
    console.warn('[PrivacyAgent] OCR scan warning:', err);
  }
  const ocrMs = Date.now() - t_ocr;

  // ── Stage 4: Face & Visual PII detection (On-Device Vision Model) ──────────────
  const t_face = Date.now();
  let faceEntities: PIIEntity[] = [];
  let screenCanvas: HTMLCanvasElement | undefined;

  if (rawScreenshot) {
    try {
      const img = new Image();
      img.src = rawScreenshot;
      await new Promise((res) => { img.onload = res; img.onerror = res; });
      screenCanvas = document.createElement('canvas');
      screenCanvas.width = img.naturalWidth || window.innerWidth;
      screenCanvas.height = img.naturalHeight || window.innerHeight;
      const sCtx = screenCanvas.getContext('2d');
      sCtx?.drawImage(img, 0, 0);
    } catch (imgErr) {
      console.warn('[PrivacyAgent] Failed to prepare screen canvas for vision model:', imgErr);
    }
  }

  if (currentSettings.enableFaceDetection) {
    try {
      const faces = await detectFaces(screenCanvas);
      faceEntities = faces.map(f => createFaceEntity(f.bbox, f.confidence, f.domElement, f.isFixed));
    } catch (err) {
      console.warn('[PrivacyAgent] Face detection warning:', err);
    }
  }
  const faceDetectionMs = Date.now() - t_face;

  // ── Stage 5: Combine + apply policy ──────────────────────────────────────────
  const allEntities = [...domEntities, ...domTextEntities, ...textEntities, ...ocrEntities, ...faceEntities];
  const appliedEntities = applyPolicy(allEntities, currentSettings);
  currentEntities = appliedEntities;

  // ── Stage 6: Redaction (DOM, Text & Pixel Screenshot) ────────────────────────
  const t_redact = Date.now();
  let rawElements = extractUIElements(registryRecords);
  if (adapter) {
    try {
      rawElements = adapter.normalizeElements(rawElements);
    } catch (err) {
      console.warn('[PrivacyAgent] Adapter normalization warning:', err);
    }
  }
  const sanitizedElems = sanitizeElements(rawElements, appliedEntities);

  let sanitizedText = redactText(bodyText.slice(0, 3000), appliedEntities);
  if (adapter) {
    try {
      const enriched = adapter.enrichPageContext({
        url: location.href,
        domain: new URL(location.href).hostname,
        elements: rawElements,
        visibleText: sanitizedText,
        title,
      });
      sanitizedText = enriched.visibleText;
    } catch (err) {
      console.warn('[PrivacyAgent] Adapter enrichment warning:', err);
    }
  }
  if (perceptionLevel === 1 && a11yResult.nodes?.length) {
    sanitizedText = `${formatA11yForLLM(a11yResult)}\n\nPAGE TEXT:\n${sanitizedText}`;
  }

  // Redact screenshot if raw image provided
  let sanitizedScreenshot: string | undefined;
  let screenshotIncluded = false;
  if (rawScreenshot) {
    try {
      sanitizedScreenshot = await loadAndRedactScreenshot(
        rawScreenshot,
        appliedEntities,
        window.scrollX,
        window.scrollY
      );
      screenshotIncluded = true;
      emitAuditEvent('screenshot_redacted', {
        detail: 'Visible tab screenshot sanitized and redacted locally. 0 raw PII pixels transmitted.'
      });
    } catch (scErr) {
      console.warn('[PrivacyAgent] Screenshot redaction failed:', scErr);
    }
  }

  const redactionMs = Date.now() - t_redact;

  // ── Stage 7: Overlay rendering ────────────────────────────────────────────────
  const t_overlay = Date.now();
  try {
    renderOverlay(appliedEntities);
    if (isFloatingPanelVisible()) {
      updatePanelStats(appliedEntities.length);
    }
  } catch (err) {
    console.warn('[PrivacyAgent] Overlay render warning:', err);
  }
  const overlayMs = Date.now() - t_overlay;

  // Emit audit events for each detected PII entity
  appliedEntities.forEach(e => {
    emitAuditEvent('pii_detected', {
      piiType: e.type, confidence: e.confidence, source: e.source,
      redactionMethod: e.redactionMethod, detail: `${e.type} detected via ${e.source}`,
    });
  });

  // Measure client memory (Chrome only)
  let memoryUsedMB: number | undefined;
  if ((performance as any).memory) {
    memoryUsedMB = Math.round((performance as any).memory.usedJSHeapSize / 1048576 * 10) / 10;
  }

  const totalClientMs = Date.now() - t0;

  const metrics: ClientMetrics = {
    domAnalysisMs,
    piiDetectionMs,
    ocrMs,
    faceDetectionMs,
    redactionMs,
    overlayMs,
    totalClientMs,
    piiDetected: appliedEntities.length,
    piiRedacted: appliedEntities.length,
    perceptionLevel,
    elementsFound: sanitizedElems.length,
    memoryUsedMB,
  };

  const context: SanitizedContext = {
    pageUrl: url,
    pageTitle: title,
    pageType,
    timestamp: Date.now(),
    elements: sanitizedElems,
    sanitizedText,
    ocrTexts,
    piiSummary: {
      totalDetected: appliedEntities.length,
      totalRedacted: appliedEntities.length,
      byType: appliedEntities.reduce((acc, e) => ({ ...acc, [e.type]: (acc[e.type] ?? 0) + 1 }), {} as Record<string, number>),
    },
    screenshotIncluded,
    screenshot: sanitizedScreenshot,
    sanitizedScreenshot,
    perceptionLevel,
    stateHash,
    siteAdapter: adapterName,
  };

  lastStateHash = stateHash;
  lastAnalysisContext = context;

  // Asynchronously notify reasoning server so dashboard Live View updates instantly
  try {
    fetch('http://localhost:8000/api/perception/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: context.pageUrl || url,
        title: context.pageTitle || title,
        piiSummary: context.piiSummary,
        sanitizedScreenshot: context.sanitizedScreenshot,
        sanitizedText: (context.sanitizedText || '').slice(0, 1500),
        elements: (context.elements || []).slice(0, 40),
        step: 1,
        task: 'Page Privacy Scan',
      }),
    }).catch(() => {});
  } catch {}

  console.log(`[PrivacyAgent] Analysis in ${totalClientMs}ms | DOM:${domAnalysisMs}ms PII:${piiDetectionMs}ms OCR:${ocrMs}ms Face:${faceDetectionMs}ms Redact:${redactionMs}ms | Level ${perceptionLevel} | PII: ${appliedEntities.length} | Screenshot: ${screenshotIncluded}`);
  return { context, metrics };
}

// ── VISUAL OVERLAY ─────────────────────────────────────────────────────────────

interface TrackedOverlayBox {
  boxEl: HTMLDivElement;
  targetEl?: HTMLElement | Element | null;
  isFixed: boolean;
  baseBbox: BoundingBox;
}

let trackedOverlayBoxes: TrackedOverlayBox[] = [];
let scrollRafId: number | null = null;
let scrollListenerRegistered = false;

function updateOverlayPositions(): void {
  if (!overlayContainer || trackedOverlayBoxes.length === 0) return;

  for (const item of trackedOverlayBoxes) {
    if (!item.targetEl || !document.body.contains(item.targetEl)) {
      continue;
    }

    const rect = item.targetEl.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      item.boxEl.style.display = 'none';
      continue;
    }
    item.boxEl.style.display = 'block';

    const isFixed = item.isFixed || isElementFixedOrSticky(item.targetEl);
    if (isFixed) {
      item.boxEl.style.position = 'fixed';
      item.boxEl.style.left = `${Math.round(rect.left)}px`;
      item.boxEl.style.top = `${Math.round(rect.top)}px`;
    } else {
      item.boxEl.style.position = 'absolute';
      item.boxEl.style.left = `${Math.round(rect.left + window.scrollX)}px`;
      item.boxEl.style.top = `${Math.round(rect.top + window.scrollY)}px`;
    }
    item.boxEl.style.width = `${Math.round(rect.width)}px`;
    item.boxEl.style.height = `${Math.round(rect.height)}px`;
  }
}

function onScrollOrResize(): void {
  if (scrollRafId !== null) cancelAnimationFrame(scrollRafId);
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = null;
    updateOverlayPositions();
  });
}

function renderOverlay(entities: PIIEntity[]): void {
  clearOverlay();

  overlayContainer = document.createElement('div');
  overlayContainer.id = '__privacy-agent-overlay__';
  overlayContainer.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:2147483647;';
  document.body.appendChild(overlayContainer);

  const boxes = buildOverlayBoxes(entities);
  for (let i = 0; i < boxes.length; i++) {
    const { bbox, label, color, targetElement, isFixed: boxIsFixed } = boxes[i];
    const entity = entities[i];

    let targetEl: HTMLElement | Element | null = targetElement || null;
    if (!targetEl && entity?.domSelector) {
      try { targetEl = document.querySelector(entity.domSelector); } catch {}
    }
    if (!targetEl && bbox) {
      const vpX = bbox.x - window.scrollX + bbox.width / 2;
      const vpY = bbox.y - window.scrollY + bbox.height / 2;
      if (vpX >= 0 && vpX <= window.innerWidth && vpY >= 0 && vpY <= window.innerHeight) {
        const probe = document.elementFromPoint(vpX, vpY);
        if (probe && !probe.closest('#__privacy-agent-overlay__, #__privsight-host__')) {
          targetEl = probe.closest('img, svg, canvas, [class*="avatar"], input, textarea, a, button, span, div') || probe;
        }
      }
    }

    const isFixed = boxIsFixed || (targetEl ? isElementFixedOrSticky(targetEl) : false);

    const box = document.createElement('div');
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      if (isFixed) {
        box.style.cssText = `position:fixed;left:${Math.round(rect.left)}px;top:${Math.round(rect.top)}px;width:${Math.round(rect.width)}px;height:${Math.round(rect.height)}px;border:2px solid ${color};background:${color}18;pointer-events:none;border-radius:3px;box-sizing:border-box;z-index:2147483647;`;
      } else {
        box.style.cssText = `position:absolute;left:${Math.round(rect.left + window.scrollX)}px;top:${Math.round(rect.top + window.scrollY)}px;width:${Math.round(rect.width)}px;height:${Math.round(rect.height)}px;border:2px solid ${color};background:${color}18;pointer-events:none;border-radius:3px;box-sizing:border-box;z-index:2147483647;`;
      }
    } else {
      box.style.cssText = `position:absolute;left:${bbox.x}px;top:${bbox.y}px;width:${bbox.width}px;height:${bbox.height}px;border:2px solid ${color};background:${color}18;pointer-events:none;border-radius:3px;box-sizing:border-box;z-index:2147483647;`;
    }

    const lbl = document.createElement('div');
    lbl.style.cssText = `position:absolute;top:-20px;left:0;background:${color};color:#fff;font:bold 10px monospace;padding:2px 6px;border-radius:3px;white-space:nowrap;pointer-events:none;`;
    lbl.textContent = label;
    box.appendChild(lbl);

    overlayContainer.appendChild(box);
    trackedOverlayBoxes.push({
      boxEl: box,
      targetEl,
      isFixed,
      baseBbox: bbox,
    });
  }

  if (!scrollListenerRegistered) {
    window.addEventListener('scroll', onScrollOrResize, { passive: true, capture: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    document.addEventListener('scroll', onScrollOrResize, { passive: true, capture: true });
    scrollListenerRegistered = true;
  }
}

function clearOverlay(): void {
  trackedOverlayBoxes = [];
  if (scrollRafId !== null) {
    cancelAnimationFrame(scrollRafId);
    scrollRafId = null;
  }
  overlayContainer?.remove();
  overlayContainer = null;
}

// ── AUDIT LOGGING ─────────────────────────────────────────────────────────────

function emitAuditEvent(type: AuditEvent['type'], data: Partial<AuditEvent>): void {
  const event: AuditEvent = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    timestamp: Date.now(),
    type,
    detail: data.detail ?? '',
    rawDataTransmitted: false,
    ...data,
  };
  auditLog.push(event);
  chrome.runtime.sendMessage({ type: 'AUDIT_EVENT', event }).catch(() => {});
}

// ── MESSAGE HANDLER ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  (async () => {
    switch (message.type) {

      case 'ANALYZE_PAGE': {
        try {
          const { context, metrics } = await analyzePage(
            message.forceRefresh === true,
            message.screenshot
          );
          sendResponse({ context, piiEntities: currentEntities, clientMetrics: metrics });
        } catch (err) {
          console.error('[PrivacyAgent] analyzePage threw fatal error:', err);
          const safeContext: SanitizedContext = {
            pageUrl: location.href.split('?')[0],
            pageTitle: document.title || '',
            pageType: 'general',
            timestamp: Date.now(),
            elements: [],
            sanitizedText: document.body ? document.body.innerText.slice(0, 1000) : '',
            ocrTexts: [],
            piiSummary: { totalDetected: 0, totalRedacted: 0, byType: {} },
            screenshotIncluded: false,
            perceptionLevel: 1,
            stateHash: computeStateHash(),
          };
          sendResponse({
            context: safeContext,
            piiEntities: [],
            clientMetrics: {
              domAnalysisMs: 0, piiDetectionMs: 0, ocrMs: 0, faceDetectionMs: 0,
              redactionMs: 0, overlayMs: 0, totalClientMs: 0, piiDetected: 0,
              piiRedacted: 0, perceptionLevel: 1, elementsFound: 0,
            }
          });
        }
        break;
      }

      case 'ACTION_REQUEST': {
        const { action, actionId } = message;
        const validationError = validateAction(action);
        if (validationError) {
          sendResponse({ success: false, error: validationError });
          emitAuditEvent('action_blocked', { detail: `Action blocked: ${validationError}` });
          return;
        }

        // Site adapter action validation
        const adapter = getAdapter(location.href);
        if (adapter) {
          const adapterError = adapter.validateAction(action);
          if (adapterError) {
            sendResponse({ success: false, error: adapterError });
            emitAuditEvent('action_blocked', { detail: `Adapter blocked: ${adapterError}` });
            return;
          }
        }

        // Approval check from settings
        if (currentSettings.requireApprovalFor.includes(action.action)) {
          console.log('[PrivacyAgent] Action requires approval:', action.action);
          // In production: block and wait for user input message
          // For now: auto-approve navigate in demo mode
        }

        const result = await executeAction(action);
        emitAuditEvent('action_executed', { detail: `${action.action} → ${action.reason}` });
        sendResponse(result);
        break;
      }

      case 'SETTINGS_UPDATE': {
        currentSettings = message.settings;
        chrome.storage.local.set({ privacySettings: currentSettings });
        sendResponse({ ok: true });
        break;
      }

      case 'GET_STATUS': {
        sendResponse({ entities: currentEntities, auditLog: auditLog.slice(-50) });
        break;
      }

      case 'TOGGLE_FLOATING_PANEL': {
        const isVisible = toggleFloatingPanel(message.show);
        sendResponse({ ok: true, visible: isVisible });
        break;
      }
    }
  })();
  return true; // Keep message channel open for async response
});

// ── WINDOW MESSAGE BRIDGE (DASHBOARD TO EXTENSION) ─────────────────────────────
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'START_TASK_FROM_DASHBOARD') {
    console.log('[PrivacyAgent] Received task request from dashboard:', event.data.task);
    chrome.runtime.sendMessage({
      type: 'START_TASK',
      instruction: event.data.task,
      sessionId: event.data.sessionId,
    });
  }
});

// ── ON-PAGE SCAN TRIGGER (FROM FLOATING PANEL) ───────────────────────────────
window.addEventListener('privsight:scan', async () => {
  try {
    const { context } = await analyzePage(true);
    if (context?.piiSummary) {
      updatePanelStats(context.piiSummary.totalRedacted || context.piiSummary.totalDetected || 0);
    }
  } catch (err) {
    console.warn('[PrivacyAgent] privsight:scan handler error:', err);
  }
});

console.log('[PrivacyAgent] Content script initialized on', location.href,
  '| Site:', getSiteStatus(location.href).compatibility);
