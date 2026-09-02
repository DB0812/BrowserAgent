/**
 * Background Service Worker (MV3)
 *
 * Responsibilities:
 * 1. Orchestrate agent task workflow (loop DOM analysis -> Server LLM reasoning -> Local action execution)
 * 2. Communicate with local Python FastAPI server (http://localhost:8000/api)
 * 3. Track task state and relay progress to popup UI / dashboard
 * 4. Manage offscreen document for OCR processing
 */

import type { ExtensionMessage, BrowserAction, SanitizedContext, AuditEvent } from '../utils/types';

const SERVER_URL = 'http://localhost:8000/api';

interface TaskState {
  sessionId: string;
  instruction: string;
  status: 'idle' | 'analyzing' | 'detecting' | 'redacting' | 'sending' | 'reasoning' | 'acting' | 'done' | 'error';
  stepNumber: number;
  previousActions: BrowserAction[];
  steps: Array<{
    step: number;
    label: string;
    status: string;
    action?: BrowserAction;
    latencyMs?: number;
    model?: string;
  }>;
}

let currentState: TaskState = {
  sessionId: '',
  instruction: '',
  status: 'idle',
  stepNumber: 0,
  previousActions: [],
  steps: [],
};

// ── LISTENERS ──────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (!message || !message.type) return;

  switch (message.type) {
    case 'START_TASK': {
      const { instruction, targetUrl, sessionId } = message;
      const sid = sessionId || `session-${Date.now()}`;
      startTask(instruction, sid, targetUrl);
      sendResponse({ ok: true, sessionId: sid });
      break;
    }

    case 'GET_STATUS': {
      sendResponse({
        agentStatus: currentState.status,
        sessionId: currentState.sessionId,
        instruction: currentState.instruction,
        steps: currentState.steps,
      });
      break;
    }

    case 'AUDIT_EVENT': {
      // Store event locally
      chrome.storage.local.get(['auditLog'], (res) => {
        const log: AuditEvent[] = res.auditLog || [];
        log.push(message.event);
        chrome.storage.local.set({ auditLog: log.slice(-100) });
      });
      break;
    }
  }

  return true;
});

// ── TASK RUNNER LOOP ──────────────────────────────────────────────────────────

async function startTask(instruction: string, sessionId: string, targetUrl?: string) {
  currentState = {
    sessionId,
    instruction,
    status: 'analyzing',
    stepNumber: 1,
    previousActions: [],
    steps: [],
  };

  broadcastStatus('analyzing');

  try {
    // 1. Create session on backend
    await fetch(`${SERVER_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, taskInstruction: instruction }),
    }).catch(err => console.warn('[Background] Server session create warning:', err));

    // 2. Query active tab or navigate if targetUrl specified
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      throw new Error('No active tab found for task execution');
    }

    let activeTabId = tab.id;

    if (targetUrl && tab.url !== targetUrl) {
      await chrome.tabs.update(activeTabId, { url: targetUrl });
      await delay(1500); // allow page load
    }

    const MAX_STEPS = 10;
    while (currentState.stepNumber <= MAX_STEPS) {
      const stepNum = currentState.stepNumber;
      broadcastStatus('analyzing');

      // Step A: Request DOM analysis and local PII redaction from content script
      const analysisResult = await sendMessageToTab(activeTabId, { type: 'ANALYZE_PAGE' });
      if (!analysisResult || !analysisResult.context) {
        throw new Error('Failed to analyze page DOM in content script');
      }

      const context: SanitizedContext = analysisResult.context;

      // Step B: Send sanitized context to local server for reasoning
      broadcastStatus('reasoning');
      const startReason = Date.now();

      const serverRes = await fetch(`${SERVER_URL}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: instruction,
          context,
          previousActions: currentState.previousActions,
          stepNumber: stepNum,
          sessionId,
        }),
      });

      if (!serverRes.ok) {
        const errText = await serverRes.text();
        throw new Error(`Server reasoning failed (${serverRes.status}): ${errText}`);
      }

      const actionData = await serverRes.json();
      const action: BrowserAction = actionData.action;
      const latencyMs = actionData.serverLatencyMs || (Date.now() - startReason);
      const modelUsed = actionData.modelUsed || 'Gemini 2.0 Flash';

      // Record step
      const stepEntry = {
        step: stepNum,
        label: `${action.action} — ${action.reason || 'executing'}`,
        status: 'executing',
        action,
        latencyMs,
        model: modelUsed,
      };

      currentState.steps.push(stepEntry);
      broadcastStepUpdate(stepEntry);

      // Check if task is completed
      if (action.action === 'done') {
        currentState.status = 'done';
        broadcastStatus('done');
        broadcastTaskDone(action.reason || 'Task completed successfully.');
        await fetch(`${SERVER_URL}/sessions/${sessionId}/complete`, { method: 'PATCH' }).catch(() => {});
        break;
      }

      // Step C: Send action to content script for local validation and execution
      broadcastStatus('acting');
      const execResult = await sendMessageToTab(activeTabId, { type: 'ACTION_REQUEST', action });

      if (!execResult || !execResult.success) {
        console.warn('[Background] Action execution returned error:', execResult?.error);
      }

      currentState.previousActions.push(action);
      currentState.stepNumber++;
      await delay(1000);
    }

  } catch (err: any) {
    console.error('[Background] Task execution failed:', err);
    currentState.status = 'error';
    broadcastStatus('error');
  }
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function sendMessageToTab(tabId: number, msg: ExtensionMessage): Promise<any> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[Background] Send message warning:', chrome.runtime.lastError.message);
        resolve(null);
      } else {
        resolve(response);
      }
    });
  });
}

function broadcastStatus(status: TaskState['status']) {
  currentState.status = status;
  chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status }).catch(() => {});
}

function broadcastStepUpdate(step: TaskState['steps'][0]) {
  chrome.runtime.sendMessage({ type: 'STEP_UPDATE', ...step }).catch(() => {});
}

function broadcastTaskDone(reason: string) {
  chrome.runtime.sendMessage({ type: 'TASK_DONE', reason, steps: currentState.steps }).catch(() => {});
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('[PrivacyAgent] Background service worker initialized');
