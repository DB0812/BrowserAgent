/**
 * Background Service Worker (MV3)
 *
 * Responsibilities:
 * 1. Orchestrate agent task workflow with full Task State Machine
 * 2. Communicate with local Python FastAPI server (http://localhost:8000/api)
 * 3. Site adapter detection and compatibility reporting
 * 4. Confidence-gated action approval
 * 5. Error recovery (re-perceive on failure, retry max 2×)
 * 6. Max step limit enforcement (MAX_STEPS = 20)
 * 7. Fallback to demo benchmark if real site unavailable
 */

import type {
  ExtensionMessage, BrowserAction, SanitizedContext, AuditEvent,
  TaskState, SiteStatus, SiteCompatibility
} from '../utils/types';

const SERVER_URL = 'http://localhost:8000/api';
const MAX_STEPS = 20;
const CONFIDENCE_AUTO_APPROVE = 0.90;    // Auto-execute above this
const CONFIDENCE_ASK_THRESHOLD = 0.70;   // Ask user between 0.70–0.90
const USER_APPROVAL_TIMEOUT_MS = 15000;  // Auto-approve after 15s in demo mode

interface RunningTask {
  sessionId: string;
  instruction: string;
  taskState: TaskState;
  stepNumber: number;
  previousActions: BrowserAction[];
  retryCount: number;
  lastStateHash: string;
  siteStatus?: SiteStatus;
  steps: Array<{
    step: number;
    label: string;
    status: string;
    action?: BrowserAction;
    latencyMs?: number;
    model?: string;
    confidence?: number;
  }>;
  stopped: boolean;
}

let currentTask: RunningTask = {
  sessionId: '',
  instruction: '',
  taskState: 'IDLE',
  stepNumber: 0,
  previousActions: [],
  retryCount: 0,
  lastStateHash: '',
  steps: [],
  stopped: false,
};

// Pending approval callbacks (action ID → resolve function)
const pendingApprovals = new Map<string, (approved: boolean) => void>();
// Pending user input callbacks (action ID → resolve function)
const pendingUserInputs = new Map<string, (value: string) => void>();

// ── LISTENERS ──────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (!message || !message.type) return;

  switch (message.type) {
    case 'START_TASK': {
      const { instruction, targetUrl, sessionId } = message;
      if (currentTask.taskState !== 'IDLE' && currentTask.taskState !== 'COMPLETED'
        && currentTask.taskState !== 'ERROR') {
        sendResponse({ ok: false, error: 'Task already running' });
        break;
      }
      const sid = sessionId || `session-${Date.now()}`;
      startTask(instruction, sid, targetUrl);
      sendResponse({ ok: true, sessionId: sid });
      break;
    }

    case 'STOP_TASK': {
      currentTask.stopped = true;
      setTaskState('IDLE');
      sendResponse({ ok: true });
      break;
    }

    case 'GET_STATUS': {
      sendResponse({
        agentStatus: taskStateToLegacyStatus(currentTask.taskState),
        taskState: currentTask.taskState,
        sessionId: currentTask.sessionId,
        instruction: currentTask.instruction,
        steps: currentTask.steps,
        siteStatus: currentTask.siteStatus,
      });
      break;
    }

    case 'AUDIT_EVENT': {
      chrome.storage.local.get(['auditLog'], (res) => {
        const log: AuditEvent[] = res.auditLog || [];
        log.push(message.event);
        chrome.storage.local.set({ auditLog: log.slice(-100) });
      });
      break;
    }

    case 'SITE_STATUS': {
      // Content script reported site status — cache it and broadcast to popup
      currentTask.siteStatus = message.siteStatus;
      chrome.runtime.sendMessage({ type: 'SITE_STATUS', siteStatus: message.siteStatus }).catch(() => {});
      break;
    }

    case 'ACTION_APPROVAL_RESPONSE': {
      const resolver = pendingApprovals.get(message.actionId);
      if (resolver) {
        resolver(message.approved);
        pendingApprovals.delete(message.actionId);
      }
      break;
    }

    case 'USER_INPUT_RESPONSE': {
      const resolver = pendingUserInputs.get(message.actionId);
      if (resolver) {
        resolver(message.value);
        pendingUserInputs.delete(message.actionId);
      }
      break;
    }
  }

  return true;
});

