import { useState, useEffect } from 'react'
import { Settings, Shield, Sliders, Server, Save, Check, RefreshCw } from 'lucide-react'

export default function SettingsPage() {
  const [privacyLevel, setPrivacyLevel] = useState<'STRICT' | 'BALANCED' | 'PERMISSIVE'>('STRICT')
  const [llmProvider, setLlmProvider] = useState<'gemini' | 'groq' | 'openai' | 'anthropic'>('gemini')
  const [enableOCR, setEnableOCR] = useState(true)
  const [enableFaceDetection, setEnableFaceDetection] = useState(true)
  const [sendScreenshots, setSendScreenshots] = useState(false)
  const [saved, setSaved] = useState(false)

  const [categories, setCategories] = useState<Record<string, boolean>>({
    email: true,
    phone: true,
    password: true,
    credit_card: true,
    cvv: true,
    aadhaar: true,
    pan: true,
    upi: true,
    ifsc: true,
    face: true,
    address: true,
  })

  const handleToggleCategory = (cat: string) => {
    setCategories(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Privacy & Perception Settings</h2>
          <p className="text-slate-400 text-sm mt-1">Configure local redaction thresholds, detection categories, and server reasoning options</p>
        </div>
        <button
          onClick={handleSave}
          className="bg-cyan-500 hover:bg-cyan-400 text-navy-950 font-bold px-5 py-2.5 rounded-lg text-sm transition-all flex items-center gap-2"
        >
          {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>{saved ? 'Saved!' : 'Save Configuration'}</span>
        </button>
      </div>

      {/* Privacy Level Policy */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2 text-white font-semibold text-base">
          <Shield className="w-5 h-5 text-cyan-400" />
          <span>Global Privacy Level Policy</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              id: 'STRICT',
              title: 'Strict Mode (Recommended)',
              desc: 'Fail-safe: remove critical PII entirely, mask high-sensitivity data, zero screenshot transfer.',
              color: 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300',
            },
            {
              id: 'BALANCED',
              title: 'Balanced Mode',
              desc: 'Mask all detected PII fields with semantic placeholders, allow redacted screenshots.',
              color: 'border-amber-500/50 bg-amber-500/10 text-amber-300',
            },
            {
              id: 'PERMISSIVE',
              title: 'Permissive Mode',
              desc: 'Audit-only mode. Detects PII and logs events without applying local DOM redaction.',
              color: 'border-purple-500/50 bg-purple-500/10 text-purple-300',
            },
          ].map((level) => (
            <div
              key={level.id}
              onClick={() => setPrivacyLevel(level.id as any)}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                privacyLevel === level.id
                  ? level.color
                  : 'border-slate-700/60 bg-navy-900 text-slate-400 hover:border-slate-600'
              }`}
            >
              <div className="font-bold text-sm text-white mb-1">{level.title}</div>
              <div className="text-xs text-slate-400 leading-relaxed">{level.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Detection Categories */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-semibold text-base">
            <Sliders className="w-5 h-5 text-cyan-400" />
            <span>Active PII Categories</span>
          </div>
          <span className="text-xs text-slate-500">Enable/disable specific detector modules</span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {Object.entries(categories).map(([cat, enabled]) => (
            <div
              key={cat}
              onClick={() => handleToggleCategory(cat)}
              className={`p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-all ${
                enabled
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-white'
                  : 'border-slate-800 bg-navy-900/50 text-slate-500'
              }`}
            >
              <span className="text-xs font-mono font-semibold uppercase">{cat.replace('_', ' ')}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${enabled ? 'bg-emerald-400 text-navy-950' : 'bg-slate-800 text-slate-500'}`}>
                {enabled ? 'ON' : 'OFF'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Perception & Server Settings */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2 text-white font-semibold text-base">
          <Server className="w-5 h-5 text-cyan-400" />
          <span>Server Reasoning Engine</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">LLM Reasoning Provider</label>
            <select
              value={llmProvider}
              onChange={e => setLlmProvider(e.target.value as any)}
              className="w-full bg-navy-900 border border-slate-700/60 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="gemini">Google Gemini 2.0 Flash</option>
              <option value="groq">Groq (Llama-3.3-70B)</option>
              <option value="openai">OpenAI GPT-4o-mini</option>
              <option value="anthropic">Anthropic Claude 3 Haiku</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">FastAPI Backend Endpoint</label>
            <input
              type="text"
              readOnly
              value="http://localhost:8000/api"
              className="w-full bg-navy-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-cyan-400"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-slate-700/50 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300">Enable Tesseract OCR in Offscreen Document</span>
            <input
              type="checkbox"
              checked={enableOCR}
              onChange={e => setEnableOCR(e.target.checked)}
              className="accent-cyan-400 w-4 h-4 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300">Enable BlazeFace Vision Face Detection</span>
            <input
              type="checkbox"
              checked={enableFaceDetection}
              onChange={e => setEnableFaceDetection(e.target.checked)}
              className="accent-cyan-400 w-4 h-4 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300">Allow Redacted Screenshot Uploads to Server</span>
            <input
              type="checkbox"
              checked={sendScreenshots}
              onChange={e => setSendScreenshots(e.target.checked)}
              className="accent-cyan-400 w-4 h-4 cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
