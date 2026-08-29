# Setup Guide — Privacy-Preserving Browser Agent

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+
- **Google Chrome** (for loading the extension)
- A **Gemini API key** (free at https://aistudio.google.com/app/apikey)

---

## 1. Server Setup

```bash
cd server

# Create virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
copy .env.example .env
# Edit .env and add your GOOGLE_API_KEY

# Start the server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Server will be live at: http://localhost:8000  
Interactive API docs: http://localhost:8000/docs

---

## 2. Dashboard Setup

```bash
cd dashboard
npm install
npm run dev
```

Dashboard will be live at: http://localhost:5173

---

## 3. Browser Extension Setup

```bash
cd extension
npm install
npm run build      # Production build
# OR
npm run dev        # Watch mode for development
```

### Load in Chrome:
1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/dist/` folder
5. The PrivacyAgent icon should appear in your toolbar

---

## 4. Demo Site

Open the demo site in Chrome (no server needed):
```
file:///d:/browseragent/demo-site/index.html
```

Or serve it locally:
```bash
cd demo-site
npx serve .
```

---

## 5. Run Evaluation

```bash
cd evaluation
python scripts/eval.py
```

This will auto-generate 10 synthetic benchmark pages and compute precision/recall/F1.

---

## 6. End-to-End Demo Flow

1. Start the server (`uvicorn main:app --reload`)
2. Start the dashboard (`npm run dev` in `dashboard/`)
3. Load the extension in Chrome
4. Open `demo-site/index.html` in Chrome
5. Click the PrivacyAgent extension icon
6. Type: `Find the cheapest flight from Delhi to Mumbai tomorrow`
7. Click **Run Task**
8. Watch the privacy monitor — 0 raw PII bytes sent to server
9. View the dashboard at http://localhost:5173

---

## 7. Provider Switching

To use OpenAI instead of Gemini, edit `server/.env`:
```env
LLM_PROVIDER=openai
OPENAI_API_KEY=your_key_here
```

To use mock mode (no API key needed):
```env
LLM_PROVIDER=mock
```

No code changes required — LangChain handles provider switching.

---

## Architecture Quick Reference

```
Browser (TRUSTED)
  Content Script     — DOM analysis, PII detection, action execution
  Privacy Engine     — Regex + DOM + Vision PII detection
  Redaction Engine   — Mask / Blur / Replace / Remove
  Background SW      — Task loop orchestration
  ↓ Sanitized JSON only (0 raw PII bytes)
Trust Boundary
  ↓
Server (UNTRUSTED from privacy perspective)
  FastAPI + LangChain — Receives sanitized context, reasons via LLM
  Returns structured action JSON
  ↓
Browser validates + executes action locally
```
