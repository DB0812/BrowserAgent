"""
Agent Reasoner — LangChain-based LLM integration.

Primary: Google Gemini 3.6 Flash (or other providers).
Fallback: Smart DynamicDOMSolver only when NO api key is configured.
"""
from __future__ import annotations
import os
import time
import json
import re
from typing import Optional

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.language_models import BaseChatModel

from app.schemas.action import SanitizedContext, BrowserAction, ActionTarget

# ── MODEL FACTORY ─────────────────────────────────────────────────────────────

def get_llm() -> BaseChatModel:
    """Return the configured LLM. Change LLM_PROVIDER env var to switch."""
    provider = os.getenv("LLM_PROVIDER", "gemini").lower()
    api_key = os.getenv("GOOGLE_API_KEY", "").strip()

    if provider == "gemini":
        if not api_key or api_key in ("your_gemini_api_key_here", ""):
            print("[Reasoner] No GOOGLE_API_KEY. Using DynamicDOMSolver fallback.")
            return DynamicDOMSolverLLM()
        model_name = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
        from langchain_google_genai import ChatGoogleGenerativeAI
        print(f"[Reasoner] Using Gemini model: {model_name}")
        return ChatGoogleGenerativeAI(
            model=model_name,
            google_api_key=api_key,
            temperature=0.1,
        )

    elif provider == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            api_key=os.getenv("OPENAI_API_KEY"),
            temperature=0.1,
        )

    elif provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=os.getenv("ANTHROPIC_MODEL", "claude-haiku-20240307"),
            api_key=os.getenv("ANTHROPIC_API_KEY"),
            temperature=0.1,
        )

    print(f"[Reasoner] Unknown provider '{provider}'. Using DynamicDOMSolver.")
    return DynamicDOMSolverLLM()


# ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a browser automation agent. You receive a sanitized web page description and must determine the SINGLE next best action to complete the user's task.

RULES:
1. Return ONLY valid JSON — no prose, no markdown fences.
2. Allowed action types: click, fill, scroll, select, navigate, wait, done
3. For "fill": use the exact domSelector from the element list.
4. For "select": use the exact option value (e.g. "2" not "2 Adults").
5. Do ONE thing per step — don't repeat actions already in history.
6. After clicking a search/submit button, return action "done" immediately on the next step.
7. If you see a "click #search-btn" or similar in the ACTIONS ALREADY EXECUTED list, return "done".
8. Extract only the relevant value from the user's task (e.g. if task says "2 Adults", select value "2").

JSON FORMAT (return exactly this, no extras):
{
  "action": "fill|click|select|scroll|navigate|wait|done",
  "target": {"type": "selector", "value": "<exact CSS selector from element list>"},
  "value": "<string value for fill/select, omit otherwise>",
  "reason": "<one sentence>",
  "confidence": 0.95
}
"""

# ── CONTEXT FORMATTER ─────────────────────────────────────────────────────────

def format_context_for_llm(task: str, context: SanitizedContext, step: int, previous_actions: list[dict] | None = None) -> str:
    interactable = [e for e in context.elements if e.interactable and e.visible]
    elem_lines = []
    for el in interactable[:40]:
        parts = [f"[{el.tagName or el.type}]"]
        parts.append(f'selector="{el.domSelector}"')
        if el.id:
            parts.append(f'id="{el.id}"')
        if el.label:
            parts.append(f'label="{el.label}"')
        if el.placeholder:
            parts.append(f'placeholder="{el.placeholder}"')
        if el.role:
            parts.append(f'role="{el.role}"')
        if el.value and not el.sensitive:
            parts.append(f'value="{el.value}"')
        if el.sensitive:
            parts.append(f'[REDACTED:{el.sensitivityType or "pii"}]')
        elem_lines.append("  - " + " ".join(parts))

    elements_block = "\n".join(elem_lines)
    pii = context.piiSummary

    # Build action history block
    history_block = ""
    if previous_actions:
        lines = []
        for a in previous_actions:
            act = a.get('action', '?')
            tgt = a.get('target', {}).get('value', '') if a.get('target') else ''
            val = a.get('value', '')
            reason = a.get('reason', '')
            lines.append(f"  - Step {a.get('step','?')}: {act} {tgt} {'= ' + val if val else ''} → {reason}")
        history_block = "\nACTIONS ALREADY EXECUTED (DO NOT REPEAT THESE):\n" + "\n".join(lines) + "\n"

    return f"""TASK: {task}
STEP: {step}
PAGE URL: {context.pageUrl}
PAGE TITLE: {context.pageTitle}
{history_block}
PRIVACY: {pii.totalDetected} PII items redacted locally. Raw PII = 0 bytes.

CURRENT PAGE ELEMENTS ({len(interactable)} interactable — showing live DOM values):
{elements_block}

