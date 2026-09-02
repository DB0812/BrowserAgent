/**
 * Content Script — runs in the context of every web page.
 *
 * Responsibilities:
 * 1. DOM analysis and element classification
 * 2. PII detection (DOM layer)
 * 3. Visual overlay rendering
 * 4. Action execution (validated actions from background SW)
 * 5. Page context extraction for server
 */

import { detectPIIFromDOM, detectPIIFromText, createFaceEntity, PLACEHOLDER_MAP } from '../privacy/pii-detector';
import { buildOverlayBoxes, redactText, sanitizeElements } from '../privacy/redaction-engine';
import { detectFaces } from '../vision/face-detector';
import { validateAction, executeAction } from '../actions/action-validator';
import { applyPolicy, DEFAULT_SETTINGS } from '../privacy/policy-engine';
import type {
  ExtensionMessage, PIIEntity, UIElement, SanitizedContext,
  BoundingBox, PrivacySettings, AuditEvent
} from '../utils/types';

let currentSettings: PrivacySettings = DEFAULT_SETTINGS;
let currentEntities: PIIEntity[] = [];
let overlayContainer: HTMLDivElement | null = null;
let auditLog: AuditEvent[] = [];

// ── INITIALIZATION ─────────────────────────────────────────────────────────────

chrome.storage.local.get(['privacySettings'], (result) => {
  if (result.privacySettings) currentSettings = result.privacySettings;
});

// ── DOM ANALYZER ───────────────────────────────────────────────────────────────

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
  return 'general';
}

function extractUIElements(): UIElement[] {
  const elements: UIElement[] = [];
  const seen = new Set<string>();

  const selectors = 'input, button, select, textarea, a[href], [role="button"], [role="link"]';
  document.querySelectorAll<HTMLElement>(selectors).forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const tag = el.tagName.toLowerCase();
    const input = el as HTMLInputElement;
    const id = el.id || `el-${i}`;
    const selector = el.id ? `#${CSS.escape(el.id)}` : buildSelector(el);

    if (seen.has(selector)) return;
    seen.add(selector);

    // Find associated label
    let labelText = '';
    if (el.id) {
      const lbl = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) labelText = lbl.textContent?.trim() ?? '';
    }
    if (!labelText) {
      const parent = el.closest('div, p, td, li');
      if (parent) {
        const lbl = parent.querySelector('label');
        if (lbl) labelText = lbl.textContent?.trim() ?? '';
      }
    }

    const piiType = el.getAttribute('data-pii-type');
    const isSensitive = !!(
      piiType ||
      input.type === 'password' ||
      input.type === 'hidden' ||
      input.autocomplete?.includes('cc-') ||
      input.autocomplete === 'email' ||
      input.autocomplete === 'tel'
    );

    const bbox: BoundingBox = {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    };

    const elementType =
      tag === 'input' ? (input.type || 'text') :
      tag === 'button' ? 'button' :
      tag === 'select' ? 'select' :
      tag === 'textarea' ? 'textarea' :
      tag === 'a' ? 'link' : tag;

    // Enriched role: if element is inside a container (e.g. flight card, table row), append container text + price
    let extraContext = '';
    const parentContainer = el.closest('.flight-card, tr, li, article, section, [data-flight-id]');
    if (parentContainer) {
      const containerText = parentContainer.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (containerText && containerText !== el.textContent?.trim()) {
        // Extract price match if present so price is NEVER cut off by string slicing
        const priceMatch = containerText.match(/(?:₹|\$|EUR|USD|INR)\s*[\d,]+/i);
        const priceStr = priceMatch ? ` price:${priceMatch[0]}` : '';
        extraContext = ` (${containerText.slice(0, 200)}${priceStr})`;
      }
    }

    const baseRole = el.getAttribute('data-role') ||
      el.getAttribute('aria-label') ||
      el.getAttribute('name') ||
      labelText ||
      el.textContent?.trim().slice(0, 40) ||
      id;

    const role = `${baseRole}${extraContext}`;

    elements.push({
      id,
      type: elementType,
      role: role,
      label: labelText || undefined,
      placeholder: input.placeholder || undefined,
      value: isSensitive ? undefined : (input.value?.slice(0, 100) || undefined),
      sensitive: isSensitive,
      sensitivityType: piiType as any || undefined,
      bbox,
      domSelector: selector,
      interactable: !input.disabled && !input.readOnly,
      visible: rect.width > 0 && rect.height > 0,
      tagName: tag,
      attributes: collectSafeAttributes(el),
    });
  });

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

