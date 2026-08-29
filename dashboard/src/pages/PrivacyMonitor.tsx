import { useState } from 'react'
import { Shield, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react'

const RAW_DATA = [
  { field: 'Full Name',    raw: 'Kshitiz Jain',              sanitized: '[PERSON]',           type: 'name',        severity: 'MEDIUM',   method: 'Replace' },
  { field: 'Email',        raw: 'kshitiz.jain@gmail.com',    sanitized: '[EMAIL REDACTED]',   type: 'email',       severity: 'HIGH',     method: 'Mask' },
  { field: 'Phone',        raw: '+91 98765 43210',            sanitized: '[PHONE REDACTED]',   type: 'phone',       severity: 'HIGH',     method: 'Mask' },
  { field: 'Address',      raw: '42 Nehru Colony, Dehradun', sanitized: '[ADDRESS REDACTED]', type: 'address',     severity: 'HIGH',     method: 'Mask' },
  { field: 'Aadhaar',      raw: '2345 6789 0123',             sanitized: '[GOVT-ID REDACTED]', type: 'aadhaar',    severity: 'CRITICAL', method: 'Remove' },
  { field: 'PAN',          raw: 'ABCDE1234F',                 sanitized: '[GOVT-ID REDACTED]', type: 'pan',        severity: 'HIGH',     method: 'Mask' },
  { field: 'Credit Card',  raw: '4111 1111 1111 4321',        sanitized: '[CARD REDACTED]',   type: 'credit_card', severity: 'CRITICAL', method: 'Remove' },
  { field: 'CVV',          raw: '•••',                         sanitized: '[CVV REDACTED]',    type: 'cvv',         severity: 'CRITICAL', method: 'Remove' },
  { field: 'Password',     raw: '••••••••••••',                sanitized: '[PASSWORD REMOVED]',type: 'password',   severity: 'CRITICAL', method: 'Remove' },
  { field: 'UPI ID',       raw: 'kshitiz.jain@oksbi',         sanitized: '[PAYMENT-ID REDACTED]',type:'upi',      severity: 'HIGH',     method: 'Mask' },
  { field: 'Face Photo',   raw: '[Profile Image]',             sanitized: '[FACE BLURRED]',    type: 'face',       severity: 'HIGH',     method: 'Blur' },
  { field: 'Travel From',  raw: 'Delhi (DEL)',                 sanitized: 'Delhi (DEL)',        type: 'safe',       severity: 'SAFE',     method: 'None' },
  { field: 'Search Btn',   raw: '[SEARCH BUTTON]',             sanitized: '[SEARCH BUTTON]',   type: 'safe',       severity: 'SAFE',     method: 'None' },
]

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'text-red-400',
  HIGH:     'text-amber-400',
  MEDIUM:   'text-yellow-400',
  SAFE:     'text-emerald-400',
}

const METHOD_COLORS: Record<string, string> = {
  Remove:  'bg-red-500/20 text-red-400',
  Mask:    'bg-amber-500/20 text-amber-400',
  Replace: 'bg-yellow-500/20 text-yellow-400',
  Blur:    'bg-purple-500/20 text-purple-400',
  None:    'bg-emerald-500/20 text-emerald-400',
}

