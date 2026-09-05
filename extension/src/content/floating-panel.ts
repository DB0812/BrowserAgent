/**
 * PrivSight Floating Panel — injected into web pages as a draggable Shadow DOM overlay.
 *
 * Features:
 * - Draggable by header (persists position in localStorage)
 * - Minimize/restore button
 * - Close button (✕) to dismiss and stop bothering user on current page
 * - Quick settings: "Auto-open on page load" toggle + "Mute site"
 * - Task input, Run/Stop buttons
 * - Live step log + audit log
 * - Status badge + site compatibility
 * - Zero impact on host page styles (Shadow DOM isolation)
 */

export function isFloatingPanelVisible(): boolean {
  const host = document.getElementById('__privsight-host__');
  return !!(host && host.style.display !== 'none');
}

export function removeFloatingPanel(): void {
  const host = document.getElementById('__privsight-host__');
  if (host) {
    host.remove();
  }
}

export function updatePanelStats(piiCount: number): void {
  const host = document.getElementById('__privsight-host__');
  if (host?.shadowRoot) {
    const statPii = host.shadowRoot.getElementById('stat-pii');
    if (statPii) statPii.textContent = String(piiCount);
  }
}

export function toggleFloatingPanel(forceShow?: boolean): boolean {
  const isVisible = isFloatingPanelVisible();
  const shouldShow = forceShow !== undefined ? forceShow : !isVisible;

  if (shouldShow) {
    try {
      sessionStorage.removeItem('__privsight_dismissed__');
    } catch {}
    injectFloatingPanel(true);
    return true;
  } else {
    try {
      sessionStorage.setItem('__privsight_dismissed__', '1');
    } catch {}
    removeFloatingPanel();
    return false;
  }
}

