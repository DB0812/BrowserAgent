/**
 * Background Service Worker
 *
 * Responsibilities:
 * - Task orchestration (PERCEIVE → SANITIZE → SEND → REASON → ACT loop)
 * - Communication with server
 * - Extension state management
 * - Audit log persistence
 * - Privacy status indicator
 */

import type {
  ExtensionMessage, AgentTask, AgentStatus, PrivacyStatus,
  SanitizedContext, BrowserAction, AuditEvent, LatencyMetrics
} from '../utils/types';

const SERVER_URL = 'http://localhost:8000';

// ── STATE ──────────────────────────────────────────────────────────────────────

let agentStatus: AgentStatus = 'idle';
let privacyStatus: PrivacyStatus = 'protected';
let currentTask: AgentTask | null = null;
let auditLog: AuditEvent[] = [];
let metrics: Partial<LatencyMetrics> = {};
let sessionId = generateSessionId();

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── BADGE & STATUS ─────────────────────────────────────────────────────────────

function updateBadge(status: AgentStatus): void {
  const badges: Record<string, { text: string; color: string }> = {
    idle:              { text: '',    color: '#6b7280' },
    analyzing:         { text: '●',   color: '#2563eb' },
    detecting:         { text: '🔍',  color: '#f57c00' },
    redacting:         { text: '🔒',  color: '#7c3aed' },
    sending:           { text: '↑',   color: '#16a34a' },
    reasoning:         { text: '🤔',  color: '#0284c7' },
    acting:            { text: '▶',   color: '#16a34a' },
    'awaiting-approval': { text: '!', color: '#dc2626' },
    done:              { text: '✓',   color: '#16a34a' },
    error:             { text: '✗',   color: '#dc2626' },
  };
  const b = badges[status] ?? { text: '', color: '#6b7280' };
  chrome.action.setBadgeText({ text: b.text });
  chrome.action.setBadgeBackgroundColor({ color: b.color });
}

function setStatus(status: AgentStatus, privacy: PrivacyStatus = privacyStatus): void {
  agentStatus = status;
  privacyStatus = privacy;
  updateBadge(status);
  // Broadcast to popup and dashboard
  chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status, privacyStatus: privacy, piiCount: currentTask?.steps.length ?? 0 }).catch(() => {});
}

// ── MAIN TASK LOOP ─────────────────────────────────────────────────────────────

async function runTask(instruction: string, tabId: number): Promise<void> {
  const taskId = `task-${Date.now()}`;
  currentTask = { taskId, sessionId, instruction, status: 'analyzing', steps: [], startedAt: Date.now() };

  try {
    // Post session to server
    await postToServer('/api/sessions', { sessionId, taskInstruction: instruction }).catch(() => {});

    let stepNumber = 0;
    const MAX_STEPS = 15;

    while (stepNumber < MAX_STEPS) {
      stepNumber++;
      console.log(`[BG] Step ${stepNumber}/${MAX_STEPS}`);

      // ── STEP 1: PERCEIVE (DOM analysis in content script) ──
      setStatus('analyzing', 'analyzing');
      const t0 = Date.now();
      const { context, piiEntities } = await sendToContent(tabId, { type: 'ANALYZE_PAGE' });
      metrics.domAnalysis = Date.now() - t0;

      // ── STEP 2: PII already detected by content script ──
      setStatus('detecting');
      metrics.piiDetection = 0; // done within content script

      // ── STEP 3: REDACTION already applied by content script ──
      setStatus('redacting');
      metrics.redaction = 0;

      addAuditEvent({
        type: 'context_sent',
        detail: `Sanitized context prepared. PII detected: ${context.piiSummary.totalDetected}. Raw data transmitted: 0 bytes.`,
      });

      // ── STEP 4: SEND to server (sanitized context only) ──
      setStatus('sending', 'protected');
      const t1 = Date.now();
      let serverResponse: { action: BrowserAction } | null = null;

      try {
        serverResponse = await postToServer('/api/action', {
          task: instruction,
          sessionId,
          context,
          stepNumber,
        });
        metrics.network = Date.now() - t1;
        metrics.serverReasoning = serverResponse ? 0 : 0; // server reports its own latency
      } catch (err) {
        console.error('[BG] Server error:', err);
        setStatus('error');
        addAuditEvent({ type: 'action_blocked', detail: `Server error: ${String(err)}` });
        break;
      }

      if (!serverResponse?.action) {
        console.warn('[BG] No action returned from server');
        break;
      }

      addAuditEvent({ type: 'response_received', detail: `Server returned: ${serverResponse.action.action}` });

      // ── STEP 5: VALIDATE + EXECUTE ──
      setStatus('acting');
      const t2 = Date.now();

      const actionResult = await sendToContent(tabId, {
        type: 'ACTION_REQUEST',
        action: serverResponse.action,
        actionId: `action-${stepNumber}`,
      });

      currentTask.steps.push({ ...actionResult, action: serverResponse.action, executedAt: Date.now(), latencyMs: Date.now() - t2 });

      metrics.total = Date.now() - t0;

      // Save metrics to server
      await postToServer('/api/metrics', { sessionId, stepNumber, metrics }).catch(() => {});

      // Check if task is done
      if (serverResponse.action.action === 'done') {
        setStatus('done', 'protected');
        currentTask.status = 'done';
        currentTask.completedAt = Date.now();
        break;
      }

      // Brief pause between steps
      await delay(800);
    }

  } catch (err) {
    console.error('[BG] Task failed:', err);
    setStatus('error');
  }
}

// ── HELPERS ────────────────────────────────────────────────────────────────────

async function sendToContent(tabId: number, message: ExtensionMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

async function postToServer(path: string, body: unknown): Promise<any> {
  const response = await fetch(`${SERVER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Server ${response.status}: ${await response.text()}`);
  return response.json();
}

function addAuditEvent(data: Partial<AuditEvent>): void {
  const event: AuditEvent = {
    id: `audit-${Date.now()}`,
    timestamp: Date.now(),
    type: data.type ?? 'context_sent',
    detail: data.detail ?? '',
    rawDataTransmitted: false,
    ...data,
  };
  auditLog.push(event);
  chrome.storage.local.set({ auditLog: auditLog.slice(-200) });
  chrome.runtime.sendMessage({ type: 'AUDIT_EVENT', event }).catch(() => {});
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── MESSAGE ROUTER ─────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  (async () => {
    switch (message.type) {

      case 'START_TASK': {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = tabs[0]?.id;
        if (!tabId) { sendResponse({ error: 'No active tab' }); return; }
        sessionId = message.sessionId || generateSessionId();
        runTask(message.instruction, tabId).catch(console.error);
        sendResponse({ ok: true, sessionId });
        break;
      }

      case 'GET_STATUS': {
        sendResponse({ agentStatus, privacyStatus, currentTask, metrics, sessionId });
        break;
      }

      case 'AUDIT_EVENT': {
        auditLog.push(message.event as AuditEvent);
        // Forward to dashboard via storage
        chrome.storage.local.set({ auditLog: auditLog.slice(-200) });
        sendResponse({ ok: true });
        break;
      }

      case 'SETTINGS_UPDATE': {
        // Forward settings to active tab content script
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'SETTINGS_UPDATE', settings: message.settings });
        }
        chrome.storage.local.set({ privacySettings: message.settings });
        sendResponse({ ok: true });
        break;
      }
    }
  })();
  return true;
});

console.log('[PrivacyAgent] Background service worker started. Session:', sessionId);