export default function PrivacyMonitor() {
  const [showRaw, setShowRaw] = useState(false)

  const piiCount   = RAW_DATA.filter(d => d.severity !== 'SAFE').length
  const safeCount  = RAW_DATA.filter(d => d.severity === 'SAFE').length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Privacy Monitor</h2>
        <p className="text-slate-400 text-sm mt-1">Side-by-side: what your browser sees vs. what the server receives</p>
      </div>

      {/* Transmission Summary */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Raw Screenshot Sent',  value: 'NO',  color: 'text-emerald-400', icon: <XCircle className="w-5 h-5 text-emerald-400" /> },
          { label: 'Sensitive Text Sent',  value: 'NO',  color: 'text-emerald-400', icon: <XCircle className="w-5 h-5 text-emerald-400" /> },
          { label: 'Face Transmitted',     value: 'NO',  color: 'text-emerald-400', icon: <XCircle className="w-5 h-5 text-emerald-400" /> },
          { label: 'Sanitized Context',    value: 'YES', color: 'text-cyan-400',    icon: <CheckCircle className="w-5 h-5 text-cyan-400" /> },
        ].map(item => (
          <div key={item.label} className="card p-4 flex items-center gap-3">
            {item.icon}
            <div>
              <div className={`font-bold text-lg ${item.color}`}>{item.value}</div>
              <div className="text-[10px] text-slate-400 leading-tight">{item.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Side-by-side view */}
      <div className="grid grid-cols-2 gap-4">
        {/* LEFT: Original (Browser View) */}
        <div className="card">
          <div className="card-header bg-red-500/5 border-red-500/20">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-red-400" />
              <span className="font-semibold text-sm text-white">Original — Browser View</span>
            </div>
            <span className="badge-blocked">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              RAW PII
            </span>
          </div>
          <div className="p-4 space-y-1.5 max-h-[500px] overflow-y-auto">
            {RAW_DATA.map(item => (
              <div key={item.field} className="flex items-start gap-2 p-2 rounded-lg hover:bg-white/3">
                <div className="w-24 shrink-0">
                  <span className="text-[11px] text-slate-400 font-medium">{item.field}:</span>
                </div>
                <div className={`text-[11px] font-mono ${item.severity === 'SAFE' ? 'text-slate-300' : 'text-red-300'}`}>
                  {item.raw}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Server Receives */}
        <div className="card">
          <div className="card-header bg-emerald-500/5 border-emerald-500/20">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold text-sm text-white">Server Receives — Sanitized</span>
            </div>
            <span className="badge-protected">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              CLEAN
            </span>
          </div>
          <div className="p-4 space-y-1.5 max-h-[500px] overflow-y-auto">
            {RAW_DATA.map(item => (
              <div key={item.field} className="flex items-start gap-2 p-2 rounded-lg hover:bg-white/3">
                <div className="w-24 shrink-0">
                  <span className="text-[11px] text-slate-400 font-medium">{item.field}:</span>
                </div>
                <div className={`text-[11px] font-mono ${item.severity === 'SAFE' ? 'text-emerald-300' : 'text-cyan-400'}`}>
                  {item.sanitized}
                </div>
                {item.severity !== 'SAFE' && (
                  <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${METHOD_COLORS[item.method]}`}>
                    {item.method}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PII Detail Table */}
      <div className="card">
        <div className="card-header">
          <span className="font-semibold text-sm text-white">PII Detection Details ({piiCount} items redacted)</span>
          <span className="text-xs text-slate-500">{safeCount} non-sensitive items passed through</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700/50">
                {['Field', 'Type', 'Severity', 'Source', 'Confidence', 'Redaction', 'Status'].map(h => (
                  <th key={h} className="text-left p-3 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RAW_DATA.filter(d => d.severity !== 'SAFE').map((item, i) => (
                <tr key={i} className="border-b border-slate-800/50 hover:bg-white/2">
                  <td className="p-3 font-medium text-slate-300">{item.field}</td>
                  <td className="p-3 font-mono text-slate-400">{item.type}</td>
                  <td className={`p-3 font-bold ${SEVERITY_COLORS[item.severity]}`}>{item.severity}</td>
                  <td className="p-3 text-slate-400">DOM+Regex</td>
                  <td className="p-3 text-slate-300">{item.type === 'password' ? '100%' : item.type === 'email' ? '99%' : item.type === 'pan' ? '97%' : item.type === 'face' ? '97%' : '92%+'}</td>
                  <td className={`p-3`}>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${METHOD_COLORS[item.method]}`}>{item.method}</span>
                  </td>
                  <td className="p-3">
                    <span className="badge-protected text-[9px]">✓ Redacted</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
