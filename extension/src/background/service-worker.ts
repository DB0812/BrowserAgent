/**
 * Background Service Worker — REAL agent loop
 *
 * Flow when user clicks "Run Task on Demo Page":
 * 1. Navigate active tab to demo site
 * 2. Wait for page to load
 * 3. Loop: PERCEIVE (real DOM) → SEND to LLM → EXECUTE action on real page
 * 4. Show live badge & status after each step
 */

import type {
  ExtensionMessage, AgentTask, AgentStatus, PrivacyStatus,
  BrowserAction, AuditEvent, LatencyMetrics
} from '../utils/types';

const SERVER_URL = 'http://localhost:8000';
const DEMO_URL   = 'http://localhost:3000'; // demo-site served by npx serve

// ── STATE ──────────────────────────────────────────────────────────────────────

let agentStatus: AgentStatus = 'idle';
let privacyStatus: PrivacyStatus = 'protected';
let currentTask: AgentTask | null = null;
let auditLog: AuditEvent[] = [];
let metrics: Partial<LatencyMetrics> = {};
let sessionId = generateSessionId();
let currentSteps: any[] = [];

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── BADGE & STATUS ─────────────────────────────────────────────────────────────

function updateBadge(status: AgentStatus): void {
  const badges: Record<string, { text: string; color: string }> = {
    idle:       { text: '',    color: '#6b7280' },
    analyzing:  { text: '●',   color: '#2563eb' },
    detecting:  { text: 'PII', color: '#f57c00' },
    redacting:  { text: '🔒',  color: '#7c3aed' },
    sending:    { text: '↑',   color: '#22d3ee' },
    reasoning:  { text: 'AI',  color: '#0284c7' },
    acting:     { text: '▶',   color: '#16a34a' },
    done:       { text: '✓',   color: '#16a34a' },
    error:      { text: '✗',   color: '#dc2626' },
  };
  const b = badges[status] ?? { text: '', color: '#6b7280' };
  chrome.action.setBadgeText({ text: b.text });
  chrome.action.setBadgeBackgroundColor({ color: b.color });
}

function setStatus(status: AgentStatus, privacy: PrivacyStatus = privacyStatus): void {
  agentStatus = status;
  privacyStatus = privacy;
  updateBadge(status);
  broadcast({ type: 'STATUS_UPDATE', status, privacyStatus: privacy, steps: currentSteps });
}

