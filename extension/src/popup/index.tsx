/**
 * PrivSight — Extension Popup UI
 *
 * Features:
 * - Site compatibility indicator (SUPPORTED / PARTIAL / UNSUPPORTED)
 * - Task state machine display (14 states)
 * - Real-time step log with confidence badges
 * - Confidence-gated action approval (Approve / Skip)
 * - User input request dialog
 * - Privacy stats (PII detected, redacted, raw bytes = 0)
 * - Perception level indicator
 * - Works on current active tab (no hardcoded URL)
 */

import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import type { TaskState, SiteStatus, BrowserAction } from '../utils/types';

// ── TYPES ─────────────────────────────────────────────────────────────────────

interface StepInfo {
  step: number;
  label: string;
  status: string;
  action?: BrowserAction;
  latencyMs?: number;
  model?: string;
  confidence?: number;
  timestamp?: number;
}

interface ApprovalRequest {
  action: BrowserAction;
  actionId: string;
  confidence: number;
}

interface UserInputRequest {
  prompt: string;
  actionId: string;
}

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const TASK_STATE_LABELS: Record<TaskState, string> = {
  IDLE: 'Ready',
  UNDERSTANDING: '🧠 Understanding task…',
  PERCEIVING: '🔵 Perceiving DOM…',
  SANITIZING: '🟣 Sanitizing locally…',
  PLANNING: '🤖 LLM reasoning…',
  VALIDATING: '🔍 Validating action…',
  EXECUTING: '▶ Executing action…',
  WAITING_FOR_PAGE: '⏳ Waiting for page…',
  RE_PERCEIVING: '🔄 Re-perceiving…',
  COMPLETED: '✅ Completed',
  PRIVACY_BLOCKED: '🛑 Privacy Blocked',
  ACTION_INVALID: '⚠ Action Invalid',
  LOW_CONFIDENCE: '🟡 Low Confidence',
  UNSUPPORTED_SITE: '⊘ Unsupported Site',
  USER_REQUIRED: '👤 User Input Required',
  ERROR: '⚠ Task Error',
};

const TASK_STATE_COLORS: Record<TaskState, string> = {
  IDLE: '#10b981',
  UNDERSTANDING: '#a78bfa',
  PERCEIVING: '#22d3ee',
  SANITIZING: '#c084fc',
  PLANNING: '#60a5fa',
  VALIDATING: '#34d399',
  EXECUTING: '#3b82f6',
  WAITING_FOR_PAGE: '#94a3b8',
  RE_PERCEIVING: '#22d3ee',
  COMPLETED: '#10b981',
  PRIVACY_BLOCKED: '#dc2626',
  ACTION_INVALID: '#ef4444',
  LOW_CONFIDENCE: '#f59e0b',
  UNSUPPORTED_SITE: '#64748b',
  USER_REQUIRED: '#f59e0b',
  ERROR: '#ef4444',
};

const ACTION_COLORS: Record<string, string> = {
  fill: '#22d3ee', click: '#3b82f6', scroll: '#a78bfa',
  navigate: '#f59e0b', done: '#10b981', finish: '#10b981',
  wait: '#6b7280', select: '#ec4899', focus: '#8b5cf6',
  back: '#f97316', forward: '#f97316', ask_user: '#f59e0b',
};

const PERCEPTION_LABELS: Record<number, string> = {
  1: 'DOM + A11y',
  2: 'DOM + Text',
  3: 'DOM + OCR',
  4: 'Screenshot',
};

// ── SITE STATUS BADGE ─────────────────────────────────────────────────────────