PAGE TEXT:
{context.sanitizedText[:800]}

Look at ACTIONS ALREADY EXECUTED. Do NOT repeat any action already done unless the DOM shows it failed.
Determine the SINGLE best NEXT action. Return JSON only."""


# ── RESPONSE PARSER ───────────────────────────────────────────────────────────

def parse_action_response(text) -> BrowserAction:
    """Parse LLM response — handles both string and list content from Gemini."""
    # Handle Gemini list-of-dicts content format
    if isinstance(text, list):
        parts = []
        for item in text:
            if isinstance(item, dict):
                parts.append(item.get('text', '') or item.get('content', '') or '')
            elif isinstance(item, str):
                parts.append(item)
        text = '\n'.join(parts)

    if not isinstance(text, str):
        text = str(text)

    text = text.strip()
    text = re.sub(r'^```(?:json)?\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'\s*```$', '', text, flags=re.MULTILINE)

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r'\{.*\}', text, re.DOTALL)
        if m:
            data = json.loads(m.group())
        else:
            raise ValueError(f"Cannot parse LLM response: {text[:150]}")

    valid = {"click", "fill", "scroll", "select", "navigate", "wait", "done"}
    action_type = data.get("action", "wait").lower()
    if action_type not in valid:
        action_type = "wait"

    target = None
    if "target" in data and data["target"]:
        t_val = str(data["target"].get("value", ""))
        t_type = str(data["target"].get("type", "selector"))
        if t_val:
            target = ActionTarget(type=t_type, value=t_val)

    return BrowserAction(
        action=action_type,
        target=target,
        value=data.get("value"),
        direction=data.get("direction"),
        amount=data.get("amount"),
        url=data.get("url"),
        reason=data.get("reason", "LLM decision"),
        confidence=float(data.get("confidence", 0.9)),
        requiresApproval=False,
    )


# ── DYNAMIC DOM SOLVER (fallback only, when no API key) ───────────────────────

class DynamicDOMSolverLLM:
    """
    Rule-based fallback. Only used when no LLM API key is configured.
    Parses task text and element list to generate actions.
    """

    async def ainvoke(self, messages):
        prompt = messages[-1].content if messages else ""

        # Extract TASK line
        task_m = re.search(r'^TASK: (.+)$', prompt, re.MULTILINE)
        task = task_m.group(1).strip() if task_m else ""

        # Extract STEP
        step_m = re.search(r'^STEP: (\d+)', prompt, re.MULTILINE)
        step = int(step_m.group(1)) if step_m else 1

        # Extract history
        history = []
        hist_block = re.search(r'ACTIONS ALREADY EXECUTED \(DO NOT REPEAT THESE\):\n(.*?)(?:\n\n|\nPRIVACY:)', prompt, re.DOTALL)
        if hist_block:
            for line in hist_block.group(1).splitlines():
                # Extract simple actions from history text
                m = re.search(r'Step \d+: (\w+) (.*?) (?:→|$)', line)
                if m:
                    history.append({"action": m.group(1), "target": {"value": m.group(2).split(" = ")[0].strip()}})

        # Parse element lines
        elements = []
        for line in prompt.splitlines():
            if line.strip().startswith("- ["):
                elements.append(line.strip())

        result = self._solve(task, step, elements, history)

        class R:
            def __init__(self, c): self.content = c
        return R(result)

    def _solve(self, task: str, step: int, elem_lines: list[str], history: list[dict] | None = None) -> str:
        # ── Parse elements ──
        parsed = []
        for line in elem_lines:
            sel_m = re.search(r'selector="([^"]+)"', line)
            lbl_m = re.search(r'label="([^"]+)"', line)
            ph_m  = re.search(r'placeholder="([^"]+)"', line)
            val_m = re.search(r'value="([^"]+)"', line)
            id_m  = re.search(r'id="([^"]+)"', line)
            is_btn  = "[button]" in line.lower()
            is_sel  = "[select]" in line.lower()
            is_inp  = ("[input]" in line.lower() or "[text]" in line.lower()) and not is_btn and not is_sel
            parsed.append({
                "selector": sel_m.group(1) if sel_m else "",
                "label": (lbl_m.group(1) if lbl_m else "").lower(),
                "placeholder": (ph_m.group(1) if ph_m else "").lower(),
                "value": val_m.group(1) if val_m else "",
                "id": id_m.group(1) if id_m else "",
                "is_button": is_btn,
                "is_select": is_sel,
                "is_input": is_inp,
            })

        # ── What was already done? ──
        done_actions = set()  # (action_type, selector) already executed
        if history:
            for h in history:
                t = (h.get('target') or {}).get('value', '')
                done_actions.add((h.get('action',''), t))

        task_lower = task.lower()

        # ── Extract task entities ──

        # Destination city — only the city name (stop at prepositions/numbers)
        dest = ""
        dest_m = re.search(r'\bto\s+([A-Za-z]+)', task, re.I)
        if dest_m:
            dest = dest_m.group(1).strip()

        # Origin city
        origin = ""
        origin_m = re.search(r'\bfrom\s+([A-Za-z]+)', task, re.I)
        if origin_m:
            origin = origin_m.group(1).strip()

        # Passenger count
        passengers = ""
        pax_m = re.search(r'(\d+)\s+adult', task, re.I)
        if pax_m:
            passengers = pax_m.group(1)

        # Date
        import datetime
        tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
        date_val = tomorrow if "tomorrow" in task_lower else ""
        date_m = re.search(r'(\d{4}-\d{2}-\d{2})', task)
        if date_m:
            date_val = date_m.group(1)

        # ── Step 1: Fill unfilled text inputs (skip if already done) ──
        for el in parsed:
            if not el["is_input"]:
                continue
            sel = el["selector"]
            if ('fill', sel) in done_actions:
                continue  # already filled
            if el["value"]:
                continue  # DOM already has a value
            hint = (el["label"] + " " + el["placeholder"] + " " + el["id"] + " " + sel).lower()

            if any(w in hint for w in ["from", "origin", "depart", "source"]) and origin:
                return json.dumps({"action": "fill", "target": {"type": "selector", "value": sel}, "value": origin, "reason": f"Fill origin with '{origin}'", "confidence": 0.97})
            if any(w in hint for w in ["to", "dest", "arrival", "destination", "where"]) and dest:
                return json.dumps({"action": "fill", "target": {"type": "selector", "value": sel}, "value": dest, "reason": f"Fill destination with '{dest}'", "confidence": 0.97})
            if any(w in hint for w in ["date", "depart", "when", "travel"]) and date_val:
                return json.dumps({"action": "fill", "target": {"type": "selector", "value": sel}, "value": date_val, "reason": f"Fill travel date", "confidence": 0.95})

        # ── Step 2: Set select/dropdown (skip if already done) ──
        for el in parsed:
            if not el["is_select"]:
                continue
            sel = el["selector"]
            if ('select', sel) in done_actions:
                continue  # already selected
            hint = (el["label"] + " " + el["id"] + " " + sel).lower()
            if any(w in hint for w in ["passenger", "adult", "pax", "person", "traveller"]) and passengers:
                return json.dumps({"action": "select", "target": {"type": "selector", "value": sel}, "value": passengers, "reason": f"Select {passengers} passengers", "confidence": 0.96})

        # ── Step 3: Click search button (skip if already done) ──
        for el in parsed:
            if not el["is_button"]:
                continue
            sel = el["selector"]
            if ('click', sel) in done_actions:
                continue  # already clicked
            hint = (el["label"] + " " + el["id"] + " " + sel).lower()
            if any(w in hint for w in ["search", "find", "submit", "book", "go", "flight"]):
                return json.dumps({"action": "click", "target": {"type": "selector", "value": sel}, "reason": "Click Search to submit", "confidence": 0.98})

        # ── Step 4: Done ──
        return json.dumps({"action": "done", "reason": f"Task completed: {task}", "confidence": 0.95})


# ── MAIN REASONER ─────────────────────────────────────────────────────────────

_llm: Optional[BaseChatModel] = None

def get_cached_llm() -> BaseChatModel:
    global _llm
    if _llm is None:
        _llm = get_llm()
    return _llm


async def reason(task: str, context: SanitizedContext, step: int, previous_actions: list[dict] | None = None) -> tuple[BrowserAction, int, str]:
    """
    Main reasoning function. Returns (action, latency_ms, model_name).
    Server receives ONLY sanitized context — no raw PII ever here.
    """
    llm = get_cached_llm()
    prompt = format_context_for_llm(task, context, step, previous_actions)
    messages = [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)]

    t0 = time.time()
    try:
        response = await llm.ainvoke(messages)
        latency_ms = int((time.time() - t0) * 1000)
        action = parse_action_response(response.content)
        model_name = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
        print(f"[Reasoner] Step {step} → {action.action} ({latency_ms}ms) | target={action.target} val={action.value}")
        return action, latency_ms, model_name

    except Exception as err:
        print(f"[Reasoner] LLM error at step {step}: {err}")
        # Reset cached LLM so next call tries fresh
        global _llm
        _llm = None
        # Fall back to rule-based solver
        solver = DynamicDOMSolverLLM()
        r2 = await solver.ainvoke(messages)
        latency_ms = int((time.time() - t0) * 1000)
        action = parse_action_response(r2.content)
        print(f"[Reasoner] Fallback solver step {step} → {action.action}")
        return action, latency_ms, "fallback-solver"
