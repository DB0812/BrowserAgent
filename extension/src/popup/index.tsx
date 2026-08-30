import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

interface StepInfo {
  step: number;
  label: string;
  status: string;
  action?: any;
  latencyMs?: number;
  model?: string;
  timestamp?: number;
}

function Popup() {
  const [agentStatus, setAgentStatus] = useState('idle');
  const [taskInput, setTaskInput]     = useState('');
  const [running, setRunning]         = useState(false);
  const [steps, setSteps]             = useState<StepInfo[]>([]);
  const [done, setDone]               = useState(false);
  const [doneReason, setDoneReason]   = useState('');
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [piiCount, setPiiCount]       = useState(0);

  useEffect(() => {
    // Load persisted state on open
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
      if (!res) return;
      setAgentStatus(res.agentStatus ?? 'idle');
      if (res.steps?.length) setSteps(res.steps);
    });
    chrome.storage.local.get(['auditLog'], (r) => {
      if (r.auditLog) setAuditEvents(r.auditLog.slice(-6).reverse());
    });

    const listener = (msg: any) => {
      if (msg.type === 'STATUS_UPDATE') {
        setAgentStatus(msg.status);
        if (msg.status === 'idle' || msg.status === 'done' || msg.status === 'error') setRunning(false);
      }
      if (msg.type === 'STEP_UPDATE') {
        setSteps(prev => {
          const idx = prev.findIndex(s => s.step === msg.step);
          const entry: StepInfo = { step: msg.step, label: msg.label, status: msg.status, action: msg.action, latencyMs: msg.latencyMs, model: msg.model, timestamp: Date.now() };
          if (idx >= 0) { const next = [...prev]; next[idx] = entry; return next; }
          return [...prev, entry];
        });
        if (msg.action) setPiiCount(c => c + 1);
      }
      if (msg.type === 'AUDIT_EVENT') {
        setAuditEvents(prev => [msg.event, ...prev].slice(0, 6));
      }
      if (msg.type === 'TASK_DONE') {
        setRunning(false);
        setDone(true);
        setDoneReason(msg.reason ?? 'Task completed.');
        if (msg.steps) setSteps(msg.steps);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const startTask = () => {
    if (!taskInput.trim() || running) return;
    setRunning(true);
    setDone(false);
    setSteps([]);
    setPiiCount(0);
    chrome.runtime.sendMessage({
      type: 'START_TASK',
      instruction: taskInput,
      targetUrl: 'http://localhost:3000',
    }, (res) => {
      if (!res?.ok) setRunning(false);
    });
  };

  const statusLabel: Record<string, string> = {
    idle: 'Idle',
    analyzing: '🔵 Analyzing DOM…',
    detecting: '🟠 Detecting PII…',
    redacting: '🟣 Redacting locally…',
    sending: '🔼 Sending to LLM…',
    reasoning: '🤖 Gemini reasoning…',
    acting: '▶ Executing action…',
    done: '✅ Done',
    error: '❌ Error',
  };

  const actionColors: Record<string, string> = {
    fill: '#22d3ee', click: '#3b82f6', scroll: '#a78bfa',
    navigate: '#f59e0b', done: '#10b981', wait: '#6b7280',
  };

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", width: 380, minHeight: 500, background: '#0a0f1e', color: '#e2e8f0', padding: 16, boxSizing: 'border-box' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid #1e293b' }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#22d3ee,#2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🛡️</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>PrivacyAgent</div>
          <div style={{ fontSize: 10, color: '#64748b' }}>On-Device Perception · LLM Reasoning</div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: agentStatus === 'done' ? '#10b981' : agentStatus === 'error' ? '#ef4444' : '#22d3ee', fontWeight: 600, background: '#0f1e3a', padding: '3px 8px', borderRadius: 6, border: '1px solid #1e293b' }}>
          {statusLabel[agentStatus] ?? agentStatus}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Steps Run', value: steps.length, color: '#22d3ee' },
          { label: 'PII Redacted', value: piiCount, color: '#f59e0b' },
          { label: 'Raw Sent (B)', value: 0, color: '#10b981' },
        ].map(s => (
          <div key={s.label} style={{ background: '#0f1e3a', borderRadius: 8, padding: '10px 8px', textAlign: 'center', border: '1px solid #1e293b' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
            <div style={{ fontSize: 9, color: '#64748b', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Task Input */}
      <div style={{ marginBottom: 14 }}>
        <input
          type="text"
          value={taskInput}
          onChange={e => setTaskInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && startTask()}
          placeholder="e.g. Find cheapest flight Delhi to Mumbai"
          disabled={running}
          style={{ width: '100%', background: '#0f1e3a', border: '1px solid #1e293b', borderRadius: 8, padding: '9px 12px', color: '#fff', fontSize: 12, boxSizing: 'border-box', outline: 'none', opacity: running ? 0.6 : 1 }}
        />
        <button
          onClick={startTask}
          disabled={running || !taskInput.trim()}
          style={{ marginTop: 8, width: '100%', background: running ? '#0f2a3a' : '#0891b2', color: running ? '#64748b' : '#fff', border: 'none', borderRadius: 8, padding: '10px', fontSize: 12, fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', transition: 'all 0.2s', letterSpacing: '0.3px' }}
        >
          {running ? `${statusLabel[agentStatus] ?? 'Running…'}` : '▶ Run Task on Demo Page'}
        </button>
        <div style={{ fontSize: 10, color: '#475569', textAlign: 'center', marginTop: 6 }}>
          Opens demo-site, analyzes real DOM, calls Gemini, executes actions
        </div>
      </div>

      {/* Live Steps */}
      {steps.length > 0 && (
        <div style={{ background: '#0f1e3a', borderRadius: 8, border: '1px solid #1e293b', overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ padding: '6px 12px', borderBottom: '1px solid #1e293b', fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Live Execution Steps</span>
            <span style={{ color: '#22d3ee' }}>{steps.length} steps</span>
          </div>
          <div style={{ maxHeight: 160, overflowY: 'auto' }}>
            {steps.map((s, i) => {
              const ac = s.action?.action ?? '';
              const clr = actionColors[ac] ?? '#64748b';
              return (
                <div key={i} style={{ padding: '6px 12px', borderBottom: '1px solid #0a0f1e', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, background: clr + '22', color: clr, border: `1px solid ${clr}44`, borderRadius: 4, padding: '1px 5px', textTransform: 'uppercase', flexShrink: 0, marginTop: 1 }}>
                    {ac || s.status}
                  </span>
                  <span style={{ fontSize: 10, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.action?.target?.value ? <span style={{ color: '#22d3ee' }}>{s.action.target.value}</span> : null}
                    {s.action?.value ? <span style={{ color: '#f59e0b' }}> = "{s.action.value}"</span> : null}
                    {!s.action?.target?.value && <span>{s.label}</span>}
                  </span>
                  {s.latencyMs != null && <span style={{ fontSize: 9, color: '#475569', flexShrink: 0 }}>{s.latencyMs}ms</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Done banner */}
      {done && (
        <div style={{ background: '#10b98122', border: '1px solid #10b981', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 11, color: '#10b981' }}>
          ✅ <strong>Task Done:</strong> {doneReason}
        </div>
      )}

      {/* Audit log */}
      {auditEvents.length > 0 && (
        <div style={{ background: '#0f1e3a', borderRadius: 8, border: '1px solid #1e293b', overflow: 'hidden' }}>
          <div style={{ padding: '6px 12px', borderBottom: '1px solid #1e293b', fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Privacy Audit Log</div>
          <div style={{ maxHeight: 100, overflowY: 'auto' }}>
            {auditEvents.slice(0, 5).map((ev, i) => (
              <div key={i} style={{ padding: '4px 12px', fontSize: 10, color: '#475569', borderBottom: '1px solid #0a0f1e', display: 'flex', gap: 8, overflow: 'hidden' }}>
                <span style={{ color: '#22d3ee', fontFamily: 'monospace', flexShrink: 0 }}>{new Date(ev.timestamp).toLocaleTimeString()}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 12, textAlign: 'center' }}>
        <a href="http://localhost:5173" target="_blank" style={{ color: '#22d3ee', fontSize: 11, textDecoration: 'none' }}>Open Dashboard →</a>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><Popup /></React.StrictMode>);