function SiteBadge({ siteStatus }: { siteStatus: SiteStatus | null }) {
  if (!siteStatus) return null;

  const COMPAT = {
    full:         { icon: '✓', label: 'SUPPORTED WEBSITE', color: '#10b981', bg: '#10b98115' },
    partial:      { icon: '△', label: 'PARTIAL SUPPORT',   color: '#f59e0b', bg: '#f59e0b15' },
    experimental: { icon: '⚗', label: 'EXPERIMENTAL',      color: '#a78bfa', bg: '#a78bfa15' },
    unsupported:  { icon: '○', label: 'UNSUPPORTED',        color: '#64748b', bg: '#64748b15' },
  };

  const cfg = COMPAT[siteStatus.compatibility] ?? COMPAT.unsupported;

  return (
    <div style={{
      background: cfg.bg, border: `1px solid ${cfg.color}44`,
      borderRadius: 8, padding: '6px 10px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: cfg.color, fontWeight: 700, fontSize: 11 }}>{cfg.icon} {cfg.label}</span>
        {siteStatus.adapterName && (
          <span style={{ color: '#64748b', fontSize: 10, marginLeft: 'auto' }}>
            {siteStatus.adapterName}
          </span>
        )}
      </div>
      {siteStatus.compatibility === 'unsupported' && (
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>
          Generic perception available. Task execution may be limited.
        </div>
      )}
      {siteStatus.workflows && siteStatus.workflows.length > 0 && siteStatus.compatibility !== 'unsupported' && (
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
          Workflows: {siteStatus.workflows.join(' · ')}
        </div>
      )}
    </div>
  );
}

// ── APPROVAL DIALOG ────────────────────────────────────────────────────────────

function ApprovalDialog({
  request, onApprove, onSkip
}: { request: ApprovalRequest; onApprove: () => void; onSkip: () => void }) {
  const conf = Math.round(request.confidence * 100);
  return (
    <div style={{
      background: '#1e293b', border: '1px solid #f59e0b44', borderRadius: 10,
      padding: 12, marginBottom: 12,
    }}>
      <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, marginBottom: 6 }}>
        🟡 Action Confidence: {conf}% — Approval Requested
      </div>
      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>
        <span style={{ color: ACTION_COLORS[request.action.action] ?? '#64748b', fontWeight: 700, marginRight: 6 }}>
          {request.action.action.toUpperCase()}
        </span>
        {request.action.target?.value && (
          <span style={{ color: '#22d3ee' }}>{request.action.target.value}</span>
        )}
        {request.action.value && (
          <span style={{ color: '#f59e0b' }}> = "{request.action.value}"</span>
        )}
      </div>
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>{request.action.reason}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onApprove} style={{
          flex: 1, background: '#10b981', color: '#fff', border: 'none',
          borderRadius: 6, padding: '6px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer',
        }}>✓ Approve</button>
        <button onClick={onSkip} style={{
          flex: 1, background: '#374151', color: '#94a3b8', border: 'none',
          borderRadius: 6, padding: '6px 0', fontSize: 11, cursor: 'pointer',
        }}>✕ Skip</button>
      </div>
    </div>
  );
}

// ── USER INPUT DIALOG ─────────────────────────────────────────────────────────

function UserInputDialog({
  request, onSubmit
}: { request: UserInputRequest; onSubmit: (val: string) => void }) {
  const [val, setVal] = useState('');
  return (
    <div style={{
      background: '#1e293b', border: '1px solid #a78bfa44', borderRadius: 10,
      padding: 12, marginBottom: 12,
    }}>
      <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, marginBottom: 6 }}>
        👤 Agent requires your input
      </div>
      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8 }}>{request.prompt}</div>
      <input
        type="text"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSubmit(val)}
        placeholder="Type your response…"
        style={{
          width: '100%', background: '#0f1e3a', border: '1px solid #1e293b',
          borderRadius: 6, padding: '7px 10px', color: '#fff', fontSize: 11,
          boxSizing: 'border-box', outline: 'none', marginBottom: 8,
        }}
      />
      <button onClick={() => onSubmit(val)} style={{
        width: '100%', background: '#7c3aed', color: '#fff', border: 'none',
        borderRadius: 6, padding: '7px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer',
      }}>Submit</button>
    </div>
  );
}

// ── MAIN POPUP ────────────────────────────────────────────────────────────────

