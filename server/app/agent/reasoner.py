"""
Agent Reasoner — LangChain-based LLM integration.

Uses LangChain's provider-agnostic interface so switching from Gemini
to OpenAI/Anthropic requires changing only the model instantiation.
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
    """Return the configured LLM. Swap provider by changing LLM_PROVIDER env var."""
    provider = os.getenv("LLM_PROVIDER", "gemini").lower()

    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=os.getenv("GEMINI_MODEL", "gemini-2.0-flash"),
            google_api_key=os.getenv("GOOGLE_API_KEY"),
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

    elif provider == "mock":
        return MockLLM()

    else:
        raise ValueError(f"Unknown LLM_PROVIDER: {provider}")


# ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a browser automation agent. You receive a sanitized, privacy-preserving description of a web page and must determine the next best action to complete the user's task.

IMPORTANT RULES:
1. You ONLY return a single JSON action object — no prose, no markdown, no explanation outside the JSON.
2. You ONLY use these action types: click, fill, scroll, select, focus, navigate, wait, done
3. You NEVER request sensitive information. The user's privacy is already protected locally.
4. When the task is complete, return action: "done".
5. Be precise about targets — prefer element-id or selector over text.

Return EXACTLY this JSON structure (no markdown fences):
{
  "action": "<action_type>",
  "target": {
    "type": "selector|element-id|role|text",
    "value": "<selector or id or role or text>"
  },
  "value": "<value if fill/select>",
  "direction": "<up|down|left|right if scroll>",
  "amount": <pixels if scroll>,
  "url": "<url if navigate>",
  "reason": "<one sentence explaining why>",
  "confidence": 0.95
}
"""

# ── CONTEXT FORMATTER ─────────────────────────────────────────────────────────

def format_context_for_llm(task: str, context: SanitizedContext, step: int) -> str:
    """Convert sanitized context to an LLM-readable prompt."""

    # Summarize interactable elements
    interactable = [e for e in context.elements if e.interactable and e.visible]
    elem_descriptions = []
    for el in interactable[:30]:  # Limit to 30 elements
        parts = [f"[{el.type}]"]
        if el.id and el.id != f"el-{interactable.index(el)}":
            parts.append(f'id="{el.id}"')
        if el.domSelector:
            parts.append(f'selector="{el.domSelector}"')
        if el.role:
            parts.append(f'role="{el.role}"')
        if el.label:
            parts.append(f'label="{el.label}"')
        if el.placeholder:
            parts.append(f'placeholder="{el.placeholder}"')
        if el.value and not el.sensitive:
            parts.append(f'value="{el.value}"')
        if el.sensitive:
            parts.append(f'[REDACTED:{el.sensitivityType or "pii"}]')
        elem_descriptions.append(" ".join(parts))

    elements_text = "\n".join(f"  {i+1}. {d}" for i, d in enumerate(elem_descriptions))

    pii = context.piiSummary
    prompt = f"""
TASK: {task}
STEP: {step}
PAGE TYPE: {context.pageType}
PAGE TITLE: {context.pageTitle}
URL: {context.pageUrl}

PRIVACY NOTE: {pii.totalDetected} PII items detected and redacted locally. 
Raw data transmitted to server: 0 bytes. The following context is sanitized.

PII SUMMARY (for context only — not raw data):
{json.dumps(pii.byType, indent=2)}

INTERACTABLE PAGE ELEMENTS ({len(interactable)} total):
{elements_text}

SANITIZED PAGE TEXT (truncated):
{context.sanitizedText[:1500]}

Based on this sanitized context, what is the SINGLE best next action to complete the task?
Return only JSON.
""".strip()

    return prompt


# ── RESPONSE PARSER ───────────────────────────────────────────────────────────

def parse_action_response(text: str) -> BrowserAction:
    """Parse LLM text output into a BrowserAction. Strict validation."""
    # Strip markdown fences if present
    text = text.strip()
    text = re.sub(r'^```(?:json)?\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'\s*```$', '', text, flags=re.MULTILINE)

    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        # Attempt to extract JSON from mixed text
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            data = json.loads(match.group())
        else:
            raise ValueError(f"Could not parse LLM response as JSON: {e}\nRaw: {text[:200]}")

    # Validate action type
    valid_actions = {"click", "fill", "scroll", "select", "focus", "navigate", "wait", "done"}
    action_type = data.get("action", "").lower()
    if action_type not in valid_actions:
        raise ValueError(f"Invalid action type: {action_type}")

    # Build target if present
    target = None
    if "target" in data and data["target"]:
        target = ActionTarget(
            type=data["target"].get("type", "selector"),
            value=str(data["target"].get("value", "")),
        )

    return BrowserAction(
        action=action_type,
        target=target,
        value=data.get("value"),
        direction=data.get("direction"),
        amount=data.get("amount"),
        url=data.get("url"),
        reason=data.get("reason", "LLM decision"),
        confidence=float(data.get("confidence", 0.8)),
        requiresApproval=data.get("requiresApproval", False),
    )


# ── MAIN REASONER ─────────────────────────────────────────────────────────────

_llm: Optional[BaseChatModel] = None

def get_cached_llm() -> BaseChatModel:
    global _llm
    if _llm is None:
        _llm = get_llm()
    return _llm


async def reason(task: str, context: SanitizedContext, step: int) -> tuple[BrowserAction, int, str]:
    """
    Main reasoning function. Returns (action, latency_ms, model_name).

    The LLM receives ONLY sanitized context — no raw PII ever reaches here.
    """
    llm = get_cached_llm()
    prompt = format_context_for_llm(task, context, step)

    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=prompt),
    ]

    t0 = time.time()
    response = await llm.ainvoke(messages)
    latency_ms = int((time.time() - t0) * 1000)

    action = parse_action_response(response.content)
    model_name = os.getenv("GEMINI_MODEL", os.getenv("OPENAI_MODEL", "unknown"))

    return action, latency_ms, model_name


# ── MOCK LLM (for testing without API key) ────────────────────────────────────

class MockLLM:
    """Mock LLM that returns canned travel search actions for demo."""

    _step = 0
    _mock_actions = [
        '{"action":"fill","target":{"type":"element-id","value":"destination"},"value":"Mumbai","reason":"Fill destination field with Mumbai as per the task","confidence":0.97}',
        '{"action":"fill","target":{"type":"element-id","value":"travel-date"},"value":"2026-08-30","reason":"Set travel date to tomorrow","confidence":0.95}',
        '{"action":"click","target":{"type":"element-id","value":"search-btn"},"reason":"Click the Search button to find flights","confidence":0.98}',
        '{"action":"done","reason":"Flight search completed. Cheapest option is SpiceJet SG-101 at ₹3599. Task complete.","confidence":0.96}',
    ]

    async def ainvoke(self, messages):
        class MockResponse:
            def __init__(self, content): self.content = content
        action = self._mock_actions[min(MockLLM._step, len(self._mock_actions) - 1)]
        MockLLM._step += 1
        return MockResponse(action)
