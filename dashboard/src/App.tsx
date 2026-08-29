import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Shield, Activity, Eye, BarChart2, ScrollText, Settings, Layout, Zap } from 'lucide-react'
import Overview from './pages/Overview'
import PrivacyMonitor from './pages/PrivacyMonitor'
import LiveSession from './pages/LiveSession'
import Metrics from './pages/Metrics'
import AuditLog from './pages/AuditLog'
import SettingsPage from './pages/SettingsPage'
import VisualPerception from './pages/VisualPerception'

const navItems = [
  { path: '/',           label: 'Overview',      icon: Layout },
  { path: '/session',    label: 'Live Session',   icon: Zap },
  { path: '/privacy',    label: 'Privacy Monitor',icon: Shield },
  { path: '/perception', label: 'Visual Perception', icon: Eye },
  { path: '/metrics',    label: 'Metrics',        icon: BarChart2 },
  { path: '/audit',      label: 'Audit Log',      icon: ScrollText },
  { path: '/settings',   label: 'Settings',       icon: Settings },
]

function StatusBar() {
  const [serverOk, setServerOk] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('http://localhost:8000/api/health')
      .then(r => r.ok ? setServerOk(true) : setServerOk(false))
      .catch(() => setServerOk(false))
  }, [])

  return (
    <div className="flex items-center gap-4 text-xs text-slate-500">
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${serverOk === true ? 'bg-emerald-400 animate-pulse' : serverOk === false ? 'bg-red-400' : 'bg-slate-500'}`} />
        <span>Server {serverOk === true ? 'Online' : serverOk === false ? 'Offline' : 'Connecting...'}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
        <span>Privacy Layer Active</span>
      </div>
    </div>
  )
}

function Sidebar() {
  return (
    <aside className="w-56 min-h-screen bg-navy-800 border-r border-slate-700/50 flex flex-col">
      {/* Logo */}
      <div className="p-5 border-b border-slate-700/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-bold text-sm text-white leading-none">PrivacyAgent</div>
            <div className="text-[10px] text-slate-500 mt-0.5">On-Device Perception</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 flex flex-col gap-1">
        {navItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* ISRO Badge */}
      <div className="p-4 border-t border-slate-700/50">
        <div className="text-[10px] text-slate-500 text-center leading-relaxed">
          Built for<br />
          <span className="text-cyan-400 font-semibold">ISRO Hackathon 2026</span>
        </div>
      </div>
    </aside>
  )
}

function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-navy-900">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          {/* Top bar */}
          <header className="h-12 border-b border-slate-700/50 bg-navy-800/50 flex items-center justify-between px-6">
            <h1 className="text-sm font-semibold text-slate-300">
              Privacy-Preserving On-Device Visual Perception
            </h1>
            <StatusBar />
          </header>
          {/* Page content */}
          <main className="flex-1 overflow-auto p-6">
            <Routes>
              <Route path="/"           element={<Overview />} />
              <Route path="/session"    element={<LiveSession />} />
              <Route path="/privacy"    element={<PrivacyMonitor />} />
              <Route path="/perception" element={<VisualPerception />} />
              <Route path="/metrics"    element={<Metrics />} />
              <Route path="/audit"      element={<AuditLog />} />
              <Route path="/settings"   element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}

export default App
