import { useState } from 'react'
import { Shield, Save } from 'lucide-react'

const PII_CATEGORIES = [
  { id: 'password',       label: 'Passwords',              severity: 'CRITICAL', default: true },
  { id: 'credit_card',    label: 'Credit Card Numbers',    severity: 'CRITICAL', default: true },
  { id: 'cvv',            label: 'CVV / Card Security',    severity: 'CRITICAL', default: true },
  { id: 'aadhaar',        label: 'Aadhaar Numbers',        severity: 'CRITICAL', default: true },
  { id: 'api_key',        label: 'API Keys & Tokens',      severity: 'CRITICAL', default: true },
  { id: 'email',          label: 'Email Addresses',        severity: 'HIGH',     default: true },
  { id: 'phone',          label: 'Phone Numbers',          severity: 'HIGH',     default: true },
  { id: 'address',        label: 'Physical Addresses',     severity: 'HIGH',     default: true },
  { id: 'pan',            label: 'PAN Card Numbers',       severity: 'HIGH',     default: true },
  { id: 'face',           label: 'Face / Photos',          severity: 'HIGH',     default: true },
  { id: 'dob',            label: 'Dates of Birth',         severity: 'HIGH',     default: true },
  { id: 'upi',            label: 'UPI IDs',                severity: 'HIGH',     default: true },
  { id: 'name',           label: 'Personal Names',         severity: 'MEDIUM',   default: true },
]

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'text-red-400',
  HIGH: 'text-amber-400',
  MEDIUM: 'text-yellow-400',
}

export default function SettingsPage() {
  const [privacyLevel, setPrivacyLevel] = useState<'STRICT' | 'BALANCED' | 'PERMISSIVE'>('STRICT')
  const [redactionMethod, setRedactionMethod] = useState('mask')
  const [enableOCR, setEnableOCR] = useState(true)
  const [enableFace, setEnableFace] = useState(true)
  const [sendScreenshots, setSendScreenshots] = useState(false)
  const [categories, setCategories] = useState<Record<string, boolean>>(
    Object.fromEntries(PII_CATEGORIES.map(c => [c.id, c.default]))
  )
  const [saved, setSaved] = useState(false)

  const toggle = (id: string) => setCategories(prev => ({ ...prev, [id]: !prev[id] }))

  const save = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-white">Privacy Settings</h2>
        <p className="text-slate-400 text-sm mt-1">Configure the local privacy policy engine</p>
      </div>

      {/* Privacy Level */}
      <div className="card p-5">
        <h3 className="font-semibold text-sm text-white mb-4 flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" />
          Privacy Level
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {(['STRICT', 'BALANCED', 'PERMISSIVE'] as const).map(level => (
            <button
              key={level}
              onClick={() => setPrivacyLevel(level)}
              className={`p-3 rounded-lg border text-sm font-semibold transition-all ${
                privacyLevel === level
                  ? level === 'STRICT' ? 'border-emerald-400 bg-emerald-400/10 text-emerald-400' : level === 'BALANCED' ? 'border-cyan-400 bg-cyan-400/10 text-cyan-400' : 'border-amber-400 bg-amber-400/10 text-amber-400'
                  : 'border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              {level}
              {level === 'STRICT' && <div className="text-[10px] font-normal mt-0.5 opacity-70">Recommended</div>}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-3">
          {privacyLevel === 'STRICT' ? 'All PII categories enabled. Fail-safe: uncertain → block.' : privacyLevel === 'BALANCED' ? 'Core PII categories. Some low-sensitivity data may pass.' : '⚠ Permissive mode: only CRITICAL items are redacted.'}
        </p>
      </div>

      {/* Redaction Method */}
      <div className="card p-5">
        <h3 className="font-semibold text-sm text-white mb-4">Default Redaction Method</h3>
        <div className="grid grid-cols-4 gap-2">
          {['mask', 'blur', 'replace', 'remove'].map(method => (
            <button
              key={method}
              onClick={() => setRedactionMethod(method)}
              className={`p-2.5 rounded-lg border text-xs font-semibold transition-all ${redactionMethod === method ? 'border-cyan-400 bg-cyan-400/10 text-cyan-400' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}
            >
              {method.charAt(0).toUpperCase() + method.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Feature Toggles */}
      <div className="card p-5">
        <h3 className="font-semibold text-sm text-white mb-4">Local Perception Modules</h3>
        <div className="space-y-3">
          {[
            { label: 'OCR Text Analysis', sub: 'Tesseract.js — detects PII in visual text', value: enableOCR, set: setEnableOCR },
            { label: 'Face Detection', sub: 'BlazeFace ONNX — detects and blurs faces', value: enableFace, set: setEnableFace },
            { label: 'Send Sanitized Screenshot', sub: 'Only if all visual PII is redacted', value: sendScreenshots, set: setSendScreenshots },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between p-3 bg-navy-700/50 rounded-lg">
              <div>
                <div className="text-sm font-medium text-white">{item.label}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{item.sub}</div>
              </div>
              <button
                onClick={() => item.set(!item.value)}
                className={`w-11 h-6 rounded-full transition-colors relative ${item.value ? 'bg-cyan-500' : 'bg-slate-700'}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${item.value ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* PII Categories */}
      <div className="card p-5">
        <h3 className="font-semibold text-sm text-white mb-4">Sensitive Categories</h3>
        <div className="space-y-2">
          {PII_CATEGORIES.map(cat => (
            <div key={cat.id} className="flex items-center gap-3 p-2 hover:bg-white/2 rounded-lg">
              <input
                type="checkbox"
                checked={categories[cat.id] ?? true}
                onChange={() => toggle(cat.id)}
                className="w-4 h-4 accent-cyan-400"
              />
              <span className="text-sm text-slate-300 flex-1">{cat.label}</span>
              <span className={`text-[10px] font-bold ${SEVERITY_COLORS[cat.severity]}`}>{cat.severity}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={save}
        className="flex items-center gap-2 px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-white font-semibold text-sm rounded-lg transition-colors"
      >
        <Save className="w-4 h-4" />
        {saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  )
}
