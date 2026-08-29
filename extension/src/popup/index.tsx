import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

interface State {
  agentStatus: string;
  privacyStatus: string;
  piiCount: number;
  task: string;
  sessionId: string;
  auditLog: Array<{ type: string; detail: string; timestamp: number }>;
}

function Popup() {
  const [state, setState] = useState<State>({
    agentStatus: 'idle', privacyStatus: 'protected', piiCount: 0, task: '', sessionId: '', auditLog: []
  });
  const [taskInput, setTaskInput] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
      if (res) setState(s => ({ ...s, ...res }));
    });
    chrome.storage.local.get(['auditLog'], (result) => {
      if (result.auditLog) setState(s => ({ ...s, auditLog: result.auditLog.slice(-10) }));
    });
    const listener = (msg: any) => {
      if (msg.type === 'STATUS_UPDATE') setState(s => ({ ...s, agentStatus: msg.status, privacyStatus: msg.privacyStatus, piiCount: msg.piiCount }));
      if (msg.type === 'AUDIT_EVENT') setState(s => ({ ...s, auditLog: [...s.auditLog.slice(-9), msg.event] }));
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const startTask = () => {
    if (!taskInput.trim()) return;
    const sessionId = `session-${Date.now()}`;
    chrome.runtime.sendMessage({ type: 'START_TASK', instruction: taskInput, sessionId }, (res) => {
      if (res?.ok) { setState(s => ({ ...s, task: taskInput, sessionId })); setStatusMessage('Task started!'); setTaskInput(''); }
    });
  };

  const analyzeNow = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'ANALYZE_PAGE' }, (res) => {
          if (res?.piiEntities) setState(s => ({ ...s, piiCount: res.piiEntities.length }));
        });
      }
    });
  };

  const statusColors: Record<string, string> = {
    protected: '#10b981', analyzing: '#22d3ee', blocked: '#ef4444', unknown: '#6b7280'
  };

  const privColor = statusColors[state.privacyStatus] ?? '#6b7280';

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", width: 380, minHeight: 480, background: '#0a0f1e', color: '#e2e8f0', padding: '16px', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #1e293b' }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #22d3ee, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🛡️</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>PrivacyAgent</div>
          <div style={{ fontSize: 10, color: '#64748b' }}>On-Device Visual Perception</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: privColor, display: 'inline-block', animation: 'pulse 2s infinite' }} />
          <span style={{ fontSize: 11, color: privColor, fontWeight: 600, textTransform: 'uppercase' }}>{state.privacyStatus}</span>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'PII Detected', value: state.piiCount, color: '#f59e0b' },
          { label: 'PII Redacted', value: state.piiCount, color: '#10b981' },
          { label: 'Raw Sent',     value: 0,              color: '#10b981' },
        ].map(s => (
          <div key={s.label} style={{ background: '#0f1e3a', borderRadius: 8, padding: '10px 8px', textAlign: 'center', border: '1px solid #1e293b' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
            <div style={{ fontSize: 9, color: '#64748b', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Task Input */}
      <div style={{ marginBottom: 12 }}>
        <input
          type="text"
          value={taskInput}
          onChange={e => setTaskInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && startTask()}
          placeholder="e.g. Find cheapest flight Delhi to Mumbai"
          style={{ width: '100%', background: '#0f1e3a', border: '1px solid #1e293b', borderRadius: 8, padding: '9px 12px', color: '#fff', fontSize: 12, boxSizing: 'border-box', outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            onClick={startTask}
            style={{ flex: 1, background: '#0891b2', color: '#fff', border: 'none', borderRadius: 8, padding: '9px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >▶ Run Task</button>
          <button
            onClick={analyzeNow}
            style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 8, padding: '9px 14px', fontSize: 12, cursor: 'pointer' }}
          >🔍 Analyze</button>
        </div>
      </div>

      {/* Recent Audit Events */}
      <div style={{ background: '#0f1e3a', borderRadius: 8, border: '1px solid #1e293b', overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e293b', fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Recent Privacy Events</div>
        <div style={{ maxHeight: 180, overflowY: 'auto', padding: '4px 0' }}>
          {state.auditLog.length === 0 ? (
            <div style={{ padding: '16px 12px', fontSize: 11, color: '#475569', textAlign: 'center' }}>Click Analyze to detect PII on this page</div>
          ) : state.auditLog.slice(-6).reverse().map((ev, i) => (
            <div key={i} style={{ padding: '5px 12px', fontSize: 10, color: '#94a3b8', borderBottom: '1px solid #0f1e3a', display: 'flex', gap: 8 }}>
              <span style={{ color: '#22d3ee', fontFamily: 'monospace' }}>{new Date(ev.timestamp).toLocaleTimeString()}</span>
              <span style={{ flex: 1, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.detail}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Open Dashboard */}
      <div style={{ marginTop: 12, textAlign: 'center' }}>
        <a href="http://localhost:5173" target="_blank" style={{ color: '#22d3ee', fontSize: 11, textDecoration: 'none' }}>
          Open Full Dashboard →
        </a>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><Popup /></React.StrictMode>);
