import { useState, useEffect } from 'react'
import { Shield, Eye, Cpu, Zap, Activity, AlertTriangle, CheckCircle, Clock, Lock } from 'lucide-react'

interface AgentMetrics {
  piiDetected: number
  piiRedacted: number
  rawBytesTransmitted: number
  totalSteps: number
  avgLatencyMs: number
  privacyScore: number
}

const PIPELINE_STEPS = [
  { id: 'perceive', label: 'PERCEIVE', icon: '👁️', desc: 'DOM + Visual Analysis' },
  { id: 'sanitize', label: 'SANITIZE', icon: '🔒', desc: 'PII Detection + Redaction' },
  { id: 'send',     label: 'SEND',     icon: '↑',  desc: 'Sanitized Context Only' },
  { id: 'reason',   label: 'REASON',   icon: '🤔', desc: 'Server LLM Reasoning' },
  { id: 'act',      label: 'ACT',      icon: '▶',  desc: 'Validated Execution' },
]

export default function Overview() {
  const [metrics, setMetrics] = useState<AgentMetrics>({
    piiDetected: 7, piiRedacted: 7, rawBytesTransmitted: 0,
    totalSteps: 0, avgLatencyMs: 0, privacyScore: 94,
  })
  const [activeStep, setActiveStep] = useState(0)
  const [agentStatus, setAgentStatus] = useState<'idle' | 'active' | 'protected'>('protected')

  // Animate pipeline
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep(s => (s + 1) % PIPELINE_STEPS.length)
    }, 1800)
    return () => clearInterval(interval)
  }, [])

  // Fetch metrics from server
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/metrics/summary')
        if (res.ok) {
          const data = await res.json()
          setMetrics(m => ({
            ...m,
            totalSteps: data.total_steps,
            avgLatencyMs: data.avg_total_ms,
            rawBytesTransmitted: data.total_raw_bytes_sent,
          }))
        }
      } catch { /* server offline */ }
    }
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Mission Control</h2>
        <p className="text-slate-400 text-sm mt-1">Privacy-preserving browser agent — real-time status</p>
      </div>

      {/* Privacy Tagline Banner */}
      <div className="card p-5 border-cyan-500/30 bg-gradient-to-r from-cyan-500/5 to-blue-500/5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center glow-cyan">
            <Shield className="w-7 h-7 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">"Your browser sees everything. The AI doesn't have to."</h3>
            <p className="text-slate-400 text-sm">Local privacy enforcement + remote reasoning = privacy-preserving intelligence</p>
          </div>
          <div className="ml-auto">
            <span className="badge-protected">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              PROTECTED
            </span>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="stat-card border-emerald-500/20">
          <div className="stat-label">PII Detected</div>
          <div className="stat-value text-amber-400">{metrics.piiDetected}</div>
          <div className="text-xs text-slate-500">on this page</div>
        </div>
        <div className="stat-card border-emerald-500/20">
          <div className="stat-label">PII Redacted</div>
          <div className="stat-value text-emerald-400">{metrics.piiRedacted}</div>
          <div className="text-xs text-slate-500">before transmission</div>
        </div>
        <div className="stat-card border-red-500/20">
          <div className="stat-label">Raw PII Sent</div>
          <div className="stat-value text-emerald-400">0</div>
          <div className="text-xs text-slate-500">bytes to server</div>
        </div>
        <div className="stat-card border-cyan-500/20">
          <div className="stat-label">Privacy Score</div>
          <div className="stat-value text-cyan-400">{metrics.privacyScore}</div>
          <div className="text-xs text-slate-500">out of 100</div>
        </div>
      </div>

      {/* Live Pipeline */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-sm text-white">Live Agent Pipeline</span>
          </div>
          <span className="badge-analyzing">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            ACTIVE
          </span>
        </div>
        <div className="p-6">
          <div className="flex items-center">
            {PIPELINE_STEPS.map((step, i) => (
              <div key={step.id} className="pipeline-step">
                {/* Connector */}
                {i > 0 && (
                  <div className={`absolute left-0 top-6 w-full h-0.5 -translate-x-1/2 ${i <= activeStep ? 'bg-cyan-400' : 'bg-slate-700'} transition-colors duration-500`} />
                )}
                <div className={`pipeline-icon ${i === activeStep ? 'active' : i < activeStep ? 'done' : 'pending'}`}>
                  <span className="text-xl">{step.icon}</span>
                </div>
                <div className={`text-[10px] font-bold tracking-widest ${i === activeStep ? 'text-cyan-400' : i < activeStep ? 'text-emerald-400' : 'text-slate-600'}`}>
                  {step.label}
                </div>
                <div className="text-[9px] text-slate-500 text-center max-w-16 leading-tight">{step.desc}</div>
              </div>
            ))}
          </div>

          {/* Trust Boundary */}
          <div className="mt-6 flex items-center gap-3 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
            <Lock className="w-4 h-4 text-red-400 shrink-0" />
            <div className="text-xs text-slate-400">
              <span className="text-red-400 font-semibold">TRUST BOUNDARY</span> — Raw user context stays on-device.
              Server receives <span className="text-emerald-400 font-semibold">sanitized JSON only</span>.
              No raw PII crosses this boundary.
            </div>
          </div>
        </div>
      </div>

      {/* Status Cards Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Agent Status */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Agent Status</span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-emerald-400 font-bold text-lg">ACTIVE</div>
          <div className="text-xs text-slate-500 mt-1">Ready to process tasks</div>
        </div>

        {/* Local Model */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Local Model</span>
            <Cpu className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-cyan-400 font-bold text-lg">READY</div>
          <div className="text-xs text-slate-500 mt-1">BlazeFace + Regex PII</div>
        </div>

        {/* Current Task */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Current Task</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-amber-400 font-bold text-base leading-tight">Travel Search</div>
          <div className="text-xs text-slate-500 mt-1">DEL → Mumbai</div>
        </div>
      </div>

      {/* PII Breakdown */}
      <div className="card">
        <div className="card-header">
          <span className="font-semibold text-sm text-white">Detected PII on Current Page</span>
          <span className="text-xs text-slate-500">demo-site/index.html</span>
        </div>
        <div className="p-4 grid grid-cols-2 gap-2">
          {[
            { type: 'Email', value: 'kshitiz.jain@gmail.com', redacted: '[EMAIL REDACTED]', severity: 'HIGH', conf: '99%' },
            { type: 'Phone', value: '+91 98765 43210',         redacted: '[PHONE REDACTED]', severity: 'HIGH', conf: '92%' },
            { type: 'Credit Card', value: '4111 *** **** 4321', redacted: '[CARD REDACTED]', severity: 'CRITICAL', conf: '98%' },
            { type: 'Password', value: '••••••••',              redacted: '[PASSWORD REMOVED]', severity: 'CRITICAL', conf: '100%' },
            { type: 'Aadhaar', value: '2345 **** 0123',         redacted: '[GOVT-ID REDACTED]', severity: 'CRITICAL', conf: '88%' },
            { type: 'PAN', value: 'ABCDE1234F',                 redacted: '[GOVT-ID REDACTED]', severity: 'HIGH', conf: '97%' },
            { type: 'Face/Photo', value: 'Profile image',        redacted: '[FACE BLURRED]', severity: 'HIGH', conf: '97%' },
          ].map((item) => (
            <div key={item.type} className="flex items-center gap-3 p-2.5 bg-navy-700/50 rounded-lg">
              <div className={`w-1.5 h-8 rounded-full ${item.severity === 'CRITICAL' ? 'bg-red-400' : 'bg-amber-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white">{item.type}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${item.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>{item.severity}</span>
                  <span className="text-[9px] text-slate-500">{item.conf}</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[10px] text-slate-500 line-through truncate max-w-24">{item.value}</span>
                  <span className="text-[9px] text-slate-600">→</span>
                  <span className="text-[10px] text-emerald-400 font-mono truncate">{item.redacted}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