function Popup() {
  const [taskState, setTaskState]       = useState<TaskState>('IDLE');
  const [taskInput, setTaskInput]       = useState('');
  const [running, setRunning]           = useState(false);
  const [steps, setSteps]               = useState<StepInfo[]>([]);
  const [doneReason, setDoneReason]     = useState('');
  const [auditEvents, setAuditEvents]   = useState<any[]>([]);
  const [piiCount, setPiiCount]         = useState(0);
  const [siteStatus, setSiteStatus]     = useState<SiteStatus | null>(null);
  const [currentTabUrl, setCurrentTabUrl] = useState('');
  const [perceptionLevel, setPerceptionLevel] = useState<number>(1);
  const [approvalReq, setApprovalReq]   = useState<ApprovalRequest | null>(null);
  const [userInputReq, setUserInputReq] = useState<UserInputRequest | null>(null);
  const [autoShowPanel, setAutoShowPanel] = useState<boolean>(false);

  // ── On mount: get current tab + status ──────────────────────────────────────
  useEffect(() => {
    // Load persisted state
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
      if (!res) return;
      if (res.taskState) setTaskState(res.taskState);
      if (res.steps?.length) setSteps(res.steps);
      if (res.siteStatus) setSiteStatus(res.siteStatus);
      if (res.taskState !== 'IDLE' && res.taskState !== 'COMPLETED' && res.taskState !== 'ERROR') {
        setRunning(true);
      }
    });

    chrome.storage.local.get(['auditLog', 'autoShowFloatingPanel'], (r) => {
      if (r.auditLog) setAuditEvents(r.auditLog.slice(-6).reverse());
      setAutoShowPanel(!!r.autoShowFloatingPanel);
    });

    // Get current tab URL for site status
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.url) {
        setCurrentTabUrl(tab.url);
        // Request site status from background
        chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
          if (res?.siteStatus) setSiteStatus(res.siteStatus);
        });
      }
    });

    // ── Message listener ────────────────────────────────────────────────────
    const listener = (msg: any) => {
      if (!msg?.type) return;

      if (msg.type === 'STATUS_UPDATE' || msg.type === 'TASK_STATE_CHANGE') {
        const state: TaskState = msg.taskState ?? (msg.status === 'done' ? 'COMPLETED' :
          msg.status === 'error' ? 'ERROR' : 'IDLE');
        setTaskState(state);
        if (['IDLE', 'COMPLETED', 'ERROR', 'PRIVACY_BLOCKED'].includes(state)) {
          setRunning(false);
          setApprovalReq(null);
        }
      }

      if (msg.type === 'STEP_UPDATE') {
        setSteps(prev => {
          const idx = prev.findIndex(s => s.step === msg.step);
          const entry: StepInfo = {
            step: msg.step, label: msg.label, status: msg.status,
            action: msg.action, latencyMs: msg.latencyMs, model: msg.model,
            confidence: msg.confidence, timestamp: Date.now(),
          };
          if (idx >= 0) { const next = [...prev]; next[idx] = entry; return next; }
          return [...prev, entry];
        });
        if (msg.action?.piiCount) setPiiCount((c: number) => c + 1);
      }

      if (msg.type === 'AUDIT_EVENT') {
        setAuditEvents((prev: any[]) => [msg.event, ...prev].slice(0, 6));
        if (msg.event?.piiType) setPiiCount((c: number) => c + 1);
      }

      if (msg.type === 'TASK_DONE') {
        setRunning(false);
        setTaskState('COMPLETED');
        setDoneReason(msg.reason ?? 'Task completed.');
        if (msg.steps) setSteps(msg.steps);
        setApprovalReq(null);
      }

      if (msg.type === 'SITE_STATUS') {
        setSiteStatus(msg.siteStatus);
      }

      if (msg.type === 'ACTION_APPROVAL_REQUEST') {
        setApprovalReq({ action: msg.action, actionId: msg.actionId, confidence: msg.confidence });
      }

      if (msg.type === 'USER_INPUT_REQUEST') {
        setUserInputReq({ prompt: msg.prompt, actionId: msg.actionId });
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────

  const startTask = useCallback(() => {
    if (!taskInput.trim() || running) return;
    setRunning(true);
    setTaskState('UNDERSTANDING');
    setSteps([]);
    setPiiCount(0);
    setDoneReason('');
    setApprovalReq(null);
    setUserInputReq(null);

    // No hardcoded URL — agent works on whatever tab is active
    chrome.runtime.sendMessage({
      type: 'START_TASK',
      instruction: taskInput,
    }, (res) => {
      if (!res?.ok) {
        setRunning(false);
        setTaskState('IDLE');
      }
    });
  }, [taskInput, running]);

  const stopTask = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'STOP_TASK' });
    setRunning(false);
    setTaskState('IDLE');
    setApprovalReq(null);
  }, []);

  const handleApprove = useCallback(() => {
    if (!approvalReq) return;
    chrome.runtime.sendMessage({
      type: 'ACTION_APPROVAL_RESPONSE',
      approved: true,
      actionId: approvalReq.actionId,
    });
    setApprovalReq(null);
  }, [approvalReq]);

  const handleSkip = useCallback(() => {
    if (!approvalReq) return;
    chrome.runtime.sendMessage({
      type: 'ACTION_APPROVAL_RESPONSE',
      approved: false,
      actionId: approvalReq.actionId,
    });
    setApprovalReq(null);
  }, [approvalReq]);

  const handleUserInput = useCallback((val: string) => {
    if (!userInputReq) return;
    chrome.runtime.sendMessage({
      type: 'USER_INPUT_RESPONSE',
      value: val,
      actionId: userInputReq.actionId,
    });
    setUserInputReq(null);
  }, [userInputReq]);

  const handleToggleOnPagePanel = useCallback(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_FLOATING_PANEL', show: true });
      }
    });
    // Immediately dismiss the Chrome popup so the user can see and interact with the on-page panel
    window.close();
  }, []);

  const handleAnalyzePage = useCallback(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { type: 'ANALYZE_PAGE', forceRefresh: true }, (res) => {
          if (res?.context?.piiSummary) {
            const count = res.context.piiSummary.totalRedacted || res.context.piiSummary.totalDetected || 0;
            setPiiCount(count);
          }
        });
      }
    });
  }, []);

  const handleToggleAutoShow = useCallback((enabled: boolean) => {
    setAutoShowPanel(enabled);
    chrome.storage.local.set({ autoShowFloatingPanel: enabled });
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────

  // Effective state for display: when idle and not running, always show IDLE style
  const displayState: TaskState = (!running && taskState === 'ERROR') ? 'ERROR' :
    (!running && !['COMPLETED', 'ERROR', 'PRIVACY_BLOCKED'].includes(taskState)) ? 'IDLE' :
    taskState;
  const stateColor = TASK_STATE_COLORS[displayState] ?? '#64748b';
  const stateLabel = TASK_STATE_LABELS[displayState] ?? displayState;
  const lastStep = steps[steps.length - 1];
  // Only show error banner if task just ended with an error (not during idle)
  const isErrorState = !running && ['PRIVACY_BLOCKED', 'ACTION_INVALID', 'LOW_CONFIDENCE', 'ERROR'].includes(taskState);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      fontFamily: "'Inter', sans-serif", width: 390, minHeight: 520,
      background: '#0a0f1e', color: '#e2e8f0', padding: 16, boxSizing: 'border-box',
    }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
        paddingBottom: 12, borderBottom: '1px solid #1e293b',
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          background: 'linear-gradient(135deg,#22d3ee,#2563eb)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
        }}>🛡️</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#fff', letterSpacing: '-0.3px' }}>PrivSight</div>
          <div style={{ fontSize: 10, color: '#64748b' }}>On-Device Privacy · LLM Reasoning</div>
        </div>
        <div style={{
          marginLeft: 'auto', fontSize: 10, color: stateColor, fontWeight: 700,
          background: `${stateColor}18`, padding: '3px 8px', borderRadius: 6,
          border: `1px solid ${stateColor}44`, maxWidth: 130, textAlign: 'right',
        }}>
          {stateLabel}
        </div>
      </div>

      {/* On-Page Floating Panel Controls */}
      <div style={{
        background: '#0f1e3a', borderRadius: 8, padding: '7px 10px',
        marginBottom: 10, border: '1px solid #1e3a5f',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12 }}>📌</span>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#f1f5f9' }}>On-Page Overlay</div>
            <div style={{ fontSize: 8, color: '#64748b' }}>
              {autoShowPanel ? 'Auto-shows on supported sites' : 'Muted (won\'t pop out)'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={handleToggleOnPagePanel}
            style={{
              background: '#1e293b', color: '#22d3ee', border: '1px solid #334155',
              borderRadius: 5, padding: '3px 8px', fontSize: 9, fontWeight: 700,
              cursor: 'pointer',
            }}
            title="Launch on-page floating agent panel (Alt+Shift+P)"
          >
            Launch Floating Panel
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#94a3b8', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={autoShowPanel}
              onChange={(e) => handleToggleAutoShow(e.target.checked)}
            />
            Auto-open
          </label>
        </div>
      </div>

      {/* Site Compatibility Badge */}
      <SiteBadge siteStatus={siteStatus} />

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
        {[
          { label: 'Steps Run', value: steps.length, color: '#22d3ee' },
          { label: 'PII Redacted', value: piiCount, color: '#f59e0b' },
          { label: 'Raw Sent (B)', value: 0, color: '#10b981' },
        ].map(s => (
          <div key={s.label} style={{
            background: '#0f1e3a', borderRadius: 8, padding: '10px 8px',
            textAlign: 'center', border: '1px solid #1e293b',
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
            <div style={{ fontSize: 9, color: '#64748b', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Perception Level + Next Action */}
      {running && lastStep && (
        <div style={{
          background: '#0f1e3a', borderRadius: 8, padding: '8px 12px',
          marginBottom: 10, border: '1px solid #1e293b', fontSize: 10,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: '#64748b' }}>
            Perception: <span style={{ color: '#22d3ee' }}>{PERCEPTION_LABELS[perceptionLevel] ?? 'DOM'}</span>
          </span>
          {lastStep.confidence != null && (
            <span style={{ color: lastStep.confidence >= 0.9 ? '#10b981' : lastStep.confidence >= 0.7 ? '#f59e0b' : '#ef4444' }}>
              Confidence: {Math.round(lastStep.confidence * 100)}%
            </span>
          )}
        </div>
      )}

      {/* Approval Request */}
      {approvalReq && (
        <ApprovalDialog request={approvalReq} onApprove={handleApprove} onSkip={handleSkip} />
      )}

      {/* User Input Request */}
      {userInputReq && (
        <UserInputDialog request={userInputReq} onSubmit={handleUserInput} />
      )}

      {/* Task Input */}
      <div style={{ marginBottom: 12 }}>
        <input
          type="text"
          value={taskInput}
          onChange={e => setTaskInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && startTask()}
          placeholder="e.g. Search Wikipedia for ISRO"
          disabled={running}
          style={{
            width: '100%', background: '#0f1e3a', border: '1px solid #1e293b',
            borderRadius: 8, padding: '9px 12px', color: '#fff', fontSize: 12,
            boxSizing: 'border-box', outline: 'none', opacity: running ? 0.6 : 1,
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            onClick={handleAnalyzePage}
            disabled={running}
            style={{
              flex: 1, background: '#1e293b',
              color: '#38bdf8', border: '1px solid #334155', borderRadius: 8,
              padding: '9px 0', fontSize: 11, fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.2s',
            }}
            title="Scan current page and display on-screen privacy overlays"
          >
            🔍 Scan & Redact Page
          </button>
          <button
            onClick={startTask}
            disabled={running || !taskInput.trim()}
            style={{
              flex: 1.2, background: running ? '#0f2a3a' : '#0891b2',
              color: running ? '#64748b' : '#fff', border: 'none', borderRadius: 8,
              padding: '9px 0', fontSize: 12, fontWeight: 700,
              cursor: running ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
            }}
          >
            {running ? stateLabel : '▶ Run Task'}
          </button>
          {running && (
            <button
              onClick={stopTask}
              style={{
                background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: 8,
                padding: '9px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >■ Stop</button>
          )}
        </div>
      </div>

      {/* Error / Privacy Block banner */}
      {isErrorState && doneReason && (
        <div style={{
          background: '#7f1d1d22', border: '1px solid #ef4444',
          borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 10, color: '#fca5a5',
        }}>
          {taskState === 'PRIVACY_BLOCKED' ? '🛑' : '⚠'} <strong>{taskState.replace('_', ' ')}:</strong>{' '}
          {doneReason}
        </div>
      )}

      {/* Completed banner */}
      {taskState === 'COMPLETED' && doneReason && (
        <div style={{
          background: '#10b98122', border: '1px solid #10b981',
          borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 11, color: '#10b981',
        }}>
          ✅ <strong>Task Done:</strong> {doneReason}
        </div>
      )}

      {/* Live Steps */}
      {steps.length > 0 && (
        <div style={{
          background: '#0f1e3a', borderRadius: 8, border: '1px solid #1e293b',
          overflow: 'hidden', marginBottom: 10,
        }}>
          <div style={{
            padding: '5px 12px', borderBottom: '1px solid #1e293b',
            fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px',
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>Execution Steps</span>
            <span style={{ color: '#22d3ee' }}>{steps.length} steps</span>
          </div>
          <div style={{ maxHeight: 150, overflowY: 'auto' }}>
            {steps.map((s, i) => {
              const ac = s.action?.action ?? '';
              const clr = ACTION_COLORS[ac] ?? '#64748b';
              const conf = s.confidence != null ? Math.round(s.confidence * 100) : null;
              return (
                <div key={i} style={{
                  padding: '5px 12px', borderBottom: '1px solid #0a0f1e',
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, background: `${clr}22`, color: clr,
                    border: `1px solid ${clr}44`, borderRadius: 4, padding: '1px 5px',
                    textTransform: 'uppercase', flexShrink: 0, marginTop: 1,
                  }}>{ac || s.status}</span>
                  <span style={{
                    fontSize: 10, color: '#94a3b8', flex: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {s.action?.target?.value
                      ? <span style={{ color: '#22d3ee' }}>{s.action.target.value.slice(0, 30)}</span>
                      : <span>{s.label.slice(0, 40)}</span>
                    }
                    {s.action?.value && (
                      <span style={{ color: '#f59e0b' }}> = "{s.action.value.slice(0, 20)}"</span>
                    )}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                    {s.latencyMs != null && (
                      <span style={{ fontSize: 9, color: '#475569' }}>{s.latencyMs}ms</span>
                    )}
                    {conf != null && (
                      <span style={{
                        fontSize: 8, color: conf >= 90 ? '#10b981' : conf >= 70 ? '#f59e0b' : '#ef4444',
                      }}>{conf}%</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Audit log */}
      {auditEvents.length > 0 && (
        <div style={{
          background: '#0f1e3a', borderRadius: 8, border: '1px solid #1e293b',
          overflow: 'hidden', marginBottom: 10,
        }}>
          <div style={{
            padding: '5px 12px', borderBottom: '1px solid #1e293b',
            fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>Privacy Audit Log</div>
          <div style={{ maxHeight: 80, overflowY: 'auto' }}>
            {auditEvents.slice(0, 5).map((ev, i) => (
              <div key={i} style={{
                padding: '4px 12px', fontSize: 10, color: '#475569',
                borderBottom: '1px solid #0a0f1e', display: 'flex', gap: 8, overflow: 'hidden',
              }}>
                <span style={{ color: '#22d3ee', fontFamily: 'monospace', flexShrink: 0 }}>
                  {new Date(ev.timestamp).toLocaleTimeString()}
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.detail}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <a href="http://localhost:5173" target="_blank" style={{ color: '#22d3ee', fontSize: 11, textDecoration: 'none' }}>
          Open Dashboard →
        </a>
        <span style={{ fontSize: 10, color: '#1e293b' }}>
          {currentTabUrl ? new URL(currentTabUrl).hostname.slice(0, 25) : ''}
        </span>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><Popup /></React.StrictMode>);
