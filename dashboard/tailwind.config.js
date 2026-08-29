/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy:    { 900: '#020817', 800: '#0a1628', 700: '#0f1e3a', 600: '#162447' },
        cyan:    { 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2' },
        amber:   { 400: '#fbbf24', 500: '#f59e0b' },
        emerald: { 400: '#34d399', 500: '#10b981' },
        crimson: { 400: '#f87171', 500: '#ef4444' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], mono: ['JetBrains Mono', 'monospace'] },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'scan': 'scan 2s linear infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        scan: { '0%': { transform: 'translateY(-100%)' }, '100%': { transform: 'translateY(100vh)' } },
        glow: { from: { boxShadow: '0 0 5px #22d3ee' }, to: { boxShadow: '0 0 20px #22d3ee, 0 0 40px #22d3ee33' } },
      },
    },
  },
  plugins: [],
}