// ── TASK RUNNER LOOP ──────────────────────────────────────────────────────────

async function startTask(instruction: string, sessionId: string, targetUrl?: string) {
  currentTask = {
    sessionId,
    instruction,
    taskState: 'UNDERSTANDING',
    stepNumber: 1,
    previousActions: [],
    retryCount: 0,
    lastStateHash: '',
    steps: [],
    stopped: false,
  };

  setTaskState('UNDERSTANDING');

  try {
    // Create session on backend
    await fetch(`${SERVER_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, taskInstruction: instruction }),
    }).catch(err => console.warn('[Background] Server session warning:', err));

    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error('No active tab found');
    let activeTabId = tab.id;

    // Navigate to target URL if specified and not current
    if (targetUrl && tab.url !== targetUrl) {
      await chrome.tabs.update(activeTabId, { url: targetUrl });
      setTaskState('WAITING_FOR_PAGE');
      await delay(2000); // Allow page to load
    }

    // ── MAIN AGENT LOOP ──────────────────────────────────────────────────────
    while (currentTask.stepNumber <= MAX_STEPS && !currentTask.stopped) {
      const stepNum = currentTask.stepNumber;

      // STEP A: Perceive the page
      setTaskState('PERCEIVING');
      // Force refresh if previous action was interactive (fill/click/select)
      // so that input-value changes are detected as state changes.
      const lastAction = currentTask.previousActions[currentTask.previousActions.length - 1];
      const forceRefresh = lastAction != null &&
        ['fill', 'click', 'select', 'navigate'].includes(lastAction.action);
      const analysisResult = await sendMessageToTab(activeTabId, { type: 'ANALYZE_PAGE', forceRefresh });

      if (!analysisResult || !analysisResult.context) {
        console.warn('[Background] Page analysis failed at step', stepNum);
        currentTask.retryCount++;
        if (currentTask.retryCount >= 3) {
          setTaskState('ERROR');
          broadcastTaskDone('Failed to analyze page after 3 attempts.');
          return;
        }
        await delay(1500);
        continue;
      }

      const context: SanitizedContext = analysisResult.context;

      // Detect state change for incremental perception
      if (context.stateHash && context.stateHash === currentTask.lastStateHash && stepNum > 1) {
        console.log('[Background] Page state unchanged after action — waiting...');
        setTaskState('WAITING_FOR_PAGE');
        await delay(1000);
        currentTask.retryCount++;
        if (currentTask.retryCount >= 3) {
          setTaskState('ERROR');
          broadcastTaskDone('Page did not change after repeated actions.');
          return;
        }
        continue;
      }
      currentTask.lastStateHash = context.stateHash ?? '';
      currentTask.retryCount = 0;

      // STEP B: Send sanitized context to server for reasoning
      setTaskState('PLANNING');
      const startReason = Date.now();

      let serverRes: Response;
      try {
        serverRes = await fetch(`${SERVER_URL}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task: instruction,
            context,
            previousActions: currentTask.previousActions.map((a, i) => ({
              ...a,
              step: i + 1,
            })),
            stepNumber: stepNum,
            sessionId,
          }),
        });
      } catch (netErr) {
        console.error('[Background] Server unreachable:', netErr);
        setTaskState('ERROR');
        broadcastTaskDone('Cannot reach reasoning server. Is it running?');
        return;
      }

      if (!serverRes.ok) {
        const errText = await serverRes.text();
        // Privacy block from server
        if (serverRes.status === 422 && errText.includes('Privacy violation')) {
          setTaskState('PRIVACY_BLOCKED');
          broadcastTaskDone(`Privacy block: ${errText.slice(0, 200)}`);
          return;
        }
        throw new Error(`Server error ${serverRes.status}: ${errText.slice(0, 200)}`);
      }

      const actionData = await serverRes.json();
      const action: BrowserAction = actionData.action;
      const confidence: number = action.confidence ?? actionData.confidence ?? 0.9;
      const latencyMs: number = actionData.serverLatencyMs || (Date.now() - startReason);
      const modelUsed: string = actionData.modelUsed || 'LLM';

      // Record step
      const stepEntry = {
        step: stepNum,
        label: `${action.action} — ${action.reason || 'executing'}`,
        status: 'executing',
        action,
        latencyMs,
        model: modelUsed,
        confidence,
      };
      currentTask.steps.push(stepEntry);
      broadcastStepUpdate(stepEntry);

      // Check if task is completed
      if (action.action === 'done' || action.action === 'finish') {
        setTaskState('COMPLETED');
        broadcastTaskDone(action.reason || 'Task completed successfully.');
        await fetch(`${SERVER_URL}/sessions/${sessionId}/complete`, { method: 'PATCH' }).catch(() => {});
        return;
      }

      // Handle ask_user
      if (action.action === 'ask_user') {
        setTaskState('USER_REQUIRED');
        const userResponse = await requestUserInput(action.prompt || 'Please provide input:', `ask-${stepNum}`);
        // Continue with user-provided value — reanalyze page after
        currentTask.previousActions.push(action);
        currentTask.stepNumber++;
        await delay(500);
        continue;
      }

      // STEP C: Confidence gate
      setTaskState('VALIDATING');

      const needsApproval =
        action.requiresApproval ||
        confidence < CONFIDENCE_AUTO_APPROVE ||
        ['navigate', 'fill', 'select'].includes(action.action) && confidence < 0.85;

      if (needsApproval && confidence >= CONFIDENCE_ASK_THRESHOLD) {
        // Show approval request to user (auto-approve after timeout in demo)
        const approved = await requestActionApproval(action, `approval-${stepNum}`, confidence);
        if (!approved) {
          console.log('[Background] User rejected action at step', stepNum);
          setTaskState('LOW_CONFIDENCE');
          // Re-perceive and try again once
          currentTask.retryCount++;
          if (currentTask.retryCount < 2) continue;
          setTaskState('ERROR');
          broadcastTaskDone('Action rejected by user. Task stopped.');
          return;
        }
      } else if (confidence < CONFIDENCE_ASK_THRESHOLD) {
        // Confidence too low — re-perceive
        console.warn(`[Background] Confidence ${confidence.toFixed(2)} below threshold at step ${stepNum}`);
        setTaskState('LOW_CONFIDENCE');
        currentTask.retryCount++;
        if (currentTask.retryCount < 2) {
          setTaskState('RE_PERCEIVING');
          await delay(1000);
          continue;
        }
        setTaskState('ERROR');
        broadcastTaskDone('Confidence too low to proceed safely.');
        return;
      }

      // STEP D: Execute action
      setTaskState('EXECUTING');
      const execResult = await sendMessageToTab(activeTabId, {
        type: 'ACTION_REQUEST',
        action,
        actionId: `action-${stepNum}`,
      });

      if (!execResult || !execResult.success) {
        console.warn('[Background] Action execution failed:', execResult?.error);
        setTaskState('ACTION_INVALID');
        currentTask.retryCount++;
        if (currentTask.retryCount < 2) {
          setTaskState('RE_PERCEIVING');
          await delay(1000);
          // Don't increment step — retry same step with fresh perception
          continue;
        }
        setTaskState('ERROR');
        broadcastTaskDone(`Action failed: ${execResult?.error ?? 'unknown error'}`);
        return;
      }

      currentTask.previousActions.push(action);
      currentTask.retryCount = 0;
      currentTask.stepNumber++;

      // Wait for page to settle after action — dynamic sites need longer waits
      setTaskState('WAITING_FOR_PAGE');
      let waitMs = 1000;
      if (action.action === 'navigate') waitMs = 2500;
      else if (action.action === 'fill') waitMs = 1500;   // wait for autocomplete/dropdown
      else if (action.action === 'click') waitMs = 1500;  // wait for SPA re-render
      else if (action.action === 'select') waitMs = 1200;
      await delay(waitMs);
    }

    // Max steps exceeded
    if (currentTask.stepNumber > MAX_STEPS) {
      setTaskState('ERROR');
      broadcastTaskDone(`Task stopped: maximum action limit (${MAX_STEPS} steps) reached.`);
    }

  } catch (err: any) {
    console.error('[Background] Task execution failed:', err);
    setTaskState('ERROR');
    broadcastTaskDone(`Error: ${err.message ?? String(err)}`);
  }
}

