import { useState, useEffect } from 'react'
import { Shield, Eye, Zap, CheckCircle, XCircle, Clock } from 'lucide-react'

const MOCK_EVENTS = [
  { id: 1,  type: 'pii_detected',      piiType: 'face',        confidence: 0.97, source: 'vision',  redactionMethod: 'blur',   detail: 'Face detected in profile photo', ts: Date.now() - 12000 },
  { id: 2,  type: 'pii_detected',      piiType: 'email',       confidence: 0.99, source: 'dom',     redactionMethod: 'mask',   detail: 'Email detected via DOM autocomplete attr', ts: Date.now() - 11800 },
  { id: 3,  type: 'pii_detected',      piiType: 'phone',       confidence: 0.92, source: 'dom',     redactionMethod: 'mask',   detail: 'Phone via data-pii-type attribute', ts: Date.now() - 11600 },
  { id: 4,  type: 'pii_detected',      piiType: 'credit_card', confidence: 0.98, source: 'dom',     redactionMethod: 'remove', detail: 'CC detected — Luhn validated', ts: Date.now() - 11400 },
  { id: 5,  type: 'pii_detected',      piiType: 'password',    confidence: 1.00, source: 'dom',     redactionMethod: 'remove', detail: 'Password field (type=password)', ts: Date.now() - 11200 },
  { id: 6,  type: 'pii_detected',      piiType: 'aadhaar',     confidence: 0.88, source: 'regex',   redactionMethod: 'remove', detail: 'Aadhaar 12-digit pattern matched', ts: Date.now() - 11000 },
  { id: 7,  type: 'pii_detected',      piiType: 'pan',         confidence: 0.97, source: 'regex',   redactionMethod: 'mask',   detail: 'PAN pattern: [A-Z]{5}[0-9]{4}[A-Z]', ts: Date.now() - 10800 },
  { id: 8,  type: 'pii_redacted',      piiType: 'all',         confidence: 1.00, source: 'engine',  redactionMethod: 'various',detail: '7 PII items redacted. Sanitized context ready.', ts: Date.now() - 10600 },
  { id: 9,  type: 'context_sent',      piiType: undefined,     confidence: 1.00, source: 'network', redactionMethod: undefined,detail: 'Sanitized JSON sent. Raw PII transmitted: 0 bytes.', ts: Date.now() - 10400 },
  { id: 10, type: 'response_received', piiType: undefined,     confidence: 0.97, source: 'server',  redactionMethod: undefined,detail: 'Server returned: fill #destination = "Mumbai"', ts: Date.now() - 8000 },
  { id: 11, type: 'action_executed',   piiType: undefined,     confidence: 0.97, source: 'content', redactionMethod: undefined,detail: 'fill #destination executed ✓', ts: Date.now() - 7900 },
  { id: 12, type: 'action_executed',   piiType: undefined,     confidence: 0.95, source: 'content', redactionMethod: undefined,detail: 'fill #travel-date executed ✓', ts: Date.now() - 6200 },
  { id: 13, type: 'action_executed',   piiType: undefined,     confidence: 0.98, source: 'content', redactionMethod: undefined,detail: 'click #search-btn executed ✓', ts: Date.now() - 4500 },
]

const TYPE_CFG: Record<string, { color: string; label: string }> = {
  pii_detected:      { color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',      label: 'PII Detected' },
  pii_redacted:      { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', label: 'Redacted' },
  context_sent:      { color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',          label: 'Sent' },
  response_received: { color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',          label: 'Response' },
  action_executed:   { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', label: 'Executed' },
  action_blocked:    { color: 'text-red-400 bg-red-500/10 border-red-500/30',             label: 'Blocked' },
}

const METHOD_BADGE: Record<string, string> = {
  remove:  'bg-red-500/20 text-red-400',
  mask:    'bg-amber-500/20 text-amber-400',
  blur:    'bg-purple-500/20 text-purple-400',
  replace: 'bg-yellow-500/20 text-yellow-400',
}

export default function AuditLog() {
  const fmt = (ts: number) => new Date(ts).toLocaleTimeString()
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Privacy Audit Log</h2>
          <p className="text-slate-400 text-sm mt-1">All privacy events — raw PII is never stored</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
          {MOCK_EVENTS.length} events
        </div>
      </div>
      <div className="card p-4 border-emerald-500/20 bg-emerald-500/5">
        <div className="flex items-center gap-3 text-sm">
          <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-emerald-400 font-semibold">Audit Invariant: </span>
          <span className="text-slate-400">Raw sensitive values are NEVER stored in this log. Only metadata (type, confidence, source) is recorded.</span>
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <span className="font-semibold text-sm text-white">Event Timeline</span>
        </div>
        <div className="p-4 space-y-2 max-h-[600px] overflow-y-auto">
          {MOCK_EVENTS.map(ev => {
            const cfg = TYPE_CFG[ev.type] ?? { color: 'text-slate-400 bg-slate-500/10 border-slate-500/30', label: ev.type }
            return (
              <div key={ev.id} className="flex items-start gap-3 p-2.5 hover:bg-white/2 rounded-lg">
                <span className="text-[10px] font-mono text-slate-600 w-20 shrink-0 pt-0.5">{fmt(ev.ts)}</span>
                <span className={`text-[10px] font-bold px-2 py-1 rounded border shrink-0 ${cfg.color}`}>{cfg.label}</span>
                {ev.piiType && ev.piiType !== 'all' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-mono shrink-0">{ev.piiType}</span>
                )}
                <span className="flex-1 text-xs text-slate-400">{ev.detail}</span>
                {ev.confidence < 1 && <span className="text-[10px] text-slate-500 shrink-0">{Math.round(ev.confidence * 100)}%</span>}
                {ev.redactionMethod && !['various', undefined].includes(ev.redactionMethod) && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${METHOD_BADGE[ev.redactionMethod] ?? 'bg-slate-600 text-slate-300'}`}>{ev.redactionMethod}</span>
                )}
                <span className="text-[9px] text-emerald-600 font-mono shrink-0">RAW=0</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
