import { useState, useEffect, useRef } from 'react'
import {
  Zap, Play, Clock, ArrowRight, RefreshCw,
  MessageSquare, Eye, Terminal, User, Bot, Layers,
  ChevronDown, Check
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ConversationTurn {
  stepNumber: number
  task: string
  promptSentToLLM: string
  rawLLMResponse: string
  parsedAction: {
    action: string
    target?: { type?: string; value?: string }
    value?: string
    reason?: string
    confidence?: number
  }
  modelUsed: string
  llmProvider: string
  latencyMs: number
  piiDetected: number
  timestamp: string
  success: boolean
}

interface SessionItem {
  id: string
  task: string
  status: string
  created_at: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SERVER = 'http://localhost:8000/api'

const ACTION_COLORS: Record<string, string> = {
  fill:     'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  click:    'bg-blue-500/20 text-blue-400 border-blue-500/30',
  scroll:   'bg-purple-500/20 text-purple-400 border-purple-500/30',
  navigate: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  done:     'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  wait:     'bg-slate-500/20 text-slate-400 border-slate-500/30',
  select:   'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
}

function buildDemoElements(elementValues: Record<string, string>) {
  return [
    { id: 'origin',      type: 'text',   role: 'origin',         domSelector: '#origin',      interactable: true, visible: true, tagName: 'input',  sensitive: false, attributes: { placeholder: 'City or Airport' }, label: 'From',       value: elementValues['origin']      ?? 'Delhi (DEL)' },
    { id: 'destination', type: 'text',   role: 'destination',    domSelector: '#destination', interactable: true, visible: true, tagName: 'input',  sensitive: false, attributes: { placeholder: 'City or Airport' }, label: 'To',         value: elementValues['destination'] ?? '' },
    { id: 'travel-date', type: 'date',   role: 'Travel Date',    domSelector: '#travel-date', interactable: true, visible: true, tagName: 'input',  sensitive: false, attributes: {},                              label: 'Date',       value: elementValues['travel-date'] ?? '' },
    { id: 'passengers',  type: 'select', role: 'Passengers',     domSelector: '#passengers',  interactable: true, visible: true, tagName: 'select', sensitive: false, attributes: {},                              label: 'Passengers', value: elementValues['passengers']  ?? '1' },
    { id: 'search-btn',  type: 'button', role: 'Search Flights', domSelector: '#search-btn',  interactable: true, visible: true, tagName: 'button', sensitive: false, attributes: {},                              label: 'Search' },
    { id: 'book-ai-202', type: 'button', role: 'Book Air India AI-202 price:₹4299 non-stop DEL→BOM', domSelector: '#book-ai-202', interactable: true, visible: true, tagName: 'button', sensitive: false, attributes: {} },
    { id: 'book-6e-501', type: 'button', role: 'Book IndiGo 6E-501 price:₹3849 non-stop DEL→BOM',   domSelector: '#book-6e-501', interactable: true, visible: true, tagName: 'button', sensitive: false, attributes: {} },
    { id: 'book-sg-101', type: 'button', role: 'Book SpiceJet SG-101 price:₹3599 non-stop DEL→BOM', domSelector: '#book-sg-101', interactable: true, visible: true, tagName: 'button', sensitive: false, attributes: {} },
  ]
}

// ── Chat Turn Component ────────────────────────────────────────────────────────

function ChatTurn({ turn, index }: { turn: ConversationTurn; index: number }) {
  const [expanded, setExpanded] = useState(index === 0)
  const ac = turn.parsedAction.action
  const colorClass = ACTION_COLORS[ac] || ACTION_COLORS.wait

  return (
    <div className="border border-slate-700/60 rounded-xl overflow-hidden bg-navy-900/60">
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/3 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs flex items-center justify-center font-bold shrink-0">
          {turn.stepNumber}
        </span>
        <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold border uppercase ${colorClass}`}>
          {ac}
        </span>
        {turn.parsedAction.target?.value && (
          <span className="text-xs font-mono text-cyan-300">#{turn.parsedAction.target.value}</span>
        )}
        {turn.parsedAction.value && (
          <span className="text-xs font-mono text-amber-400">= "{turn.parsedAction.value}"</span>
        )}
        <span className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <span className="text-emerald-400 font-semibold text-[10px]">{turn.piiDetected} PII redacted</span>
          <span className="flex items-center gap-1 font-mono"><Clock className="w-3 h-3" />{turn.latencyMs}ms</span>
          <span className="text-slate-600">{turn.timestamp}</span>
        </span>
      </div>

      {expanded && (
        <div className="border-t border-slate-700/50 divide-y divide-slate-700/40">
          {/* PROMPT */}
          <div className="p-4 space-y-2 bg-navy-950/60">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <User className="w-3.5 h-3.5 text-cyan-400" />
              <span>Prompt Sent to LLM</span>
              <span className="ml-auto text-[10px] text-slate-600 normal-case font-normal tracking-normal">
                {turn.modelUsed} · {turn.llmProvider}
              </span>
            </div>
            <pre className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap bg-navy-900 border border-slate-800 rounded-lg p-3 max-h-72 overflow-y-auto font-mono">
              {turn.promptSentToLLM || '(No prompt log recorded for this step)'}
            </pre>
          </div>

          {/* RAW RESPONSE */}
          <div className="p-4 space-y-2 bg-navy-900/30">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <Bot className="w-3.5 h-3.5 text-emerald-400" />
              <span>Raw LLM Response</span>
              <span className="ml-auto text-[10px] font-normal normal-case tracking-normal text-emerald-400">
                {turn.success ? '✓ Parsed successfully' : '⚠ Fallback used'}
              </span>
            </div>
            <pre className="text-[11px] text-emerald-300 leading-relaxed whitespace-pre-wrap bg-navy-900 border border-emerald-900/50 rounded-lg p-3 font-mono">
              {turn.rawLLMResponse || JSON.stringify(turn.parsedAction, null, 2)}
            </pre>
          </div>

          {/* PARSED ACTION */}
          <div className="p-4 space-y-2 bg-slate-800/20">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <Terminal className="w-3.5 h-3.5 text-amber-400" />
              <span>Parsed Action Executed in Browser</span>
            </div>
            <div className="text-[11px] font-mono text-amber-300 bg-navy-900 border border-amber-900/40 rounded-lg p-3 space-y-0.5">
              <div><span className="text-slate-500">action:</span>    <span className="text-white font-bold">{turn.parsedAction.action}</span></div>
              {turn.parsedAction.target?.value && <div><span className="text-slate-500">target:</span>    <span className="text-cyan-400">{turn.parsedAction.target.value}</span></div>}
              {turn.parsedAction.value        && <div><span className="text-slate-500">value:</span>     <span className="text-amber-400">"{turn.parsedAction.value}"</span></div>}
              {turn.parsedAction.reason       && <div><span className="text-slate-500">reason:</span>    <span className="text-slate-300">{turn.parsedAction.reason}</span></div>}
              {turn.parsedAction.confidence != null && <div><span className="text-slate-500">confidence:</span> <span className="text-emerald-400">{Math.round(turn.parsedAction.confidence * 100)}%</span></div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LiveSession() {
  const [taskInput, setTaskInput]   = useState('Find cheapest flight Delhi to Mumbai and book it')
  const [sessions, setSessions]     = useState<SessionItem[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [isRunning, setIsRunning]   = useState(false)
  const [turns, setTurns]           = useState<ConversationTurn[]>([])
  const [activeView, setActiveView] = useState<'chat' | 'trace'>('chat')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevTurnsLength = useRef(0)

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (isRunning && turns.length > prevTurnsLength.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevTurnsLength.current = turns.length
  }, [turns, isRunning])

  // ── Poll Sessions & DB History ──────────────────────────────────────────────

  const fetchSessionActions = async (sid: string) => {
    try {
      const res = await fetch(`${SERVER}/sessions/${sid}/actions`)
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data)) {
        setTurns(prev => {
          // If step count hasn't changed and last action ID matches, preserve existing array to prevent re-render scroll jumping
          if (data.length === prev.length && data.length > 0 && prev.length > 0) {
            const lastNew = data[data.length - 1]
            const lastPrevStep = prev[prev.length - 1].stepNumber
            if (lastNew.step === lastPrevStep) {
              return prev
            }
          }
          return data.map((a: any) => ({
            stepNumber: a.step,
            task: '',
            promptSentToLLM: a.promptSentToLLM || '(No prompt log available)',
            rawLLMResponse: a.rawLLMResponse || JSON.stringify(a.action, null, 2),
            parsedAction: a.action || {},
            modelUsed: a.modelUsed || 'unknown',
            llmProvider: 'server',
            latencyMs: a.latency_ms || 0,
            piiDetected: 0,
            timestamp: a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : '',
            success: a.success ?? true,
          }))
        })
      }
    } catch {
      // Ignore poll errors
    }
  }

  const fetchSessions = async () => {
    try {
      const res = await fetch(`${SERVER}/sessions`)
      if (!res.ok) return
      const list: SessionItem[] = await res.json()
      setSessions(list)
      if (list.length > 0 && !selectedSessionId) {
        setSelectedSessionId(list[0].id)
      }
    } catch {
      // Ignore network error
    }
  }

  // Poll recent sessions every 2 seconds
  useEffect(() => {
    fetchSessions()
    const timer = setInterval(() => {
      fetchSessions()
      if (selectedSessionId && !isRunning) {
        fetchSessionActions(selectedSessionId)
      }
    }, 2000)
    return () => clearInterval(timer)
  }, [selectedSessionId, isRunning])

  // Refetch actions and sync task input when selectedSessionId changes
  useEffect(() => {
    if (selectedSessionId) {
      fetchSessionActions(selectedSessionId)
      const found = sessions.find(s => s.id === selectedSessionId)
      if (found && found.task) {
        setTaskInput(found.task)
      }
    }
  }, [selectedSessionId, sessions])

  const handleSelectSession = (sid: string) => {
    setSelectedSessionId(sid)
    const found = sessions.find(s => s.id === sid)
    if (found && found.task) {
      setTaskInput(found.task)
    }
  }

  /** Run a direct simulation step against server */
  async function runStep(
    sid: string,
    stepNumber: number,
    task: string,
    previousActions: object[],
    elementValues: Record<string, string>,
  ): Promise<{ turn: ConversationTurn; updatedValues: Record<string, string> } | null> {
    const elements = buildDemoElements(elementValues)

    const pageText = [
      'Flight Search Page — AirVoyage Demo',
      `Origin: ${elementValues['origin'] || 'Delhi (DEL)'}`,
      `Destination: ${elementValues['destination'] || '(not set)'}`,
      'Available flights after search:',
      '  Air India AI-202  06:15→08:30  price:₹4299  Non-stop',
      '  IndiGo 6E-501     09:45→12:05  price:₹3849  Non-stop',
      '  SpiceJet SG-101   13:20→15:40  price:₹3599  Non-stop  ← cheapest',
    ].join('\n')

    const body = {
      task,
      sessionId: sid,
      context: {
        pageUrl:   'http://localhost:3000',
        pageTitle: 'AirVoyage — Book Flights Instantly',
        pageType:  'travel_booking',
        timestamp: Date.now(),
        elements,
        sanitizedText: pageText,
        ocrTexts: [],
        piiSummary: { totalDetected: 0, totalRedacted: 0, byType: {} },
        screenshotIncluded: false,
      },
      previousActions: previousActions.map((a: any, i) => ({ ...a, step: i + 1 })),
      stepNumber,
    }

    try {
      const res  = await fetch(`${SERVER}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      const action = data.action || {}

      const nextValues = { ...elementValues }
      if (action.action === 'fill' && action.target?.value && action.value) {
        const id = action.target.value.replace(/^#/, '')
        nextValues[id] = action.value
      }

      const turn: ConversationTurn = {
        stepNumber,
        task,
        promptSentToLLM: data.promptSentToLLM || '(prompt unavailable)',
        rawLLMResponse:  data.rawLLMResponse  || '(raw response unavailable)',
        parsedAction: action,
        modelUsed:    data.modelUsed   || 'unknown',
        llmProvider:  data.llmProvider || 'unknown',
        latencyMs:    data.serverLatencyMs || 0,
        piiDetected:  0,
        timestamp:    new Date().toLocaleTimeString(),
        success:      res.ok,
      }

      return { turn, updatedValues: nextValues }
    } catch {
      return null
    }
  }

  async function handleStartTask() {
    if (!taskInput.trim() || isRunning) return
    const sid = `session-${Date.now().toString().slice(-6)}`
    setSelectedSessionId(sid)
    setTurns([])
    setIsRunning(true)
    setActiveView('chat')

    await fetch(`${SERVER}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sid, taskInstruction: taskInput }),
    }).catch(() => {})

    const previousActions: object[] = []
    let elementValues: Record<string, string> = { origin: 'Delhi (DEL)', destination: '', 'travel-date': '', passengers: '1' }

    for (let step = 1; step <= 8; step++) {
      const result = await runStep(sid, step, taskInput, previousActions, elementValues)
      if (!result) break

      const { turn, updatedValues } = result
      elementValues = updatedValues

      setTurns(prev => [...prev, turn])
      previousActions.push(turn.parsedAction)

      if (turn.parsedAction.action === 'done') break
      await new Promise(r => setTimeout(r, 500))
    }

    setIsRunning(false)
  }

  return (
    <div className="space-y-5 h-full flex flex-col">
      {/* Header & Session Selector */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-white">Live Session — LLM Transparency</h2>
          <p className="text-slate-400 text-sm mt-1">
            Real-time inspection of prompts & responses for both Chrome Extension and Dashboard runs
          </p>
        </div>

        <div className="flex items-center gap-3 relative" ref={dropdownRef}>
          {sessions.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(open => !open)}
                className="flex items-center gap-2.5 bg-navy-900 hover:bg-slate-800/90 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-200 shadow-sm transition-colors cursor-pointer"
              >
                <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="font-mono text-cyan-300 max-w-[280px] truncate">
                  {(() => {
                    const sel = sessions.find(s => s.id === selectedSessionId)
                    if (!sel) return 'Select Session'
                    const sid = sel.id.startsWith('session-') ? sel.id.replace('session-', '').slice(0, 8) : sel.id.slice(0, 8)
                    const t = sel.task ? (sel.task.length > 30 ? sel.task.slice(0, 30) + '…' : sel.task) : 'Session'
                    return `#${sid} — ${t}`
                  })()}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-max min-w-[340px] max-w-[460px] bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-xl shadow-2xl z-50 py-1.5 max-h-80 overflow-y-auto">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800 mb-1">
                    Select Execution Session ({sessions.length})
                  </div>
                  {sessions.map(s => {
                    const shortId = s.id.startsWith('session-') ? s.id.replace('session-', '').slice(0, 8) : s.id.slice(0, 8)
                    const isSel = s.id === selectedSessionId
                    return (
                      <div
                        key={s.id}
                        onClick={() => {
                          handleSelectSession(s.id)
                          setDropdownOpen(false)
                        }}
                        className={`px-3 py-2 text-xs flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                          isSel ? 'bg-cyan-500/15 text-cyan-300 font-semibold' : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                        }`}
                      >
                        <span className="font-mono text-cyan-400/90 shrink-0">#{shortId}</span>
                        <span className="truncate flex-1 font-sans text-slate-200">{s.task || 'Session'}</span>
                        {isSel && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Task input */}
      <div className="card p-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-cyan-400" />
          </div>
          <input
            type="text"
            value={taskInput}
            onChange={e => setTaskInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleStartTask()}
            placeholder="e.g. Find cheapest flight Delhi to Mumbai and book it"
            className="flex-1 bg-navy-900 border border-slate-700/60 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
          />
          <button
            onClick={handleStartTask}
            disabled={isRunning}
            className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-navy-950 font-bold px-5 py-2.5 rounded-lg text-sm transition-all flex items-center gap-2 shrink-0"
          >
            {isRunning
              ? <><RefreshCw className="w-4 h-4 animate-spin" /><span>Running…</span></>
              : <><Play className="w-4 h-4 fill-current" /><span>Simulate Task</span></>
            }
          </button>
        </div>
      </div>

      {/* View toggle */}
      {turns.length > 0 && (
        <div className="flex gap-2 shrink-0">
          {[
            { id: 'chat',  label: 'LLM Chat View',  icon: MessageSquare },
            { id: 'trace', label: 'Action Trace',    icon: Eye },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveView(id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeView === id
                  ? 'bg-cyan-500 text-navy-950'
                  : 'bg-navy-800 text-slate-400 hover:text-white border border-slate-700/50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-500 self-center">
            {turns.length} step{turns.length !== 1 ? 's' : ''} recorded for session <span className="font-mono text-cyan-400">{selectedSessionId}</span>
          </span>
        </div>
      )}

      {/* ── CHAT VIEW ── */}
      {activeView === 'chat' && (
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {turns.length === 0 && !isRunning && (
            <div className="text-center py-20 text-slate-600">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-sm">No session steps found yet.</p>
              <p className="text-xs mt-1 opacity-60">Run a task in Chrome Extension or click Simulate Task above. History will stream here live!</p>
            </div>
          )}
          {turns.map((turn, i) => (
            <ChatTurn key={turn.stepNumber} turn={turn} index={i} />
          ))}
          {isRunning && turns.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 text-xs text-slate-500">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              <span>Waiting for LLM response on step {turns.length + 1}…</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* ── ACTION TRACE VIEW ── */}
      {activeView === 'trace' && (
        <div className="flex-1 overflow-y-auto">
          <div className="card">
            <div className="card-header">
              <span className="font-semibold text-sm text-white">Action Execution Trace</span>
              <span className="text-xs text-slate-500">{turns.length} steps</span>
            </div>
            <div className="p-4 space-y-2">
              {turns.map(turn => {
                const ac = turn.parsedAction.action
                const colorClass = ACTION_COLORS[ac] || ACTION_COLORS.wait
                return (
                  <div key={turn.stepNumber} className="p-3 bg-navy-900/80 border border-slate-700/50 rounded-xl flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs flex items-center justify-center font-bold shrink-0">
                      {turn.stepNumber}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold border uppercase ${colorClass}`}>{ac}</span>
                    {turn.parsedAction.target?.value && (
                      <span className="text-xs font-mono text-cyan-300">#{turn.parsedAction.target.value}</span>
                    )}
                    {turn.parsedAction.value && (
                      <span className="text-xs font-mono text-amber-400">= "{turn.parsedAction.value}"</span>
                    )}
                    <span className="ml-auto flex items-center gap-3 text-xs text-slate-500">
                      <ArrowRight className="w-3 h-3 shrink-0" />
                      <span className="text-slate-400 truncate max-w-64">{turn.parsedAction.reason}</span>
                      <span className="font-mono shrink-0">{turn.latencyMs}ms</span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