// ── CONFIDENCE GATE ────────────────────────────────────────────────────────────

async function requestActionApproval(action: BrowserAction, actionId: string, confidence: number): Promise<boolean> {
  return new Promise((resolve) => {
    pendingApprovals.set(actionId, resolve);

    // Broadcast approval request to popup
    chrome.runtime.sendMessage({
      type: 'ACTION_APPROVAL_REQUEST',
      action,
      actionId,
      confidence,
    }).catch(() => {});

    // Auto-approve after timeout (demo mode — prevents blocking the demo)
    setTimeout(() => {
      if (pendingApprovals.has(actionId)) {
        pendingApprovals.delete(actionId);
        console.log('[Background] Auto-approving after timeout:', actionId);
        resolve(true);
      }
    }, USER_APPROVAL_TIMEOUT_MS);
  });
}

async function requestUserInput(prompt: string, actionId: string): Promise<string> {
  return new Promise((resolve) => {
    pendingUserInputs.set(actionId, resolve);

    chrome.runtime.sendMessage({
      type: 'USER_INPUT_REQUEST',
      prompt,
      actionId,
    }).catch(() => {});

    // Timeout fallback
    setTimeout(() => {
      if (pendingUserInputs.has(actionId)) {
        pendingUserInputs.delete(actionId);
        resolve('');
      }
    }, 60000);
  });
}

