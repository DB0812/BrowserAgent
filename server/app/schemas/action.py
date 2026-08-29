"""
Pydantic schemas for the Privacy-Preserving Browser Agent server.

These define the ONLY data structures the server is permitted to receive and return.
The server NEVER receives raw PII — only sanitized context.
"""
from __future__ import annotations
from typing import Literal, Optional, Any
from pydantic import BaseModel, Field


# ── INCOMING: Sanitized UI Context ────────────────────────────────────────────

class BoundingBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class UIElement(BaseModel):
    id: str
    type: str
    role: Optional[str] = None
    label: Optional[str] = None
    placeholder: Optional[str] = None
    value: Optional[str] = None       # Only non-sensitive values
    sensitive: bool = False
    sensitivityType: Optional[str] = None
    bbox: Optional[BoundingBox] = None
    domSelector: str
    interactable: bool = True
    visible: bool = True
    tagName: str
    attributes: dict[str, str] = {}


class PIISummary(BaseModel):
    totalDetected: int
    totalRedacted: int
    byType: dict[str, int] = {}


class SanitizedContext(BaseModel):
    """
    The sanitized representation of the current page state.
    INVARIANT: This model MUST NOT contain any raw PII.
    """
    pageUrl: str
    pageTitle: str
    pageType: str
    timestamp: int
    elements: list[UIElement] = []
    sanitizedText: str = ""
    ocrTexts: list[str] = []
    piiSummary: PIISummary
    screenshotIncluded: bool = False
    sanitizedScreenshot: Optional[str] = None   # Base64 only if all PII redacted


class ActionRequest(BaseModel):
    task: str                          # User's natural language instruction
    sessionId: str
    context: SanitizedContext
    stepNumber: int = 1


# ── OUTGOING: Structured Browser Actions ──────────────────────────────────────

ActionType = Literal["click", "fill", "scroll", "select", "focus", "navigate", "wait", "done"]

class ActionTarget(BaseModel):
    type: Literal["selector", "element-id", "role", "text"]
    value: str


class BrowserAction(BaseModel):
    action: ActionType
    target: Optional[ActionTarget] = None
    value: Optional[str] = None
    direction: Optional[Literal["up", "down", "left", "right"]] = None
    amount: Optional[int] = None
    url: Optional[str] = None
    reason: str
    confidence: float = Field(ge=0.0, le=1.0)
    requiresApproval: bool = False


class ActionResponse(BaseModel):
    action: BrowserAction
    sessionId: str
    stepNumber: int
    serverLatencyMs: int
    llmProvider: str
    modelUsed: str


# ── SESSION & METRICS ─────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    sessionId: str
    taskInstruction: str


class MetricsUpdate(BaseModel):
    sessionId: str
    stepNumber: int
    metrics: dict[str, Any]


class PrivacyEvent(BaseModel):
    sessionId: str
    piiType: str
    confidence: float
    source: str
    redactionMethod: str
    timestamp: int
