import { useState } from 'react'
import { Eye } from 'lucide-react'

// Simulated three-panel perception view
const DETECTED_REGIONS = [
  { label: 'FACE', type: 'face',        sensitivity: 'HIGH',    conf: 97, x: 22, y: 12, w: 13, h: 16 },
  { label: 'EMAIL', type: 'email',       sensitivity: 'HIGH',    conf: 99, x: 22, y: 33, w: 42, h: 4 },
  { label: 'PHONE', type: 'phone',       sensitivity: 'HIGH',    conf: 92, x: 22, y: 40, w: 32, h: 4 },
  { label: 'AADHAAR',type:'aadhaar',     sensitivity: 'CRITICAL',conf: 88, x: 22, y: 47, w: 36, h: 4 },
  { label: 'PAN',   type: 'pan',         sensitivity: 'HIGH',    conf: 97, x: 22, y: 54, w: 24, h: 4 },
  { label: 'CARD',  type: 'credit_card', sensitivity: 'CRITICAL',conf: 98, x: 56, y: 12, w: 36, h: 18 },
  { label: 'PWD',   type: 'password',    sensitivity: 'CRITICAL',conf:100, x: 56, y: 55, w: 36, h: 6 },
]

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f59e0b',
  MEDIUM: '#eab308',
}