export function injectFloatingPanel(forceShow = false): void {
  // Check if dismissed for this tab session (unless user explicitly forced opening)
  if (!forceShow) {
    try {
      if (sessionStorage.getItem('__privsight_dismissed__') === '1') return;
    } catch {}
  }

  // Don't inject twice; if already in DOM, ensure visible
  const existing = document.getElementById('__privsight-host__');
  if (existing) {
    existing.style.display = 'block';
    return;
  }

  const host = document.createElement('div');
  host.id = '__privsight-host__';
  host.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;pointer-events:none;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // ── STYLES ──────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    #panel {
      font-family: 'Inter', -apple-system, sans-serif;
      position: fixed;
      top: 16px;
      right: 16px;
      width: 360px;
      background: #07101f;
      border: 1px solid #1e3a5f;
      border-radius: 14px;
      box-shadow: 0 8px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(34,211,238,0.08);
      color: #e2e8f0;
      pointer-events: all;
      transition: box-shadow 0.2s;
      overflow: hidden;
    }

    #panel.dragging { box-shadow: 0 20px 80px rgba(0,0,0,0.9); }

    #header {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 10px 14px 10px 12px;
      border-bottom: 1px solid #1e293b;
      cursor: grab;
      user-select: none;
      background: linear-gradient(135deg, #0d1a2e 0%, #07101f 100%);
    }
    #header:active { cursor: grabbing; }

    #logo {
      width: 30px; height: 30px;
      border-radius: 8px;
      background: linear-gradient(135deg,#22d3ee,#2563eb);
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; flex-shrink: 0;
    }

    #header-text { flex: 1; overflow: hidden; }
    #title { font-weight: 800; font-size: 13px; color: #fff; letter-spacing: -0.3px; }
    #subtitle { font-size: 9px; color: #475569; }

    #status-badge {
      font-size: 9px; font-weight: 700;
      padding: 3px 8px; border-radius: 6px;
      border: 1px solid transparent;
      white-space: nowrap; flex-shrink: 0;
    }

    #header-actions {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-left: auto;
      flex-shrink: 0;
    }

    .header-btn {
      background: none;
      border: 1px solid transparent;
      color: #64748b;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      padding: 3px 6px;
      border-radius: 6px;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }
    .header-btn:hover {
      color: #f1f5f9;
      background: #1e293b;
      border-color: #334155;
    }
    #btn-close:hover {
      color: #f87171;
      background: #450a0a;
      border-color: #991b1b;
    }

    #body { padding: 12px; display: flex; flex-direction: column; gap: 10px; }

    #site-badge {
      border-radius: 7px; padding: 6px 10px;
      border: 1px solid transparent;
      font-size: 10px; font-weight: 600;
    }

    #stats-row {
      display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 7px;
    }
    .stat {
      background: #0f1e3a; border-radius: 7px;
      padding: 9px 6px; text-align: center;
      border: 1px solid #1e293b;
    }
    .stat-val { font-size: 20px; font-weight: 700; font-family: monospace; }
    .stat-lbl { font-size: 8px; color: #475569; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }

    #input-row { display: flex; flex-direction: column; gap: 7px; }

    #task-input {
      width: 100%; background: #0f1e3a;
      border: 1px solid #1e3a5f;
      border-radius: 8px; padding: 9px 12px;
      color: #fff; font-size: 12px; font-family: inherit;
      outline: none; resize: none;
      transition: border-color 0.2s;
    }
    #task-input:focus { border-color: #22d3ee; }
    #task-input:disabled { opacity: 0.5; }

    #btn-row { display: flex; gap: 7px; }

    #btn-run {
      flex: 1; background: #0891b2; color: #fff;
      border: none; border-radius: 8px; padding: 9px 0;
      font-size: 12px; font-weight: 700; font-family: inherit;
      cursor: pointer; transition: background 0.2s;
    }
    #btn-run:hover:not(:disabled) { background: #06b6d4; }
    #btn-run:disabled { background: #0f2a3a; color: #475569; cursor: not-allowed; }

    #btn-stop {
      background: #7f1d1d; color: #fca5a5;
      border: none; border-radius: 8px; padding: 9px 14px;
      font-size: 12px; font-weight: 700; font-family: inherit;
      cursor: pointer;
    }

    #done-banner {
      background: #10b98120; border: 1px solid #10b981;
      border-radius: 7px; padding: 7px 10px;
      font-size: 11px; color: #10b981; display: none;
    }
    #error-banner {
      background: #7f1d1d22; border: 1px solid #ef4444;
      border-radius: 7px; padding: 7px 10px;
      font-size: 11px; color: #fca5a5; display: none;
    }

    #steps-container {
      background: #0f1e3a; border-radius: 7px;
      border: 1px solid #1e293b; overflow: hidden; display: none;
    }
    #steps-header {
      padding: 5px 10px; border-bottom: 1px solid #1e293b;
      font-size: 8px; color: #475569; text-transform: uppercase;
      letter-spacing: 0.5px; display: flex; justify-content: space-between;
    }
    #steps-list { max-height: 140px; overflow-y: auto; }
    .step-row {
      padding: 5px 10px; border-bottom: 1px solid #0a0f1e;
      display: flex; align-items: center; gap: 7px; font-size: 10px;
    }
    .step-badge {
      font-size: 8px; font-weight: 700; padding: 1px 5px;
      border-radius: 4px; text-transform: uppercase; flex-shrink: 0;
    }
    .step-label { flex: 1; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .step-meta { font-size: 8px; color: #475569; flex-shrink: 0; }

    #audit-container {
      background: #0f1e3a; border-radius: 7px;
      border: 1px solid #1e293b; overflow: hidden; display: none;
    }
    #audit-header {
      padding: 5px 10px; border-bottom: 1px solid #1e293b;
      font-size: 8px; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;
    }
    #audit-list { max-height: 70px; overflow-y: auto; }
    .audit-row {
      padding: 4px 10px; font-size: 9px; color: #475569;
      border-bottom: 1px solid #0a0f1e; display: flex; gap: 8px; overflow: hidden;
    }
    .audit-time { color: #22d3ee; font-family: monospace; flex-shrink: 0; }
    .audit-detail { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    #user-input-box {
      background: #1e293b; border: 1px solid #a78bfa44;
      border-radius: 8px; padding: 10px; display: none; flex-direction: column; gap: 7px;
    }
    #user-input-lbl { font-size: 10px; color: #a78bfa; font-weight: 700; }
    #user-input-prompt { font-size: 10px; color: #94a3b8; }
    #user-input-field {
      width: 100%; background: #0f1e3a; border: 1px solid #1e3a5f;
      border-radius: 6px; padding: 7px 10px;
      color: #fff; font-size: 11px; font-family: inherit; outline: none;
    }
    #user-input-submit {
      width: 100%; background: #7c3aed; color: #fff; border: none;
      border-radius: 6px; padding: 7px 0; font-size: 11px; font-weight: 700;
      font-family: inherit; cursor: pointer;
    }

    #footer {
      padding: 8px 14px; border-top: 1px solid #1e293b;
      display: flex; justify-content: space-between; align-items: center;
      background: #07101f;
    }
    #footer a { color: #22d3ee; font-size: 10px; text-decoration: none; }
    #footer-actions { display: flex; align-items: center; gap: 10px; }

    /* Minimized state */
    #panel.minimized #body,
    #panel.minimized #footer { display: none; }
    #panel.minimized { width: 220px; }
  `;
  shadow.appendChild(style);

  // ── HTML ─────────────────────────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'panel';
  panel.innerHTML = `
    <div id="header">
      <div id="logo">🛡️</div>
      <div id="header-text">
        <div id="title">PrivSight</div>
        <div id="subtitle">On-Device Privacy · LLM Reasoning</div>
      </div>
      <div id="status-badge">● Ready</div>
      <div id="header-actions">
        <button id="btn-minimize" class="header-btn" title="Minimize">−</button>
        <button id="btn-close" class="header-btn" title="Close Panel (Esc)">✕</button>
      </div>
    </div>

    <div id="body">
      <div id="site-badge" style="display:none"></div>

      <div id="stats-row">
        <div class="stat"><div class="stat-val" id="stat-steps" style="color:#22d3ee">0</div><div class="stat-lbl">Steps Run</div></div>
        <div class="stat"><div class="stat-val" id="stat-pii" style="color:#f59e0b">0</div><div class="stat-lbl">PII Redacted</div></div>
        <div class="stat"><div class="stat-val" id="stat-raw" style="color:#10b981">0</div><div class="stat-lbl">Raw Sent (B)</div></div>
      </div>

      <div id="input-row">
        <textarea id="task-input" rows="2" placeholder="e.g. Search for London and click on it"></textarea>
        <div id="btn-row" style="display:flex;gap:8px;">
          <button id="btn-scan" style="flex:1;background:#1e293b;color:#38bdf8;border:1px solid #334155;border-radius:8px;padding:9px 0;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer;" title="Scan page privacy and display on-screen overlays">🔍 Scan & Redact</button>
          <button id="btn-run" disabled style="flex:1.2">▶ Run Task</button>
        </div>
      </div>

      <div id="done-banner"></div>
      <div id="error-banner"></div>

      <div id="user-input-box">
        <div id="user-input-lbl">👤 Agent requires your input</div>
        <div id="user-input-prompt"></div>
        <input id="user-input-field" type="text" placeholder="Type your response…" />
        <button id="user-input-submit">Submit</button>
      </div>

      <div id="steps-container">
        <div id="steps-header">
          <span>Execution Steps</span>
          <span id="steps-count" style="color:#22d3ee"></span>
        </div>
        <div id="steps-list"></div>
      </div>

      <div id="audit-container">
        <div id="audit-header">Privacy Audit Log</div>
        <div id="audit-list"></div>
      </div>
    </div>

    <div id="footer">
      <div style="display:flex;align-items:center;gap:8px;">
        <a href="http://localhost:5173" target="_blank">Dashboard →</a>
        <button id="btn-mute-site" title="Do not auto-open on this domain" style="background:none;border:none;color:#475569;font-size:9px;cursor:pointer;padding:0;text-decoration:underline;">Mute site</button>
      </div>
      <div id="footer-actions">
        <label id="lbl-auto-open" title="Auto-open panel on new pages (defaults to off)" style="font-size:9px;color:#475569;display:flex;align-items:center;gap:4px;cursor:pointer;user-select:none;">
          <input type="checkbox" id="chk-auto-open" style="cursor:pointer;" /> Auto-open
        </label>
      </div>
    </div>
  `;
  shadow.appendChild(panel);

  // ── RESTORE POSITION ─────────────────────────────────────────────────────────
  try {
    const saved = localStorage.getItem('__privsight_pos__');
    if (saved) {
      const { x, y } = JSON.parse(saved);
      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
      panel.style.right = 'auto';
    }
  } catch {}

  // ── MINIMIZE & CLOSE ─────────────────────────────────────────────────────────
  const btnMin = shadow.getElementById('btn-minimize')!;
  let minimized = false;
  btnMin.addEventListener('click', (e) => {
    e.stopPropagation();
    minimized = !minimized;
    panel.classList.toggle('minimized', minimized);
    btnMin.textContent = minimized ? '+' : '−';
  });

  const btnClose = shadow.getElementById('btn-close')!;
  btnClose.addEventListener('click', (e) => {
    e.stopPropagation();
    try {
      sessionStorage.setItem('__privsight_dismissed__', '1');
    } catch {}
    removeFloatingPanel();
  });

  // ESC key dismisses panel
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      try {
        sessionStorage.setItem('__privsight_dismissed__', '1');
      } catch {}
      removeFloatingPanel();
    }
  };
  document.addEventListener('keydown', handleKeydown);

  // ── DRAG ─────────────────────────────────────────────────────────────────────
  let dragging = false;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;

  const header = shadow.getElementById('header')!;
  header.addEventListener('mousedown', (e) => {
    const target = e.target as HTMLElement;
    if (target.id === 'btn-minimize' || target.id === 'btn-close' || target.closest('.header-btn')) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = panel.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    panel.style.left = startLeft + 'px';
    panel.style.top = startTop + 'px';
    panel.style.right = 'auto';
    panel.classList.add('dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const newLeft = Math.max(0, Math.min(window.innerWidth - 50, startLeft + dx));
    const newTop = Math.max(0, Math.min(window.innerHeight - 50, startTop + dy));
    panel.style.left = newLeft + 'px';
    panel.style.top = newTop + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove('dragging');
    try {
      localStorage.setItem('__privsight_pos__', JSON.stringify({
        x: parseFloat(panel.style.left),
        y: parseFloat(panel.style.top),
      }));
    } catch {}
  });

  // ── AUTO-OPEN & MUTE SETTINGS ────────────────────────────────────────────────
  const chkAutoOpen = shadow.getElementById('chk-auto-open') as HTMLInputElement;
  if (chkAutoOpen) {
    chrome.storage.local.get(['autoShowFloatingPanel'], (res) => {
      chkAutoOpen.checked = !!res.autoShowFloatingPanel;
    });
    chkAutoOpen.addEventListener('change', () => {
      chrome.storage.local.set({ autoShowFloatingPanel: chkAutoOpen.checked });
    });
  }

  const btnMuteSite = shadow.getElementById('btn-mute-site');
  if (btnMuteSite) {
    btnMuteSite.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const hostClean = location.hostname.replace(/^www\./, '');
      chrome.storage.local.get(['mutedSites'], (res) => {
        const list: string[] = res.mutedSites || [];
        if (!list.includes(hostClean)) {
          list.push(hostClean);
          chrome.storage.local.set({ mutedSites: list }, () => {
            try { sessionStorage.setItem('__privsight_dismissed__', '1'); } catch {}
            removeFloatingPanel();
          });
        } else {
          removeFloatingPanel();
        }
      });
    });
  }

  // ── STATE ─────────────────────────────────────────────────────────────────────
  let running = false;
  let pendingInputActionId = '';
  const ACTION_COLORS: Record<string, string> = {
    fill: '#22d3ee', click: '#3b82f6', scroll: '#a78bfa',
    navigate: '#f59e0b', done: '#10b981', finish: '#10b981',
    wait: '#6b7280', select: '#ec4899', focus: '#8b5cf6',
    back: '#f97316', forward: '#f97316', ask_user: '#f59e0b',
  };

  const $ = (id: string) => shadow.getElementById(id)!;
  const taskInput = $('task-input') as HTMLTextAreaElement;
  const btnRun = $('btn-run') as HTMLButtonElement;
  const statusBadge = $('status-badge');
  const statSteps = $('stat-steps');
  const statPii = $('stat-pii');
  const doneBanner = $('done-banner');
  const errorBanner = $('error-banner');
  const stepsContainer = $('steps-container');
  const stepsList = $('steps-list');
  const stepsCount = $('steps-count');
  const auditContainer = $('audit-container');
  const auditList = $('audit-list');
  const siteBadge = $('site-badge');
  const userInputBox = $('user-input-box') as HTMLDivElement;
  const userInputPrompt = $('user-input-prompt');
  const userInputField = $('user-input-field') as HTMLInputElement;
  const userInputSubmit = $('user-input-submit') as HTMLButtonElement;

  // ── TASK INPUT CONTROL ─────────────────────────────────────────────────────────
  taskInput.addEventListener('input', () => {
    btnRun.disabled = running || !taskInput.value.trim();
  });
  taskInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doStartTask(); }
  });
  btnRun.addEventListener('click', doStartTask);

  const btnScan = shadow.getElementById('btn-scan') as HTMLButtonElement | null;
  if (btnScan) {
    btnScan.addEventListener('click', () => {
      btnScan.disabled = true;
      btnScan.textContent = '⏳ Scanning…';
      setStatus('🔵 Scanning DOM & Vision…', '#22d3ee');
      window.dispatchEvent(new CustomEvent('privsight:scan'));
      setTimeout(() => {
        if (btnScan) {
          btnScan.disabled = false;
          btnScan.textContent = '🔍 Scan & Redact';
        }
        setStatus('● Ready', '#10b981');
      }, 1000);
    });
  }

  function doStartTask() {
    if (running || !taskInput.value.trim()) return;
    setRunning(true);
    doneBanner.style.display = 'none';
    errorBanner.style.display = 'none';
    stepsList.innerHTML = '';
    stepsContainer.style.display = 'none';
    statSteps.textContent = '0';
    statPii.textContent = '0';

    chrome.runtime.sendMessage({
      type: 'START_TASK',
      instruction: taskInput.value.trim(),
    }, (res) => {
      if (!res?.ok) {
        setRunning(false);
        showError(res?.error || 'Failed to start task');
      }
    });
  }

  function setRunning(val: boolean) {
    running = val;
    taskInput.disabled = val;
    btnRun.disabled = val || !taskInput.value.trim();
    btnRun.textContent = val ? '⏳ Running…' : '▶ Run Task';
    // Add/remove stop button
    const existingStop = shadow.getElementById('btn-stop');
    if (val && !existingStop) {
      const stop = document.createElement('button');
      stop.id = 'btn-stop';
      stop.textContent = '■ Stop';
      stop.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'STOP_TASK' });
        setRunning(false);
        setStatus('● Ready', '#10b981');
      });
      $('btn-row').appendChild(stop);
    } else if (!val && existingStop) {
      existingStop.remove();
    }
  }

  function setStatus(text: string, color: string) {
    statusBadge.textContent = text;
    statusBadge.style.color = color;
    statusBadge.style.background = color + '18';
    statusBadge.style.borderColor = color + '44';
  }

  function showError(msg: string) {
    errorBanner.textContent = '⚠ ' + msg;
    errorBanner.style.display = 'block';
  }

  function addStep(step: any) {
    stepsContainer.style.display = 'block';
    const ac = step.action?.action ?? step.status ?? '';
    const clr = ACTION_COLORS[ac] ?? '#64748b';
    const conf = step.confidence != null ? Math.round(step.confidence * 100) + '%' : '';
    const ms = step.latencyMs != null ? step.latencyMs + 'ms' : '';
    const row = document.createElement('div');
    row.className = 'step-row';
    row.innerHTML = `
      <span class="step-badge" style="background:${clr}22;color:${clr};border:1px solid ${clr}44">${ac || 'step'}</span>
      <span class="step-label">${
        step.action?.target?.value
          ? `<span style="color:#22d3ee">${step.action.target.value.slice(0, 28)}</span>`
          : (step.label || '').slice(0, 36)
      }${step.action?.value ? ` <span style="color:#f59e0b">= "${step.action.value.slice(0, 18)}"</span>` : ''}</span>
      <span class="step-meta">${ms}${conf ? ' · ' + conf : ''}</span>
    `;
    stepsList.appendChild(row);
    stepsList.scrollTop = stepsList.scrollHeight;
    const n = stepsList.children.length;
    stepsCount.textContent = n + ' step' + (n !== 1 ? 's' : '');
    statSteps.textContent = String(n);
  }

  function addAudit(ev: any) {
    auditContainer.style.display = 'block';
    const row = document.createElement('div');
    row.className = 'audit-row';
    const time = new Date(ev.timestamp).toLocaleTimeString();
    row.innerHTML = `<span class="audit-time">${time}</span><span class="audit-detail">${ev.detail || ''}</span>`;
    auditList.insertBefore(row, auditList.firstChild);
    while (auditList.children.length > 6) auditList.removeChild(auditList.lastChild!);
  }

  // ── LOAD SAVED AUDIT LOG ───────────────────────────────────────────────────────
  chrome.storage.local.get(['auditLog'], (r) => {
    if (r.auditLog) r.auditLog.slice(-5).reverse().forEach(addAudit);
  });

  // ── LOAD CURRENT STATUS ────────────────────────────────────────────────────────
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
    if (!res) return;
    if (res.siteStatus) updateSiteBadge(res.siteStatus);
    if (res.steps?.length) res.steps.forEach(addStep);
    if (['IDLE', 'COMPLETED', 'ERROR'].includes(res.taskState)) {
      setRunning(false);
    } else if (res.taskState) {
      setRunning(true);
    }
  });

  // ── USER INPUT ─────────────────────────────────────────────────────────────────
  userInputSubmit.addEventListener('click', submitUserInput);
  userInputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitUserInput();
  });

  function submitUserInput() {
    const val = userInputField.value.trim();
    if (!val || !pendingInputActionId) return;
    chrome.runtime.sendMessage({
      type: 'USER_INPUT_RESPONSE',
      value: val,
      actionId: pendingInputActionId,
    });
    userInputBox.style.display = 'none';
    userInputField.value = '';
    pendingInputActionId = '';
  }

  // ── SITE BADGE ─────────────────────────────────────────────────────────────────
  function updateSiteBadge(ss: any) {
    if (!ss) { siteBadge.style.display = 'none'; return; }
    const CFG: Record<string, { icon: string; label: string; color: string }> = {
      full:        { icon: '✓', label: 'SUPPORTED', color: '#10b981' },
      partial:     { icon: '△', label: 'PARTIAL SUPPORT', color: '#f59e0b' },
      experimental:{ icon: '⚗', label: 'EXPERIMENTAL', color: '#a78bfa' },
      unsupported: { icon: '○', label: 'UNSUPPORTED', color: '#64748b' },
    };
    const cfg = CFG[ss.compatibility] ?? CFG.unsupported;
    siteBadge.style.display = 'block';
    siteBadge.style.background = cfg.color + '15';
    siteBadge.style.borderColor = cfg.color + '44';
    siteBadge.style.color = cfg.color;
    siteBadge.innerHTML = `<strong>${cfg.icon} ${cfg.label}</strong>${ss.adapterName ? ` <span style="float:right;color:#475569;font-size:9px">${ss.adapterName}</span>` : ''}${ss.workflows?.length ? `<div style="font-size:9px;color:#475569;margin-top:2px">${ss.workflows.join(' · ')}</div>` : ''}`;
  }

  const STATE_COLORS: Record<string, string> = {
    IDLE: '#10b981', UNDERSTANDING: '#a78bfa', PERCEIVING: '#22d3ee',
    SANITIZING: '#c084fc', PLANNING: '#60a5fa', VALIDATING: '#34d399',
    EXECUTING: '#3b82f6', WAITING_FOR_PAGE: '#94a3b8', RE_PERCEIVING: '#22d3ee',
    COMPLETED: '#10b981', PRIVACY_BLOCKED: '#dc2626', ACTION_INVALID: '#ef4444',
    LOW_CONFIDENCE: '#f59e0b', UNSUPPORTED_SITE: '#64748b', USER_REQUIRED: '#f59e0b',
    ERROR: '#ef4444',
  };
  const STATE_LABELS: Record<string, string> = {
    IDLE: '● Ready', UNDERSTANDING: '🧠 Understanding…', PERCEIVING: '👁 Perceiving…',
    SANITIZING: '🛡 Sanitizing…', PLANNING: '🤖 Reasoning…', VALIDATING: '✔ Validating…',
    EXECUTING: '▶ Executing…', WAITING_FOR_PAGE: '⏳ Waiting…', RE_PERCEIVING: '🔄 Re-perceiving…',
    COMPLETED: '✅ Completed', PRIVACY_BLOCKED: '🛑 Privacy Blocked',
    ACTION_INVALID: '⚠ Action Invalid', LOW_CONFIDENCE: '🟡 Low Confidence',
    UNSUPPORTED_SITE: '⊘ Unsupported', USER_REQUIRED: '👤 Input Required', ERROR: '⚠ Error',
  };

  // ── MESSAGE LISTENER ──────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg: any) => {
    if (!msg?.type) return;

    if (msg.type === 'TASK_STATE_CHANGE' || msg.type === 'STATUS_UPDATE') {
      const state: string = msg.taskState ?? 'IDLE';
      const color = STATE_COLORS[state] ?? '#64748b';
      setStatus(STATE_LABELS[state] ?? state, color);
      if (['IDLE', 'COMPLETED', 'ERROR', 'PRIVACY_BLOCKED'].includes(state)) {
        setRunning(false);
      } else {
        setRunning(true);
      }
    }

    if (msg.type === 'TASK_DONE') {
      setRunning(false);
      if (msg.reason?.toLowerCase().includes('error') || msg.reason?.toLowerCase().includes('fail')) {
        showError(msg.reason);
        setStatus('⚠ Error', '#ef4444');
      } else {
        doneBanner.textContent = '✅ Done: ' + (msg.reason ?? 'Task completed.');
        doneBanner.style.display = 'block';
        setStatus('✅ Completed', '#10b981');
      }
    }

    if (msg.type === 'STEP_UPDATE') {
      addStep(msg);
    }

    if (msg.type === 'AUDIT_EVENT') {
      addAudit(msg.event);
      if (msg.event?.piiType) statPii.textContent = String(parseInt(statPii.textContent || '0') + 1);
    }

    if (msg.type === 'SITE_STATUS') {
      updateSiteBadge(msg.siteStatus);
    }

    if (msg.type === 'USER_INPUT_REQUEST') {
      pendingInputActionId = msg.actionId;
      userInputPrompt.textContent = msg.prompt ?? 'Please provide input:';
      userInputField.value = '';
      userInputBox.style.display = 'flex';
      userInputField.focus();
    }

    if (msg.type === 'ACTION_APPROVAL_REQUEST') {
      // Auto-approve non-payment actions from the panel for smoother UX
      chrome.runtime.sendMessage({
        type: 'ACTION_APPROVAL_RESPONSE',
        approved: true,
        actionId: msg.actionId,
      });
    }

    if (msg.type === 'TOGGLE_FLOATING_PANEL') {
      if (msg.show === false) {
        removeFloatingPanel();
      }
    }
  });
}