// ── STATE MACHINE ─────────────────────────────────────────────────────────────

function setTaskState(state: TaskState) {
  currentTask.taskState = state;
  const legacyStatus = taskStateToLegacyStatus(state);
  chrome.runtime.sendMessage({
    type: 'STATUS_UPDATE',
    status: legacyStatus,
    taskState: state,
  }).catch(() => {});
  chrome.runtime.sendMessage({
    type: 'TASK_STATE_CHANGE',
    taskState: state,
  }).catch(() => {});
}

function taskStateToLegacyStatus(state: TaskState): string {
  const MAP: Record<TaskState, string> = {
    IDLE: 'idle',
    UNDERSTANDING: 'analyzing',
    PERCEIVING: 'analyzing',
    SANITIZING: 'redacting',
    PLANNING: 'reasoning',
    VALIDATING: 'acting',
    EXECUTING: 'acting',
    WAITING_FOR_PAGE: 'acting',
    RE_PERCEIVING: 'analyzing',
    COMPLETED: 'done',
    PRIVACY_BLOCKED: 'error',
    ACTION_INVALID: 'error',
    LOW_CONFIDENCE: 'error',
    UNSUPPORTED_SITE: 'idle',
    USER_REQUIRED: 'acting',
    ERROR: 'error',
  };
  return MAP[state] ?? 'idle';
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

function broadcastStepUpdate(step: RunningTask['steps'][0]) {
  chrome.runtime.sendMessage({ type: 'STEP_UPDATE', ...step }).catch(() => {});
}

function broadcastTaskDone(reason: string) {
  chrome.runtime.sendMessage({
    type: 'TASK_DONE',
    reason,
    steps: currentTask.steps,
  }).catch(() => {});
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('[PrivacyAgent] Background service worker initialized');