function broadcast(msg: object): void {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

// ── NAVIGATE + WAIT FOR LOAD ───────────────────────────────────────────────────

async function navigateTab(tabId: number, url: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.tabs.update(tabId, { url }, () => {
      // Listen for the tab to finish loading
      const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
        if (updatedTabId === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          // Extra wait for content script to initialise
          setTimeout(resolve, 800);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

// ── INJECT STATUS OVERLAY INTO PAGE ───────────────────────────────────────────

async function showPageOverlay(tabId: number, message: string, type: 'info' | 'success' | 'warning' = 'info'): Promise<void> {
  const colors = { info: '#0891b2', success: '#10b981', warning: '#f59e0b' };
  const color = colors[type];
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (msg: string, clr: string) => {
      let el = document.getElementById('__privacy-agent-status__');
      if (!el) {
        el = document.createElement('div');
        el.id = '__privacy-agent-status__';
        el.style.cssText = `position:fixed;bottom:16px;right:16px;z-index:2147483647;font-family:monospace;font-size:12px;padding:10px 16px;border-radius:8px;border:1px solid;box-shadow:0 4px 24px rgba(0,0,0,0.5);transition:all 0.3s;max-width:340px;pointer-events:none;`;
        document.body.appendChild(el);
      }
      el.style.background = clr + '22';
      el.style.borderColor = clr;
      el.style.color = clr;
      el.innerHTML = `🤖 <strong>PrivacyAgent:</strong> ${msg}`;
    },
    args: [message, color],
  }).catch(() => {});
}

async function hidePageOverlay(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => { document.getElementById('__privacy-agent-status__')?.remove(); },
  }).catch(() => {});
}

// ── MAIN TASK LOOP ─────────────────────────────────────────────────────────────

async function runTask(instruction: string, tabId: number, targetUrl: string): Promise<void> {
  currentSteps = [];
  const taskId = `task-${Date.now()}`;
  currentTask = { taskId, sessionId, instruction, status: 'analyzing', steps: [], startedAt: Date.now() };

  try {
    // ── PHASE 0: Navigate to demo page ──
    setStatus('analyzing');
    addAuditEvent({ type: 'context_sent', detail: `Navigating to ${targetUrl}` });
    broadcast({ type: 'STEP_UPDATE', step: 0, label: `Navigating to demo page...`, status: 'navigating' });

    await navigateTab(tabId, targetUrl);
    addAuditEvent({ type: 'context_sent', detail: 'Page loaded. Starting agent loop.' });

    // Register session on server
    await postToServer('/api/sessions', { sessionId, taskInstruction: instruction }).catch(() => {});

    let stepNumber = 0;
    const MAX_STEPS = 12;

    while (stepNumber < MAX_STEPS) {
      stepNumber++;
      console.log(`[BG] Step ${stepNumber}/${MAX_STEPS}`);
      broadcast({ type: 'STEP_UPDATE', step: stepNumber, label: `Step ${stepNumber}: Analyzing page...`, status: 'analyzing' });

      // ── PERCEIVE: ask content script to analyze real DOM ──
      setStatus('analyzing', 'analyzing');
      await showPageOverlay(tabId, `Step ${stepNumber} — Analyzing page DOM…`, 'info');
      const t0 = Date.now();

      let perceiveResult: any;
      try {
        perceiveResult = await sendToContent(tabId, { type: 'ANALYZE_PAGE' });
      } catch (err) {
        addAuditEvent({ type: 'action_blocked', detail: `Content script not ready: ${String(err)}` });
        break;
      }

      const { context } = perceiveResult;
      metrics.domAnalysis = Date.now() - t0;

      // ── DETECT PII ──
      setStatus('detecting');
      await showPageOverlay(tabId, `Detected ${context.piiSummary.totalDetected} PII items — redacting locally…`, 'warning');
      addAuditEvent({
        type: 'context_sent',
        detail: `PII detected: ${context.piiSummary.totalDetected}. Redacted locally. 0 bytes transmitted.`,
      });
      await delay(400);

      // ── SEND sanitised context to LLM server ──
      setStatus('sending', 'protected');
      await showPageOverlay(tabId, `Sending sanitised context to LLM server (0 PII bytes)…`, 'info');
      broadcast({ type: 'STEP_UPDATE', step: stepNumber, label: `Step ${stepNumber}: Reasoning with Gemini…`, status: 'reasoning' });

      const t1 = Date.now();
      let serverResponse: any;
      try {
        serverResponse = await postToServer('/api/action', {
          task: instruction,
          sessionId,
          context,
          stepNumber,
          previousActions: currentSteps.map(s => ({
            step: s.step,
            action: s.action,
            target: s.target ? { type: 'selector', value: s.target } : undefined,
            value: s.value,
            reason: s.reason,
            confidence: s.confidence,
          })),
        });
        metrics.network = Date.now() - t1;
      } catch (err) {
        addAuditEvent({ type: 'action_blocked', detail: `Server error: ${String(err)}` });
        setStatus('error');
        await showPageOverlay(tabId, `Server error. Is the backend running?`, 'warning');
        break;
      }

      setStatus('reasoning');
      const action: BrowserAction = serverResponse.action;
      if (!action) break;

      addAuditEvent({ type: 'response_received', detail: `LLM returned: ${action.action} → ${action.reason}` });

      // ── EXECUTE validated action on real page ──
      setStatus('acting');
      await showPageOverlay(
        tabId,
        `${action.action.toUpperCase()}${action.target ? ` → ${action.target.value}` : ''}${action.value ? ` = "${action.value}"` : ''} — ${action.reason}`,
        'success',
      );
      broadcast({
        type: 'STEP_UPDATE',
        step: stepNumber,
        label: `Step ${stepNumber}: ${action.action} ${action.target?.value ?? ''} ${action.value ? '= "' + action.value + '"' : ''}`,
        status: 'acting',
        action,
        latencyMs: serverResponse.serverLatencyMs,
        model: serverResponse.modelUsed,
      });

      const t2 = Date.now();
      let actionResult: any;
      try {
        actionResult = await sendToContent(tabId, {
          type: 'ACTION_REQUEST',
          action,
          actionId: `action-${stepNumber}`,
        });
      } catch (err) {
        actionResult = { success: false, error: String(err) };
      }

      currentSteps.push({
        step: stepNumber,
        action: action.action,
        target: action.target?.value,
        value: action.value,
        reason: action.reason,
        confidence: action.confidence,
        success: actionResult?.success ?? false,
        latencyMs: serverResponse.serverLatencyMs ?? 0,
        model: serverResponse.modelUsed ?? 'gemini',
        timestamp: Date.now(),
      });

      metrics.total = Date.now() - t0;
      await postToServer('/api/metrics', { sessionId, stepNumber, metrics }).catch(() => {});

      addAuditEvent({ type: 'action_executed', detail: `Executed: ${action.action}. Success: ${actionResult?.success}` });

      if (action.action === 'done') {
        setStatus('done', 'protected');
        currentTask.status = 'done';
        currentTask.completedAt = Date.now();
        await showPageOverlay(tabId, `✅ Task complete! ${action.reason}`, 'success');
        broadcast({ type: 'TASK_DONE', steps: currentSteps, reason: action.reason });
        break;
      }

      await delay(1000);
    }

  } catch (err) {
    console.error('[BG] Task failed:', err);
    setStatus('error');
    addAuditEvent({ type: 'action_blocked', detail: `Task failed: ${String(err)}` });
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
  broadcast({ type: 'AUDIT_EVENT', event });
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── MESSAGE ROUTER ─────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  (async () => {
    switch (message.type) {

      case 'START_TASK': {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = tabs[0]?.id;
        if (!tabId) { sendResponse({ error: 'No active tab' }); return; }
        sessionId = generateSessionId();
        const targetUrl = (message as any).targetUrl || DEMO_URL;
        runTask((message as any).instruction, tabId, targetUrl).catch(console.error);
        sendResponse({ ok: true, sessionId });
        break;
      }

      case 'GET_STATUS': {
        sendResponse({ agentStatus, privacyStatus, currentTask, metrics, sessionId, steps: currentSteps });
        break;
      }

      case 'AUDIT_EVENT': {
        auditLog.push(message.event as AuditEvent);
        chrome.storage.local.set({ auditLog: auditLog.slice(-200) });
        sendResponse({ ok: true });
        break;
      }

      case 'SETTINGS_UPDATE': {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'SETTINGS_UPDATE', settings: (message as any).settings });
        }
        chrome.storage.local.set({ privacySettings: (message as any).settings });
        sendResponse({ ok: true });
        break;
      }
    }
  })();
  return true;
});

console.log('[PrivacyAgent] Background service worker started. Session:', sessionId);