function buildSelector(el: HTMLElement): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const tag = el.tagName.toLowerCase();
  const cls = Array.from(el.classList).slice(0, 2).map(c => `.${CSS.escape(c)}`).join('');
  return `${tag}${cls}`;
}

// ── MAIN ANALYSIS PIPELINE ─────────────────────────────────────────────────────

async function analyzePage(): Promise<SanitizedContext> {
  const t0 = Date.now();
  const url = location.href.split('?')[0]; // strip query params
  const title = document.title;
  const pageType = classifyPageType(url, title);

  // Layer 1: DOM PII detection
  const domEntities = detectPIIFromDOM(currentSettings);

  // Layer 2: Text content regex scan
  const bodyText = document.body.innerText ?? '';
  const textEntities = detectPIIFromText(bodyText, 'regex', currentSettings);

  // Layer 3: Visual face detection
  let faceEntities: PIIEntity[] = [];
  if (currentSettings.enableFaceDetection) {
    const faces = await detectFaces();
    faceEntities = faces.map(f => createFaceEntity(f.bbox, f.confidence));
  }

  // Combine all detections
  const allEntities = [...domEntities, ...textEntities, ...faceEntities];
  const appliedEntities = applyPolicy(allEntities, currentSettings);
  currentEntities = appliedEntities;

  // Build UI elements
  const rawElements = extractUIElements();
  const sanitizedElems = sanitizeElements(rawElements, appliedEntities);

  // Sanitize page text
  const sanitizedText = redactText(bodyText.slice(0, 3000), appliedEntities);

  // Build overlay for visual demo
  renderOverlay(appliedEntities);

  // Emit audit events
  appliedEntities.forEach(e => {
    emitAuditEvent('pii_detected', {
      piiType: e.type, confidence: e.confidence, source: e.source,
      redactionMethod: e.redactionMethod, detail: `${e.type} detected via ${e.source}`
    });
  });

  const context: SanitizedContext = {
    pageUrl: url,
    pageTitle: title,
    pageType,
    timestamp: Date.now(),
    elements: sanitizedElems,
    sanitizedText,
    ocrTexts: [],
    piiSummary: {
      totalDetected: appliedEntities.length,
      totalRedacted: appliedEntities.length,
      byType: appliedEntities.reduce((acc, e) => ({ ...acc, [e.type]: (acc[e.type] ?? 0) + 1 }), {} as Record<string, number>),
    },
    screenshotIncluded: false,
  };

  console.log(`[PrivacyAgent] Analysis complete in ${Date.now() - t0}ms. PII detected: ${appliedEntities.length}`);
  return context;
}

// ── VISUAL OVERLAY ─────────────────────────────────────────────────────────────

function renderOverlay(entities: PIIEntity[]): void {
  if (overlayContainer) overlayContainer.remove();
  overlayContainer = document.createElement('div');
  overlayContainer.id = '__privacy-agent-overlay__';
  overlayContainer.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:2147483647;';
  document.body.appendChild(overlayContainer);

  buildOverlayBoxes(entities).forEach(({ bbox, label, color }) => {
    const box = document.createElement('div');
    box.style.cssText = `position:absolute;left:${bbox.x}px;top:${bbox.y}px;width:${bbox.width}px;height:${bbox.height}px;border:2px solid ${color};background:${color}18;pointer-events:none;border-radius:3px;`;
    const lbl = document.createElement('div');
    lbl.style.cssText = `position:absolute;top:-20px;left:0;background:${color};color:#fff;font:bold 10px monospace;padding:2px 6px;border-radius:3px;white-space:nowrap;`;
    lbl.textContent = label;
    box.appendChild(lbl);
    overlayContainer!.appendChild(box);
  });
}

function clearOverlay(): void {
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
  chrome.runtime.sendMessage({ type: 'AUDIT_EVENT', event });
}

// ── MESSAGE HANDLER ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  (async () => {
    switch (message.type) {

      case 'ANALYZE_PAGE': {
        const context = await analyzePage();
        sendResponse({ context, piiEntities: currentEntities });
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
        // Check if approval is required
        if (currentSettings.requireApprovalFor.includes(action.action)) {
          // For now auto-approve in demo; in full version, show UI
          console.log('[PrivacyAgent] Auto-approving action for demo:', action.action);
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

console.log('[PrivacyAgent] Content script initialized on', location.href);