export default function VisualPerception() {
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Visual Perception — Three-Panel View</h2>
        <p className="text-slate-400 text-sm mt-1">Local AI detection pipeline: original → annotated → sanitized</p>
      </div>

      {/* Three panels */}
      <div className="grid grid-cols-3 gap-4">
        {/* Panel 1: Original */}
        <div className="card overflow-hidden">
          <div className="card-header bg-red-500/5 border-red-500/20">
            <span className="font-semibold text-sm text-white">① Original Page</span>
            <span className="text-[10px] text-red-400 font-mono">RAW · NOT SENT</span>
          </div>
          <div className="p-3 bg-slate-900/50 font-mono text-[10px] leading-relaxed text-slate-300 space-y-1 min-h-[300px]">
            <div className="bg-blue-900/30 p-2 rounded mb-2 text-center text-slate-400 text-[9px]">[ AirVoyage Demo Page ]</div>
            <div><span className="text-slate-500">Name:</span> <span className="text-red-300">Kshitiz Jain</span></div>
            <div><span className="text-slate-500">Email:</span> <span className="text-red-300">kshitiz.jain@gmail.com</span></div>
            <div><span className="text-slate-500">Phone:</span> <span className="text-red-300">+91 98765 43210</span></div>
            <div><span className="text-slate-500">DOB:</span> <span className="text-red-300">15 March 1995</span></div>
            <div><span className="text-slate-500">Aadhaar:</span> <span className="text-red-300">2345 6789 0123</span></div>
            <div><span className="text-slate-500">PAN:</span> <span className="text-red-300">ABCDE1234F</span></div>
            <div className="border-t border-slate-700/50 pt-1 mt-1">
              <div><span className="text-slate-500">Card:</span> <span className="text-red-300">4111 1111 1111 4321</span></div>
              <div><span className="text-slate-500">CVV:</span> <span className="text-red-300">234</span></div>
              <div><span className="text-slate-500">UPI:</span> <span className="text-red-300">kshitiz.jain@oksbi</span></div>
            </div>
            <div className="border-t border-slate-700/50 pt-1 mt-1">
              <div><span className="text-slate-500">Password:</span> <span className="text-red-300">••••••••••</span></div>
            </div>
            <div className="border-t border-slate-700/50 pt-1 mt-1 text-slate-400">
              <div>From: Delhi (DEL)</div>
              <div>To: [empty]</div>
              <div>Date: [select]</div>
              <div className="mt-1 bg-orange-500 text-white text-center rounded py-1">[ SEARCH ]</div>
            </div>
          </div>
        </div>

        {/* Panel 2: Annotated */}
        <div className="card overflow-hidden">
          <div className="card-header bg-amber-500/5 border-amber-500/20">
            <span className="font-semibold text-sm text-white">② Local Detection</span>
            <span className="text-[10px] text-amber-400 font-mono">ON-DEVICE · PRIVATE</span>
          </div>
          <div className="p-3 bg-slate-900/50 font-mono text-[10px] leading-relaxed text-slate-300 space-y-1 min-h-[300px]">
            <div className="bg-blue-900/30 p-2 rounded mb-2 text-center text-slate-400 text-[9px]">[ AirVoyage Demo Page ]</div>
            {[
              { label: '🔍 FACE (97%)',  text: 'Kshitiz Jain', color: 'border-amber-400 bg-amber-400/10' },
              { label: '🔍 EMAIL (99%)', text: 'kshitiz.jain@gmail.com', color: 'border-amber-400 bg-amber-400/10' },
              { label: '🔍 PHONE (92%)', text: '+91 98765 43210', color: 'border-amber-400 bg-amber-400/10' },
              { label: '🔍 AADHAAR (88%)', text: '2345 6789 0123', color: 'border-red-400 bg-red-400/10' },
              { label: '🔍 PAN (97%)',   text: 'ABCDE1234F', color: 'border-amber-400 bg-amber-400/10' },
              { label: '🔍 CARD (98%)', text: '4111 1111 1111 4321', color: 'border-red-400 bg-red-400/10' },
              { label: '🔍 PWD (100%)', text: '••••••••••', color: 'border-red-400 bg-red-400/10' },
            ].map((item, i) => (
              <div key={i} className={`border rounded px-1.5 py-0.5 ${item.color}`}>
                <div className="text-[8px] font-bold text-amber-400">{item.label}</div>
                <div className="text-[10px]">{item.text}</div>
              </div>
            ))}
            <div className="border-t border-slate-700/50 pt-1 text-slate-400">
              <div>From: Delhi (DEL) ✓ safe</div>
              <div className="mt-1 bg-orange-500 text-white text-center rounded py-1">[ SEARCH ] ✓ safe</div>
            </div>
          </div>
        </div>

        {/* Panel 3: Sanitized */}
        <div className="card overflow-hidden">
          <div className="card-header bg-emerald-500/5 border-emerald-500/20">
            <span className="font-semibold text-sm text-white">③ Server Receives</span>
            <span className="text-[10px] text-emerald-400 font-mono">SANITIZED · SAFE</span>
          </div>
          <div className="p-3 bg-slate-900/50 font-mono text-[10px] leading-relaxed text-slate-300 space-y-1 min-h-[300px]">
            <div className="bg-blue-900/30 p-2 rounded mb-2 text-center text-slate-400 text-[9px]">[ pageType: travel_booking ]</div>
            <div><span className="text-slate-500">Name:</span> <span className="text-cyan-300">[PERSON]</span></div>
            <div><span className="text-slate-500">Email:</span> <span className="text-cyan-300">[EMAIL REDACTED]</span></div>
            <div><span className="text-slate-500">Phone:</span> <span className="text-cyan-300">[PHONE REDACTED]</span></div>
            <div><span className="text-slate-500">DOB:</span> <span className="text-cyan-300">[DOB REDACTED]</span></div>
            <div><span className="text-slate-500">Aadhaar:</span> <span className="text-cyan-300">[GOVT-ID REDACTED]</span></div>
            <div><span className="text-slate-500">PAN:</span> <span className="text-cyan-300">[GOVT-ID REDACTED]</span></div>
            <div className="border-t border-slate-700/50 pt-1 mt-1">
              <div><span className="text-slate-500">Card:</span> <span className="text-cyan-300">[CARD REDACTED]</span></div>
              <div><span className="text-slate-500">CVV:</span> <span className="text-cyan-300">[CVV REDACTED]</span></div>
              <div><span className="text-slate-500">UPI:</span> <span className="text-cyan-300">[PAYMENT-ID REDACTED]</span></div>
            </div>
            <div className="border-t border-slate-700/50 pt-1 mt-1">
              <div><span className="text-slate-500">Password:</span> <span className="text-cyan-300">[PASSWORD REMOVED]</span></div>
            </div>
            <div className="border-t border-slate-700/50 pt-1 mt-1 text-slate-400">
              <div>From: Delhi (DEL)</div>
              <div>To: [INPUT FIELD]</div>
              <div>Date: [DATE PICKER]</div>
              <div className="mt-1 bg-orange-500/60 text-white text-center rounded py-1">[ SEARCH BUTTON ]</div>
            </div>
          </div>
        </div>
      </div>

      {/* Detection Summary */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Layer 1: DOM',    detected: 7, method: 'input types, autocomplete, data attrs', color: 'text-cyan-400' },
          { label: 'Layer 2: Regex',  detected: 4, method: 'Aadhaar, PAN, email, phone patterns', color: 'text-amber-400' },
          { label: 'Layer 3: Vision', detected: 1, method: 'Face heuristic (profile photo element)', color: 'text-purple-400' },
          { label: 'Total Redacted',  detected: 11, method: '0 raw PII bytes to server', color: 'text-emerald-400' },
        ].map(item => (
          <div key={item.label} className="card p-4">
            <div className={`text-2xl font-bold font-mono ${item.color}`}>{item.detected}</div>
            <div className="text-xs font-semibold text-slate-300 mt-1">{item.label}</div>
            <div className="text-[10px] text-slate-500 mt-1 leading-tight">{item.method}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
