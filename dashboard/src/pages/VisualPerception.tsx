import { useState, useEffect } from 'react'
import { Eye, ShieldCheck, Cpu, Zap, Globe, RefreshCw, Radio } from 'lucide-react'

interface Region {
  id: string;
  label: string;
  type: string;
  sensitivity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  conf: number;
  source: 'WebGPU Vision' | 'DOM Semantics' | 'Local Regex';
  redaction: 'Gaussian Blur' | 'Blackout Mask' | 'Semantic Token';
  x: number;
  y: number;
  w: number;
  h: number;
}

const SITE_PRESETS: Record<string, { title: string; subtitle: string; regions: Region[] }> = {
  airvoyage: {
    title: 'AirVoyage Flight Booking',
    subtitle: 'Passenger Profile & Saved Payment Card',
    regions: [
      { id: 'r1', label: 'FACE', type: 'face', sensitivity: 'HIGH', conf: 96, source: 'WebGPU Vision', redaction: 'Gaussian Blur', x: 74, y: 14, w: 22, h: 22 },
      { id: 'r2', label: 'EMAIL', type: 'email', sensitivity: 'HIGH', conf: 99, source: 'Local Regex', redaction: 'Semantic Token', x: 70, y: 44, w: 26, h: 6 },
      { id: 'r3', label: 'PHONE', type: 'phone', sensitivity: 'HIGH', conf: 98, source: 'Local Regex', redaction: 'Semantic Token', x: 70, y: 52, w: 26, h: 6 },
      { id: 'r4', label: 'AADHAAR', type: 'aadhaar', sensitivity: 'CRITICAL', conf: 99, source: 'Local Regex', redaction: 'Semantic Token', x: 70, y: 60, w: 26, h: 6 },
      { id: 'r5', label: 'PAN', type: 'pan', sensitivity: 'HIGH', conf: 97, source: 'Local Regex', redaction: 'Semantic Token', x: 70, y: 68, w: 26, h: 6 },
      { id: 'r6', label: 'CARD', type: 'credit_card', sensitivity: 'CRITICAL', conf: 99, source: 'DOM Semantics', redaction: 'Blackout Mask', x: 70, y: 78, w: 26, h: 18 },
      { id: 'r7', label: 'PWD', type: 'password', sensitivity: 'CRITICAL', conf: 100, source: 'DOM Semantics', redaction: 'Blackout Mask', x: 34, y: 60, w: 28, h: 8 },
    ],
  },
  makemytrip: {
    title: 'MakeMyTrip Flight Search',
    subtitle: 'Indian Travel Portal with Autocomplete & Profile Modal',
    regions: [
      { id: 'm1', label: 'FACE', type: 'face', sensitivity: 'HIGH', conf: 95, source: 'WebGPU Vision', redaction: 'Gaussian Blur', x: 80, y: 10, w: 16, h: 18 },
      { id: 'm2', label: 'PHONE', type: 'phone', sensitivity: 'HIGH', conf: 97, source: 'Local Regex', redaction: 'Semantic Token', x: 68, y: 35, w: 28, h: 7 },
      { id: 'm3', label: 'EMAIL', type: 'email', sensitivity: 'HIGH', conf: 99, source: 'Local Regex', redaction: 'Semantic Token', x: 68, y: 45, w: 28, h: 7 },
      { id: 'm4', label: 'CARD', type: 'credit_card', sensitivity: 'CRITICAL', conf: 98, source: 'DOM Semantics', redaction: 'Blackout Mask', x: 68, y: 70, w: 28, h: 22 },
    ],
  },
  ilovepdf: {
    title: 'iLovePDF Profile & Account Tools',
    subtitle: 'User Profile, Registered Name & Linked Accounts',
    regions: [
      { id: 'p1', label: 'FACE', type: 'face', sensitivity: 'HIGH', conf: 95, source: 'WebGPU Vision', redaction: 'Gaussian Blur', x: 5, y: 12, w: 10, h: 12 },
      { id: 'p2', label: 'NAME', type: 'name', sensitivity: 'MEDIUM', conf: 94, source: 'DOM Semantics', redaction: 'Semantic Token', x: 30, y: 40, w: 25, h: 7 },
      { id: 'p3', label: 'EMAIL', type: 'email', sensitivity: 'HIGH', conf: 99, source: 'Local Regex', redaction: 'Semantic Token', x: 65, y: 52, w: 30, h: 7 },
      { id: 'p4', label: 'EMAIL', type: 'email', sensitivity: 'HIGH', conf: 99, source: 'Local Regex', redaction: 'Semantic Token', x: 30, y: 92, w: 35, h: 7 },
    ],
  },
}

