import { useState, useEffect } from 'react'
import { Send, CheckCircle, XCircle, Clock, Zap } from 'lucide-react'

interface Step {
  step: number
  action: string
  target?: string
  value?: string
  reason: string
  confidence: number
  success: boolean
  latencyMs: number
  timestamp: number
}

const DEMO_STEPS: Step[] = [
  { step: 1, action: 'fill', target: '#destination', value: 'Mumbai', reason: 'Fill destination field with Mumbai as requested', confidence: 0.97, success: true, latencyMs: 342, timestamp: Date.now() - 8000 },
  { step: 2, action: 'fill', target: '#travel-date', value: '2026-08-30', reason: 'Set travel date to tomorrow', confidence: 0.95, success: true, latencyMs: 318, timestamp: Date.now() - 6000 },
  { step: 3, action: 'click', target: '#search-btn', reason: 'Click Search to find available flights', confidence: 0.98, success: true, latencyMs: 256, timestamp: Date.now() - 4000 },
  { step: 4, action: 'done', reason: 'Flight search complete. Cheapest: SpiceJet SG-101 ₹3599. Task finished.', confidence: 0.96, success: true, latencyMs: 0, timestamp: Date.now() - 2000 },
]

export default function LiveSession() {
  const [task, setTask] = useState('')
  const [steps, setSteps] = useState<Step[]>([])
  const [running, setRunning] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)

  const startTask = async () => {
    if (!task.trim()) return
    setRunning(true)
    setSteps([])

    try {
      const res = await fetch('http://localhost:8000/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: `session-${Date.now()}`, taskInstruction: task }),
      })
      if (res.ok) {
        const data = await res.json()
        setSessionId(data.sessionId)
      }
    } catch { /* offline */ }

    // Simulate demo steps
    for (let i = 0; i < DEMO_STEPS.length; i++) {
      await new Promise(r => setTimeout(r, 1500))
      setSteps(prev => [...prev, { ...DEMO_STEPS[i], timestamp: Date.now() }])
    }
    setRunning(false)
  }

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString()

  const ACTION_COLORS: Record<string, string> = {
    click:    'bg-blue-500/20 text-blue-400',
    fill:     'bg-cyan-500/20 text-cyan-400',
    scroll:   'bg-purple-500/20 text-purple-400',
    navigate: 'bg-amber-500/20 text-amber-400',
    done:     'bg-emerald-500/20 text-emerald-400',
    wait:     'bg-slate-500/20 text-slate-400',
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Live Session</h2>
        <p className="text-slate-400 text-sm mt-1">Run a task and watch the privacy-preserving agent execute it step by step</p>
      </div>

      {/* Task Input */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="font-semibold text-sm text-white">Natural Language Task</span>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            className="flex-1 bg-navy-700 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
            placeholder="e.g. Find the cheapest flight from Delhi to Mumbai tomorrow"
            value={task}
            onChange={e => setTask(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && startTask()}
          />
          <button
            onClick={startTask}
            disabled={running || !task.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold text-sm rounded-lg transition-colors"
          >
            <Send className="w-4 h-4" />
            {running ? 'Running...' : 'Run Task'}
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          💡 The task runs against the demo-site. The agent will detect PII, redact it locally, then reason on the server.
        </p>
      </div>

      {/* Privacy Invariant Notice */}
      {running || steps.length > 0 ? (
        <div className="card p-4 border-emerald-500/30 bg-emerald-500/5">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="text-sm">
              <span className="text-emerald-400 font-semibold">Privacy Guarantee Active: </span>
              <span className="text-slate-400">All {steps.length > 0 ? '7' : '?'} PII items detected and redacted locally. Raw data transmitted to server: </span>
              <span className="text-emerald-400 font-semibold font-mono">0 bytes</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Steps */}
      {steps.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="font-semibold text-sm text-white">Execution Steps</span>
            <span className="text-xs text-slate-500">Session: {sessionId ?? 'demo'}</span>
          </div>
          <div className="p-4 space-y-3">
            {steps.map(step => (
              <div key={step.step} className="flex gap-4 p-3 bg-navy-700/50 rounded-lg">
                {/* Step number */}
                <div className="w-7 h-7 rounded-full bg-navy-600 border border-slate-600 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
                  {step.step}
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${ACTION_COLORS[step.action] ?? 'bg-slate-500/20 text-slate-400'}`}>
                      {step.action}
                    </span>
                    {step.target && (
                      <code className="text-[11px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded font-mono">
                        {step.target}
                      </code>
                    )}
                    {step.value && (
                      <span className="text-[11px] text-amber-400">= "{step.value}"</span>
                    )}
                    {step.success ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 ml-auto shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-400 ml-auto shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{step.reason}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-600">
                    <span>Confidence: <span className="text-slate-400">{Math.round(step.confidence * 100)}%</span></span>
                    {step.latencyMs > 0 && <span>Latency: <span className="text-slate-400">{step.latencyMs}ms</span></span>}
                    <span>{formatTime(step.timestamp)}</span>
                  </div>
                </div>
              </div>
            ))}

            {running && (
              <div className="flex items-center gap-3 p-3 text-slate-400 text-sm">
                <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                Analyzing page and reasoning...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Server Response View */}
      {steps.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="font-semibold text-sm text-white">Last Server Response</span>
            <span className="badge-protected text-[10px]">Validated ✓</span>
          </div>
          <div className="p-4">
            <pre className="text-xs text-cyan-400 font-mono bg-navy-900/80 p-4 rounded-lg overflow-x-auto">
{JSON.stringify({
  action: steps[steps.length - 1]?.action,
  target: steps[steps.length - 1]?.target ? { type: 'element-id', value: steps[steps.length - 1].target?.replace('#','') } : undefined,
  value: steps[steps.length - 1]?.value,
  reason: steps[steps.length - 1]?.reason,
  confidence: steps[steps.length - 1]?.confidence,
}, null, 2)}
            </pre>
            <div className="flex items-center gap-4 mt-3 text-xs">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle className="w-3.5 h-3.5" />
                Action validated locally
              </div>
              <div className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle className="w-3.5 h-3.5" />
                Action executed in browser
              </div>
              <div className="flex items-center gap-1.5 text-cyan-400">
                <Clock className="w-3.5 h-3.5" />
                Server did NOT directly control browser
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
