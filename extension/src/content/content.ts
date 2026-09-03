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
 */

import { detectPIIFromDOM, detectPIIFromText, createFaceEntity, PLACEHOLDER_MAP } from '../privacy/pii-detector';
import { buildOverlayBoxes, redactText, sanitizeElements } from '../privacy/redaction-engine';
import { detectFaces } from '../vision/face-detector';
import { validateAction, executeAction } from '../actions/action-validator';
import { applyPolicy, DEFAULT_SETTINGS } from '../privacy/policy-engine';
import { buildRegistry, getRegistrySnapshot, checkAndResetIfNeeded } from './element-registry';
import { extractA11yTree, formatA11yForLLM } from './accessibility';
import { getAdapter, getSiteStatus } from '../adapters/adapter-registry';
import type {
  ExtensionMessage, PIIEntity, UIElement, SanitizedContext,
  BoundingBox, PrivacySettings, AuditEvent, ElementRecord
} from '../utils/types';

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

async function analyzePage(forceRefresh = false): Promise<SanitizedContext> {
  const t0 = Date.now();

  // Check if page changed
  const stateHash = computeStateHash();
  if (!forceRefresh && stateHash === lastStateHash && lastAnalysisContext) {
    console.log('[PrivacyAgent] State unchanged — returning cached context');
    return lastAnalysisContext;
  }

  checkAndResetIfNeeded();

  const url = location.href.split('?')[0];
  const title = document.title;
  const pageType = classifyPageType(url, title);

  // Get site adapter
  const adapter = getAdapter(location.href);
  const adapterName = adapter?.name;

  // Level 1: Accessibility tree
  const t_a11y = Date.now();
  const a11yResult = extractA11yTree();
  const a11yMs = Date.now() - t_a11y;
  const perceptionLevel = determinePerceptionLevel(a11yResult);
  console.log(`[PrivacyAgent] A11y: ${a11yResult.nodes.length} nodes, level=${perceptionLevel} (${a11yMs}ms)`);

  // Build element registry (stable IDs)
  const t_reg = Date.now();
  const registryRecords = buildRegistry();
  const regMs = Date.now() - t_reg;
  console.log(`[PrivacyAgent] Element registry: ${registryRecords.length} elements (${regMs}ms)`);

  // Layer 1: DOM PII detection
  const domEntities = detectPIIFromDOM(currentSettings);

  // Layer 2: Text content regex scan
  const bodyText = document.body.innerText ?? '';
  const textEntities = detectPIIFromText(bodyText, 'regex', currentSettings);

  // Layer 3: Visual face detection (only if enabled and level 3+)
  let faceEntities: PIIEntity[] = [];
  if (currentSettings.enableFaceDetection && perceptionLevel >= 3) {
    const faces = await detectFaces();
    faceEntities = faces.map(f => createFaceEntity(f.bbox, f.confidence));
  }

  // Combine all detections
  const allEntities = [...domEntities, ...textEntities, ...faceEntities];
  const appliedEntities = applyPolicy(allEntities, currentSettings);
  currentEntities = appliedEntities;

  // Build UI elements from registry
  let rawElements = extractUIElements(registryRecords);

  // Apply site adapter normalization
  if (adapter) {
    rawElements = adapter.normalizeElements(rawElements);
  }

  const sanitizedElems = sanitizeElements(rawElements, appliedEntities);

  // Sanitize page text
  let sanitizedText = redactText(bodyText.slice(0, 3000), appliedEntities);

  // Apply site adapter context enrichment
  if (adapter) {
    const enriched = adapter.enrichPageContext({
      url: location.href,
      domain: new URL(location.href).hostname,
      elements: rawElements,
      visibleText: sanitizedText,
      title,
    });
    sanitizedText = enriched.visibleText;
  }

  // Append A11y context for Level 1 perception
  if (perceptionLevel === 1) {
    sanitizedText = `${formatA11yForLLM(a11yResult)}\n\nPAGE TEXT:\n${sanitizedText}`;
  }

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
    perceptionLevel,
    stateHash,
    siteAdapter: adapterName,
  };

  // Cache result
  lastStateHash = stateHash;
  lastAnalysisContext = context;

  const totalMs = Date.now() - t0;
  console.log(`[PrivacyAgent] Analysis complete in ${totalMs}ms | Level ${perceptionLevel} | PII: ${appliedEntities.length} | Elements: ${sanitizedElems.length}`);
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
        // Support forceRefresh to bypass cache after fill/click actions
        const context = await analyzePage(message.forceRefresh === true);
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

console.log('[PrivacyAgent] Content script initialized on', location.href,
  '| Site:', getSiteStatus(location.href).compatibility);
