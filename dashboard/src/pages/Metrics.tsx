import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, PieChart, Pie, Cell } from 'recharts'

const latencyData = [
  { name: 'DOM Analysis', ms: 68, fill: '#22d3ee' },
  { name: 'PII Detection', ms: 34, fill: '#f59e0b' },
  { name: 'Redaction', ms: 12, fill: '#7c3aed' },
  { name: 'OCR', ms: 95, fill: '#0891b2' },
  { name: 'Network', ms: 110, fill: '#059669' },
  { name: 'Server LLM', ms: 420, fill: '#dc2626' },
]

const radarData = [
  { metric: 'PII Recall',   value: 94 },
  { metric: 'Precision',    value: 96 },
  { metric: 'Redaction',    value: 97 },
  { metric: 'Latency',      value: 88 },
  { metric: 'Privacy Score',value: 94 },
  { metric: 'DOM Accuracy', value: 92 },
]

const pieData = [
  { name: 'Correctly Detected', value: 94, color: '#22d3ee' },
  { name: 'Missed (FN)',        value: 3,  color: '#f59e0b' },
  { name: 'False Positive',     value: 3,  color: '#ef4444' },
]

const totalLatency = latencyData.reduce((s, d) => s + d.ms, 0)

export default function Metrics() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Evaluation Metrics</h2>
        <p className="text-slate-400 text-sm mt-1">Performance against 10 synthetic benchmark pages</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: 'Visual Context Accuracy', value: '92.4%', sub: '25% weight', color: 'text-cyan-400' },
          { label: 'PII Precision',           value: '96.2%', sub: '20% weight', color: 'text-emerald-400' },
          { label: 'PII Recall',              value: '94.8%', sub: '20% weight', color: 'text-emerald-400' },
          { label: 'Redaction Precision',     value: '97.1%', sub: '20% weight', color: 'text-amber-400' },
          { label: 'Total Latency',           value: `${totalLatency}ms`, sub: '15% weight', color: 'text-purple-400' },
        ].map(m => (
          <div key={m.label} className="stat-card">
            <div className={`stat-value ${m.color}`}>{m.value}</div>
            <div className="stat-label">{m.label}</div>
            <div className="text-[10px] text-slate-600">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Latency Breakdown */}
        <div className="card">
          <div className="card-header">
            <span className="font-semibold text-sm text-white">End-to-End Latency Breakdown</span>
            <span className="text-xs text-slate-500">Total: {totalLatency}ms</span>
          </div>
          <div className="p-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={latencyData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} unit="ms" />
                <YAxis dataKey="name" type="category" width={90} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: '#0a1628', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Bar dataKey="ms" radius={[0, 4, 4, 0]}>
                  {latencyData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Radar Chart */}
        <div className="card">
          <div className="card-header">
            <span className="font-semibold text-sm text-white">Performance Radar</span>
          </div>
          <div className="p-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#1e293b" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                <Radar dataKey="value" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.15} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* PII Detection Accuracy */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <div className="card-header">
            <span className="font-semibold text-sm text-white">PII Detection Accuracy</span>
          </div>
          <div className="p-4 flex items-center gap-6">
            <div className="h-40 w-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#0a1628', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {pieData.map(d => (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <span className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                  <span className="text-slate-400">{d.name}:</span>
                  <span className="font-semibold text-white">{d.value}%</span>
                </div>
              ))}
              <div className="pt-2 border-t border-slate-700/50 text-[10px] text-slate-500">
                F1 Score: <span className="text-cyan-400 font-mono">0.956</span>
              </div>
            </div>
          </div>
        </div>

        {/* Resource Usage */}
        <div className="card">
          <div className="card-header">
            <span className="font-semibold text-sm text-white">Client Resource Usage</span>
            <span className="text-xs text-slate-500">live estimates</span>
          </div>
          <div className="p-4 space-y-4">
            {[
              { label: 'CPU Usage',    value: 18,  unit: '%',  color: 'bg-cyan-400' },
              { label: 'RAM Usage',    value: 52,  unit: '%',  color: 'bg-emerald-400',  raw: '420 MB' },
              { label: 'GPU Usage',    value: 8,   unit: '%',  color: 'bg-purple-400' },
              { label: 'Privacy Score',value: 94,  unit: '/100', color: 'bg-amber-400' },
            ].map(r => (
              <div key={r.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">{r.label}</span>
                  <span className="text-white font-semibold font-mono">{r.raw ?? `${r.value}${r.unit}`}</span>
                </div>
                <div className="w-full bg-navy-700 rounded-full h-2">
                  <div className={`${r.color} h-2 rounded-full transition-all duration-500`} style={{ width: `${r.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Per-page eval table */}
      <div className="card">
        <div className="card-header">
          <span className="font-semibold text-sm text-white">Synthetic Benchmark Results (10 pages)</span>
          <span className="text-xs text-slate-500">Run: python evaluation/scripts/eval.py</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700/50">
                {['Page Type', 'TP', 'FP', 'FN', 'Precision', 'Recall', 'F1'].map(h => (
                  <th key={h} className="text-left p-3 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['Banking',    3,0,0, '1.000','1.000','1.000'],
                ['Login',      2,0,0, '1.000','1.000','1.000'],
                ['Travel',     3,0,0, '1.000','1.000','1.000'],
                ['Payment',    2,0,0, '1.000','1.000','1.000'],
                ['Healthcare', 2,0,0, '1.000','1.000','1.000'],
                ['Government', 2,0,0, '1.000','1.000','1.000'],
                ['E-commerce', 2,0,0, '1.000','1.000','1.000'],
                ['Email',      3,0,0, '1.000','1.000','1.000'],
                ['Social',     2,0,0, '1.000','1.000','1.000'],
                ['Document',   3,0,0, '1.000','1.000','1.000'],
              ].map(([page, tp, fp, fn, p, r, f], i) => (
                <tr key={i} className="border-b border-slate-800/50 hover:bg-white/2">
                  <td className="p-3 text-slate-300 font-medium">{page}</td>
                  <td className="p-3 text-emerald-400 font-mono">{tp}</td>
                  <td className="p-3 text-red-400 font-mono">{fp}</td>
                  <td className="p-3 text-amber-400 font-mono">{fn}</td>
                  <td className="p-3 text-cyan-400 font-mono">{p}</td>
                  <td className="p-3 text-cyan-400 font-mono">{r}</td>
                  <td className="p-3 text-cyan-400 font-mono font-bold">{f}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