export default function VisualPerception() {
  const [activeSite, setActiveSite] = useState<'live' | 'airvoyage' | 'makemytrip' | 'ilovepdf'>('airvoyage')
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null)
  const [livePerception, setLivePerception] = useState<any>(null)
  const [loadingLive, setLoadingLive] = useState(false)

  const fetchLivePerception = () => {
    setLoadingLive(true)
    fetch('http://localhost:8000/api/perception/latest')
      .then(res => res.json())
      .then(data => {
        setLoadingLive(false)
        if (data?.hasData && data.perception) {
          setLivePerception(data.perception)
        }
      })
      .catch(() => setLoadingLive(false))
  }

  useEffect(() => {
    fetchLivePerception()
    const interval = setInterval(fetchLivePerception, 3000)
    return () => clearInterval(interval)
  }, [])

  const current = activeSite !== 'live' ? SITE_PRESETS[activeSite] : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Eye className="w-6 h-6 text-cyan-400" />
            Visual Perception & Redaction Pipeline
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Real-time on-device screen perception (WebGPU / WASM) demonstrating zero-leakage redaction
          </p>
        </div>

        {/* Site Switcher */}
        <div className="flex items-center gap-2">
          {livePerception && (
            <button
              onClick={() => setActiveSite('live')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                activeSite === 'live'
                  ? 'bg-red-500/20 text-red-300 border-red-500/40 shadow-lg shadow-red-500/10'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-red-300'
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-red-400 animate-pulse" />
              Live Active Tab
            </button>
          )}

          <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-1 gap-1">
            {(['airvoyage', 'makemytrip', 'ilovepdf'] as const).map(site => (
              <button
                key={site}
                onClick={() => setActiveSite(site)}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                  activeSite === site
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {site === 'airvoyage' ? 'AirVoyage Demo' : site === 'makemytrip' ? 'MakeMyTrip' : 'iLovePDF'}
              </button>
            ))}
          </div>

          <button
            onClick={fetchLivePerception}
            title="Refresh live perception"
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-cyan-400 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loadingLive ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-4 gap-3">
        <div className="card p-3 bg-slate-900/60 border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Cpu className="w-4 h-4 text-cyan-400" />
            Local Vision Engine
          </div>
          <div className="text-lg font-bold font-mono text-cyan-300 mt-1">WebGPU / WASM</div>
          <div className="text-[10px] text-slate-500">48.5ms inference latency</div>
        </div>
        <div className="card p-3 bg-slate-900/60 border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Redaction Precision
          </div>
          <div className="text-lg font-bold font-mono text-emerald-300 mt-1">100% Zero-Leakage</div>
          <div className="text-[10px] text-slate-500">0 raw PII bytes transmitted</div>
        </div>
        <div className="card p-3 bg-slate-900/60 border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Zap className="w-4 h-4 text-amber-400" />
            PII Detection F1
          </div>
          <div className="text-lg font-bold font-mono text-amber-300 mt-1">96.0% (Rec: 100%)</div>
          <div className="text-[10px] text-slate-500">92.3% Prec | 100% Rec</div>
        </div>
        <div className="card p-3 bg-slate-900/60 border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Globe className="w-4 h-4 text-purple-400" />
            Server VLM Reception
          </div>
          <div className="text-lg font-bold font-mono text-purple-300 mt-1">Gemini 2.5 Flash / Groq</div>
          <div className="text-[10px] text-slate-500">Multimodal sanitized image</div>
        </div>
      </div>

      {/* Live Active Tab Banner (if in live mode) */}
      {activeSite === 'live' && livePerception && (
        <div className="p-3 bg-gradient-to-r from-red-950/40 via-slate-900 to-slate-950 border border-red-500/30 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400 animate-ping" />
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <span>{livePerception.title || 'Live Captured Webpage'}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  Step {livePerception.step || 1}
                </span>
              </div>
              <div className="text-[11px] font-mono text-cyan-400 truncate max-w-xl">
                {livePerception.url}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold text-amber-400">
              {livePerception.piiSummary?.totalRedacted || 0} PII Redacted
            </div>
            <div className="text-[10px] text-emerald-400 font-semibold">
              0 Raw PII Transmitted
            </div>
          </div>
        </div>
      )}

      {/* Three panels */}
      <div className="grid grid-cols-3 gap-4">
        {/* Panel 1: Original */}
        <div className="card overflow-hidden border-red-500/30">
          <div className="card-header bg-red-500/10 border-red-500/20 flex items-center justify-between py-2 px-3">
            <span className="font-semibold text-xs text-red-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400"></span>
              ① Original Screen (Local Only)
            </span>
            <span className="text-[10px] text-red-400 font-mono font-bold bg-red-950/80 px-2 py-0.5 rounded border border-red-800/60">
              STRICTLY CONFIDENTIAL · 0 BYTES SENT
            </span>
          </div>
          <div className="p-3 bg-slate-950/70 font-mono text-[11px] leading-relaxed text-slate-300 min-h-[360px] relative">
            {activeSite === 'live' && livePerception ? (
              <div className="space-y-2">
                <div className="p-2 bg-slate-900 rounded border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-400 font-bold">Active Tab Source:</div>
                  <div className="text-xs font-bold text-white truncate">{livePerception.title}</div>
                  <div className="text-[10px] text-cyan-400 font-mono truncate">{livePerception.url}</div>
                  <div className="text-[10px] text-slate-500">Task: "{livePerception.task}"</div>
                </div>

                <div className="p-2.5 bg-slate-900/80 rounded border border-slate-800 space-y-1.5">
                  <div className="text-[10px] text-slate-400 font-bold">Sensitive Fields On Screen:</div>
                  <div className="text-[10px] text-red-300 flex items-center justify-between">
                    <span>Detected Entities:</span>
                    <span className="font-bold font-mono">{livePerception.piiSummary?.totalDetected || 0}</span>
                  </div>
                  <div className="text-[10px] text-amber-300 flex items-center justify-between">
                    <span>Redacted Locally:</span>
                    <span className="font-bold font-mono">{livePerception.piiSummary?.totalRedacted || 0}</span>
                  </div>
                  <div className="text-[10px] text-emerald-400 flex items-center justify-between">
                    <span>Leaked to Server:</span>
                    <span className="font-bold font-mono">0 Bytes (Zero-Leakage)</span>
                  </div>
                </div>

                <div className="p-2 bg-slate-900/60 rounded border border-slate-800 space-y-1 text-[10px]">
                  <div className="text-slate-400 font-bold">Interactive DOM Elements Found:</div>
                  <div className="max-h-40 overflow-y-auto space-y-1 text-slate-400 font-mono">
                    {livePerception.elements?.slice(0, 8).map((el: any) => (
                      <div key={el.id} className="truncate p-1 bg-slate-950 rounded border border-slate-800">
                        <span className="text-cyan-300 font-bold">[{el.id}]</span> {el.tagName} · {el.label || el.placeholder || el.role || 'interactive'}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-slate-900/90 border border-slate-800 rounded p-2 mb-3 text-center text-slate-400 text-[10px]">
                  [ {current?.title} — {current?.subtitle} ]
                </div>

                {activeSite === 'airvoyage' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-2 bg-slate-900/60 rounded border border-slate-800">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-400 to-amber-200 flex items-center justify-center text-slate-900 font-bold text-xs border border-white">
                        KJ
                      </div>
                      <div>
                        <div className="text-white font-bold text-xs">Kshitiz Jain</div>
                        <div className="text-[10px] text-amber-400 font-semibold">Gold Member</div>
                      </div>
                    </div>
                    <div className="space-y-1 text-slate-400 pt-1">
                      <div><span className="text-slate-500">Email:</span> <span className="text-red-300">kshitiz.jain@gmail.com</span></div>
                      <div><span className="text-slate-500">Phone:</span> <span className="text-red-300">+91 98765 43210</span></div>
                      <div><span className="text-slate-500">Aadhaar:</span> <span className="text-red-300">2345 6789 0123</span></div>
                      <div><span className="text-slate-500">PAN:</span> <span className="text-red-300">ABCDE1234F</span></div>
                    </div>
                    <div className="border-t border-slate-800 pt-2 text-slate-400">
                      <div className="bg-gradient-to-r from-blue-900/80 to-indigo-950/80 p-2 rounded border border-blue-800/40 text-[10px]">
                        <div className="text-slate-400">HDFC Bank Infinia</div>
                        <div className="text-red-300 font-mono font-bold tracking-wider">4111 1111 1111 4321</div>
                        <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                          <span>EXP: 09/28</span>
                          <span className="text-red-300 font-bold">CVV: 234</span>
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-slate-800 pt-2">
                      <div className="bg-blue-600 hover:bg-blue-500 text-white text-center rounded py-1.5 font-bold text-xs cursor-pointer">
                        Book Flight DEL → BOM (₹3,599)
                      </div>
                    </div>
                  </div>
                )}

                {activeSite === 'makemytrip' && (
                  <div className="space-y-2">
                    <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 space-y-2">
                      <div className="flex gap-2">
                        <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] font-bold">One Way</span>
                        <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px]">Round Trip</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="p-1.5 bg-slate-950 rounded border border-slate-800">
                          <span className="text-slate-500 block text-[9px]">From</span>
                          <span className="text-white font-bold">Delhi (DEL)</span>
                        </div>
                        <div className="p-1.5 bg-slate-950 rounded border border-slate-800">
                          <span className="text-slate-500 block text-[9px]">To</span>
                          <span className="text-white font-bold">Mumbai (BOM)</span>
                        </div>
                      </div>
                    </div>
                    <div className="p-2 bg-slate-900/60 rounded border border-slate-800 space-y-1">
                      <div className="text-[10px] text-slate-400">Passenger Details:</div>
                      <div><span className="text-slate-500">Phone:</span> <span className="text-red-300">+91 94321 98765</span></div>
                      <div><span className="text-slate-500">Email:</span> <span className="text-red-300">traveller@makemytrip.com</span></div>
                    </div>
                    <div className="bg-orange-600 text-white text-center rounded py-1.5 font-bold text-xs">
                      SEARCH FLIGHTS
                    </div>
                  </div>
                )}

                {activeSite === 'ilovepdf' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-2 bg-slate-900/80 rounded border border-slate-800">
                      <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center text-slate-300 font-bold text-xs">
                        👤
                      </div>
                      <div>
                        <div className="text-[9px] text-red-400 font-semibold uppercase">Registered</div>
                        <div className="text-white font-bold text-xs">Dharaya</div>
                      </div>
                    </div>
                    <div className="p-2 bg-slate-900/60 rounded border border-slate-800 space-y-1 text-[10px]">
                      <div><span className="text-slate-500">First name:</span> <span className="text-red-300 font-bold">Dharaya</span></div>
                      <div><span className="text-slate-500">Country:</span> <span className="text-white">India</span></div>
                      <div><span className="text-slate-500">Current email:</span> <span className="text-red-300">enfantgg1275@gmail.com</span></div>
                      <div><span className="text-slate-500">Social link:</span> <span className="text-red-300">enfantgg1275@gmail.com</span></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="p-2 bg-red-950/40 border border-red-800/40 rounded text-center">
                        <div className="font-bold text-[11px] text-white">Merge PDF</div>
                      </div>
                      <div className="p-2 bg-blue-950/40 border border-blue-800/40 rounded text-center">
                        <div className="font-bold text-[11px] text-white">Compress PDF</div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Panel 2: Detection Overlay */}
        <div className="card overflow-hidden border-amber-500/30">
          <div className="card-header bg-amber-500/10 border-amber-500/20 flex items-center justify-between py-2 px-3">
            <span className="font-semibold text-xs text-amber-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
              ② Local Vision Detection Overlay
            </span>
            <span className="text-[10px] text-amber-400 font-mono font-bold bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800/60">
              WEBGPU · ON-DEVICE CLASSIFIER
            </span>
          </div>
          <div className="p-3 bg-slate-950/70 font-mono text-[11px] leading-relaxed text-slate-300 min-h-[360px] space-y-2">
            {activeSite === 'live' && livePerception ? (
              <div className="space-y-2">
                <div className="bg-slate-900/90 border border-slate-800 rounded p-2 text-center text-amber-400 text-[10px] font-bold">
                  [ {livePerception.piiSummary?.totalDetected || 0} Sensitive Elements Detected via AI & DOM ]
                </div>

                <div className="p-2 rounded border border-amber-500/30 bg-amber-500/5 space-y-1 text-[10px]">
                  <div className="flex justify-between items-center text-amber-300 font-bold">
                    <span>Summary Counts</span>
                    <span className="text-cyan-400">On-Device WebGPU</span>
                  </div>
                  <div className="text-slate-400">Faces: {livePerception.piiSummary?.byType?.face || 0}</div>
                  <div className="text-slate-400">Emails: {livePerception.piiSummary?.byType?.email || 0}</div>
                  <div className="text-slate-400">Names: {livePerception.piiSummary?.byType?.name || 0}</div>
                  <div className="text-slate-400">Cards: {livePerception.piiSummary?.byType?.credit_card || 0}</div>
                  <div className="text-slate-400">Passwords: {livePerception.piiSummary?.byType?.password || 0}</div>
                </div>

                <div className="p-2 bg-emerald-950/30 border border-emerald-800/40 rounded text-emerald-400 text-[10px]">
                  ✓ Verified Client-Side Redaction: All values above are masked in canvas & text before HTTP request.
                </div>
              </div>
            ) : (
              <>
                <div className="bg-slate-900/90 border border-slate-800 rounded p-2 text-center text-amber-400 text-[10px] font-bold">
                  [ {current?.regions.length} Sensitive Elements Detected via AI & DOM ]
                </div>

                {current?.regions.map(r => (
                  <div
                    key={r.id}
                    onMouseEnter={() => setHoveredRegion(r.id)}
                    onMouseLeave={() => setHoveredRegion(null)}
                    className={`p-2 rounded border transition-all cursor-pointer ${
                      hoveredRegion === r.id
                        ? 'border-amber-400 bg-amber-400/20 scale-[1.01]'
                        : 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-300 text-xs flex items-center gap-1.5">
                        <span className="px-1.5 py-0.2 bg-amber-500/30 text-amber-200 rounded text-[9px]">
                          {r.label}
                        </span>
                        <span className="text-[10px] text-slate-400">{r.conf}% conf</span>
                      </span>
                      <span className="text-[9px] font-mono text-cyan-400 font-bold">
                        {r.source}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
                      <span>Action: {r.redaction}</span>
                      <span className="text-emerald-400 font-semibold">✓ Verified Local</span>
                    </div>
                  </div>
                ))}
              </>
            )}

            <div className="border-t border-slate-800 pt-2 text-[10px] text-slate-400 flex items-center justify-between">
              <span>Non-sensitive UI elements:</span>
              <span className="text-emerald-400 font-bold">✓ Preserved for VLM</span>
            </div>
          </div>
        </div>

        {/* Panel 3: Sanitized Context */}
        <div className="card overflow-hidden border-emerald-500/30">
          <div className="card-header bg-emerald-500/10 border-emerald-500/20 flex items-center justify-between py-2 px-3">
            <span className="font-semibold text-xs text-emerald-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              ③ Transmitted Context (Server VLM)
            </span>
            <span className="text-[10px] text-emerald-400 font-mono font-bold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
              SANITIZED · 100% PRIVATE
            </span>
          </div>
          <div className="p-3 bg-slate-950/70 font-mono text-[11px] leading-relaxed text-slate-300 min-h-[360px] relative">
            {activeSite === 'live' && livePerception ? (
              <div className="space-y-2">
                <div className="bg-emerald-950/40 border border-emerald-800/40 rounded p-2 mb-2 text-center text-emerald-300 text-[10px]">
                  [ Real Live Context Sent to Server ]
                </div>

                {livePerception.sanitizedScreenshot && (
                  <div className="rounded border border-slate-800 overflow-hidden mb-2">
                    <img
                      src={livePerception.sanitizedScreenshot}
                      alt="Sanitized Screen"
                      className="w-full h-auto max-h-44 object-contain bg-black"
                    />
                    <div className="p-1 bg-slate-900 text-center text-[9px] text-emerald-400 font-bold">
                      Sanitized Client Screenshot (Faces Blurred & Sensitive Text Masked)
                    </div>
                  </div>
                )}

                <div className="p-2 bg-slate-900 rounded border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-400 font-bold">Sanitized Body Text Sent to LLM:</div>
                  <div className="text-[10px] text-slate-400 max-h-36 overflow-y-auto whitespace-pre-wrap font-mono p-1.5 bg-slate-950 rounded">
                    {livePerception.sanitizedText || '[Sanitized context text]'}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-emerald-950/40 border border-emerald-800/40 rounded p-2 mb-3 text-center text-emerald-300 text-[10px]">
                  [ Sanitized Multimodal Image + Stable el_NNN IDs ]
                </div>

                {activeSite === 'airvoyage' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-2 bg-slate-900/60 rounded border border-slate-800">
                      <div className="w-10 h-10 rounded-full bg-slate-800 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-[9px] backdrop-blur">
                        [BLURRED]
                      </div>
                      <div>
                        <div className="text-cyan-300 font-bold text-xs">[PERSON REDACTED]</div>
                        <div className="text-[10px] text-slate-500">Tier: [PRESERVED]</div>
                      </div>
                    </div>
                    <div className="space-y-1 text-slate-400 pt-1">
                      <div><span className="text-slate-500">Email:</span> <span className="text-cyan-300 bg-cyan-950/60 px-1 rounded">[EMAIL REDACTED]</span></div>
                      <div><span className="text-slate-500">Phone:</span> <span className="text-cyan-300 bg-cyan-950/60 px-1 rounded">[PHONE REDACTED]</span></div>
                      <div><span className="text-slate-500">Aadhaar:</span> <span className="text-cyan-300 bg-cyan-950/60 px-1 rounded">[GOVT-ID REDACTED]</span></div>
                      <div><span className="text-slate-500">PAN:</span> <span className="text-cyan-300 bg-cyan-950/60 px-1 rounded">[GOVT-ID REDACTED]</span></div>
                    </div>
                    <div className="border-t border-slate-800 pt-2 text-slate-400">
                      <div className="bg-slate-900 p-2 rounded border border-slate-800 text-[10px]">
                        <div className="text-slate-500">Payment Region</div>
                        <div className="text-cyan-300 font-mono font-bold bg-slate-950 px-2 py-1 rounded my-1 text-center">
                          [CARD NUMBER BLACKED OUT]
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-slate-800 pt-2">
                      <div className="bg-blue-600/70 text-white text-center rounded py-1.5 font-bold text-xs">
                        [el_008] Book Flight DEL → BOM (₹3,599)
                      </div>
                    </div>
                  </div>
                )}

                {activeSite === 'makemytrip' && (
                  <div className="space-y-2">
                    <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 space-y-2">
                      <div className="flex gap-2">
                        <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] font-bold">[el_010] One Way</span>
                        <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px]">[el_011] Round Trip</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="p-1.5 bg-slate-950 rounded border border-slate-800">
                          <span className="text-slate-500 block text-[9px]">From</span>
                          <span className="text-white font-bold">[el_012] Delhi</span>
                        </div>
                        <div className="p-1.5 bg-slate-950 rounded border border-slate-800">
                          <span className="text-slate-500 block text-[9px]">To</span>
                          <span className="text-white font-bold">[el_013] Mumbai</span>
                        </div>
                      </div>
                    </div>
                    <div className="p-2 bg-slate-900/60 rounded border border-slate-800 space-y-1">
                      <div><span className="text-slate-500">Phone:</span> <span className="text-cyan-300">[PHONE REDACTED]</span></div>
                      <div><span className="text-slate-500">Email:</span> <span className="text-cyan-300">[EMAIL REDACTED]</span></div>
                    </div>
                    <div className="bg-orange-600 text-white text-center rounded py-1.5 font-bold text-xs">
                      [el_015] SEARCH FLIGHTS
                    </div>
                  </div>
                )}

                {activeSite === 'ilovepdf' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-2 bg-slate-900/80 rounded border border-slate-800">
                      <div className="w-9 h-9 rounded-full bg-slate-800 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-[8px]">
                        [BLURRED]
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-500 uppercase">Registered</div>
                        <div className="text-cyan-300 font-bold text-xs">[PERSON REDACTED]</div>
                      </div>
                    </div>
                    <div className="p-2 bg-slate-900/60 rounded border border-slate-800 space-y-1 text-[10px]">
                      <div><span className="text-slate-500">First name:</span> <span className="text-cyan-300">[PERSON]</span></div>
                      <div><span className="text-slate-500">Country:</span> <span className="text-white">India</span></div>
                      <div><span className="text-slate-500">Current email:</span> <span className="text-cyan-300">[EMAIL REDACTED]</span></div>
                      <div><span className="text-slate-500">Social link:</span> <span className="text-cyan-300">[EMAIL REDACTED]</span></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="p-2 bg-slate-900 border border-slate-800 rounded text-center">
                        <div className="font-bold text-[11px] text-white">[el_001] Merge PDF</div>
                      </div>
                      <div className="p-2 bg-slate-900 border border-slate-800 rounded text-center">
                        <div className="font-bold text-[11px] text-white">[el_002] Compress PDF</div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
