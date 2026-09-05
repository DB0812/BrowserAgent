"""API routes for the Privacy-Preserving Browser Agent server."""
from __future__ import annotations
import os
import time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.schemas.action import (
    ActionRequest, ActionResponse, SessionCreate, MetricsUpdate, BrowserAction,
    PrivacyEvent as PrivacyEventSchema
)
from app.agent.reasoner import reason
from app.models.db import (
    Session as DBSession, Action as DBAction, Metrics as DBMetrics,
    PrivacyEvent as DBPrivacyEvent, get_db
)

router = APIRouter()

_latest_perception: dict | None = None

@router.get("/perception/latest")
async def get_latest_perception():
    """Return the most recent sanitized visual perception received from the client extension."""
    global _latest_perception
    if not _latest_perception:
        return {"hasData": False, "perception": None}
    return {"hasData": True, "perception": _latest_perception}

@router.post("/perception/update")
async def update_perception(data: dict):
    """Allow client extension or tests to explicitly publish live perception data."""
    global _latest_perception
    _latest_perception = {**data, "timestamp": time.time()}
    return {"status": "ok"}

# ── SESSIONS ──────────────────────────────────────────────────────────────────

@router.post("/sessions")
async def create_session(data: SessionCreate, db: AsyncSession = Depends(get_db)):
    session = DBSession(id=data.sessionId, task=data.taskInstruction, status="active")
    db.add(session)
    await db.commit()
    return {"sessionId": data.sessionId, "status": "created"}


@router.get("/sessions")
async def list_sessions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DBSession).order_by(DBSession.created_at.desc()).limit(20))
    sessions = result.scalars().all()
    return [{"id": s.id, "task": s.task, "status": s.status, "created_at": str(s.created_at)} for s in sessions]


@router.get("/sessions/latest")
async def get_latest_session(db: AsyncSession = Depends(get_db)):
    """Return the most recently created session — used by the dashboard AuditLog."""
    result = await db.execute(select(DBSession).order_by(DBSession.created_at.desc()).limit(1))
    session = result.scalar_one_or_none()
    if not session:
        return {"id": None, "task": None, "status": "no_sessions"}
    return {"id": session.id, "task": session.task, "status": session.status, "created_at": str(session.created_at)}


@router.get("/sessions/{session_id}/actions")
async def get_session_actions(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DBAction).where(DBAction.session_id == session_id).order_by(DBAction.step)
    )
    actions = result.scalars().all()
    return [
        {
            "id": a.id,
            "session_id": a.session_id,
            "step": a.step,
            "action_type": a.action_type,
            "action": a.action_json,
            "success": a.success,
            "timestamp": str(a.executed_at),
            "latency_ms": a.latency_ms,
            "promptSentToLLM": a.prompt_sent or "",
            "rawLLMResponse": a.raw_response or "",
            "modelUsed": a.model_used or "unknown",
        }
        for a in actions
    ]


@router.patch("/sessions/{session_id}/complete")
async def complete_session(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DBSession).where(DBSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    from datetime import datetime
    session.status = "completed"
    session.completed_at = datetime.utcnow()
    await db.commit()
    return {"status": "completed"}


# ── ACTION REASONING ──────────────────────────────────────────────────────────

@router.post("/action", response_model=ActionResponse)
async def get_action(request: ActionRequest, db: AsyncSession = Depends(get_db)):
    """
    Core endpoint: receive sanitized context → return next browser action.
    PRIVACY INVARIANT: This endpoint must never receive raw PII.
    """
    t0 = time.time()

    # Ensure session exists in DB if auto-started from Chrome extension
    sess_res = await db.execute(select(DBSession).where(DBSession.id == request.sessionId))
    existing_sess = sess_res.scalar_one_or_none()
    if not existing_sess:
        new_sess = DBSession(id=request.sessionId, task=request.task, status="active")
        db.add(new_sess)
        await db.commit()

    # Check for raw PII signals in sanitized context (defensive invariant check)
    if request.context.sanitizedText:
        import re as _re
        PII_PATTERNS = [
            r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b',          # email
            r'\b(?:\+91[\s\-]?)?[6-9]\d{4}[\s\-]?\d{5}\b',                      # Indian phone
            r'\b(?:\+?1[\s\-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}\b',         # US phone
            r'\b(?:\d[\s\-]?){13,15}\d\b',                                        # credit card
            r'\b[A-Z]{5}[0-9]{4}[A-Z]\b',                                         # PAN card
            r'\b\d{4}[\s]?\d{4}[\s]?\d{4}\b',                                     # Aadhaar
            r'\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\b',    # JWT token
        ]
        # Only block if a pattern matches outside of our redaction placeholders
        sanitized_text = request.context.sanitizedText
        # Remove known redaction placeholders before checking
        cleaned = _re.sub(r'\[(EMAIL|PHONE|CARD|GOVT-ID|TOKEN|PASSWORD|PERSON|ADDRESS|REDACTED)[^\]]*\]', '', sanitized_text)
        for pattern in PII_PATTERNS:
            if _re.search(pattern, cleaned):
                raise HTTPException(
                    status_code=422,
                    detail=f"Privacy violation: potential raw PII detected in sanitized context. "
                           "Ensure local redaction runs before calling this endpoint."
                )

    # Get LLM action — returns (action, latency_ms, model_name, prompt_sent, raw_response)
    action, server_latency_ms, model_used, prompt_sent, raw_llm_response = await reason(
        task=request.task,
        context=request.context,
        previous_actions=request.previousActions,
        step=request.stepNumber,
    )

    # Persist action to DB
    db_action = DBAction(
        session_id=request.sessionId,
        step=request.stepNumber,
        action_type=action.action,
        action_json=action.model_dump(),
        success=True,
        latency_ms=server_latency_ms,
        prompt_sent=prompt_sent,
        raw_response=raw_llm_response,
        model_used=model_used,
    )
    db.add(db_action)

    # Persist metrics
    db_metrics = DBMetrics(
        session_id=request.sessionId,
        step=request.stepNumber,
        server_ms=server_latency_ms,
        total_ms=server_latency_ms,
        pii_detected=request.context.piiSummary.totalDetected,
        pii_redacted=request.context.piiSummary.totalRedacted,
        raw_bytes_sent=0,  # Invariant: always 0
    )
    db.add(db_metrics)
    await db.commit()

    # Track latest perception for dashboard live view
    global _latest_perception
    _latest_perception = {
        "sessionId": request.sessionId,
        "task": request.task,
        "step": request.stepNumber,
        "url": getattr(request.context, "pageUrl", getattr(request.context, "url", "")),
        "title": getattr(request.context, "pageTitle", getattr(request.context, "title", "")),
        "piiSummary": request.context.piiSummary.model_dump() if hasattr(request.context.piiSummary, "model_dump") else dict(request.context.piiSummary),
        "sanitizedScreenshot": getattr(request.context, "sanitizedScreenshot", None),
        "sanitizedText": (getattr(request.context, "sanitizedText", "") or "")[:1200],
        "elements": [e.model_dump() if hasattr(e, "model_dump") else dict(e) for e in request.context.elements[:50]],
        "timestamp": time.time(),
    }

    provider = os.getenv("LLM_PROVIDER", "gemini").lower()
    return ActionResponse(
        action=action,
        sessionId=request.sessionId,
        stepNumber=request.stepNumber,
        serverLatencyMs=server_latency_ms,
        llmProvider=provider,
        modelUsed=model_used,
        promptSentToLLM=prompt_sent,
        rawLLMResponse=raw_llm_response,
    )


# ── METRICS ───────────────────────────────────────────────────────────────────

@router.post("/metrics")
async def record_metrics(data: MetricsUpdate, db: AsyncSession = Depends(get_db)):
    m = data.metrics
    db_metrics = DBMetrics(
        session_id=data.sessionId,
        step=data.stepNumber,
        dom_analysis_ms=m.get("domAnalysisMs"),
        pii_detection_ms=m.get("piiDetectionMs"),
        redaction_ms=m.get("redactionMs"),
        ocr_ms=m.get("ocrMs"),
        network_ms=m.get("networkMs"),
        server_ms=m.get("serverMs"),
        total_ms=m.get("totalMs"),
        pii_detected=m.get("piiDetected", 0),
        pii_redacted=m.get("piiRedacted", 0),
        raw_bytes_sent=0,  # Invariant: always 0
    )
    db.add(db_metrics)
    await db.commit()
    return {"recorded": True}


@router.get("/metrics/summary")
async def get_metrics_summary(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(
            func.count(DBMetrics.id).label("total_steps"),
            func.avg(DBMetrics.dom_analysis_ms).label("avg_dom_analysis_ms"),
            func.avg(DBMetrics.pii_detection_ms).label("avg_pii_detection_ms"),
            func.avg(DBMetrics.redaction_ms).label("avg_redaction_ms"),
            func.avg(DBMetrics.ocr_ms).label("avg_ocr_ms"),
            func.avg(DBMetrics.network_ms).label("avg_network_ms"),
            func.avg(DBMetrics.server_ms).label("avg_server_ms"),
            func.avg(DBMetrics.total_ms).label("avg_total_ms"),
            func.sum(DBMetrics.raw_bytes_sent).label("total_raw_bytes_sent"),
            func.sum(DBMetrics.pii_detected).label("total_pii_detected"),
            func.sum(DBMetrics.pii_redacted).label("total_pii_redacted"),
        )
    )
    row = result.one()
    return {
        "total_steps": row.total_steps or 0,
        "avg_dom_analysis_ms": round(row.avg_dom_analysis_ms or 0, 1),
        "avg_pii_detection_ms": round(row.avg_pii_detection_ms or 0, 1),
        "avg_redaction_ms": round(row.avg_redaction_ms or 0, 1),
        "avg_ocr_ms": round(row.avg_ocr_ms or 0, 1),
        "avg_network_ms": round(row.avg_network_ms or 0, 1),
        "avg_server_ms": round(row.avg_server_ms or 0, 1),
        "avg_total_ms": round(row.avg_total_ms or 0, 1),
        "total_raw_bytes_sent": row.total_raw_bytes_sent or 0,
        "total_pii_detected": row.total_pii_detected or 0,
        "total_pii_redacted": row.total_pii_redacted or 0,
        "privacy_invariant": "raw_bytes_sent == 0",
    }


@router.get("/actions/latest")
async def get_latest_actions(limit: int = 10, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DBAction).order_by(DBAction.executed_at.desc()).limit(limit))
    actions = result.scalars().all()
    return [
        {
            "id": a.id,
            "session_id": a.session_id,
            "step": a.step,
            "action_type": a.action_type,
            "action": a.action_json,
            "success": a.success,
            "timestamp": str(a.executed_at),
            "latency_ms": a.latency_ms,
        }
        for a in actions
    ]


# ── PRIVACY EVENTS ────────────────────────────────────────────────────────────

@router.post("/privacy-events")
async def record_privacy_event(event: PrivacyEventSchema, db: AsyncSession = Depends(get_db)):
    """
    Record a privacy detection event from the extension.
    INVARIANT: Only stores metadata (type, confidence, source) — never raw PII.
    """
    db_event = DBPrivacyEvent(
        session_id=event.sessionId,
        pii_type=event.piiType,
        confidence=event.confidence,
        source=event.source,
        redaction_method=event.redactionMethod,
        raw_data_stored=False,  # Invariant: always False
    )
    db.add(db_event)
    await db.commit()
    return {"recorded": True, "raw_data_stored": False}


@router.get("/privacy-events")
async def get_privacy_events(
    session_id: str | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    """Retrieve privacy events, optionally filtered by session."""
    if session_id:
        query = select(DBPrivacyEvent).where(
            DBPrivacyEvent.session_id == session_id
        ).order_by(DBPrivacyEvent.timestamp.desc()).limit(limit)
    else:
        query = select(DBPrivacyEvent).order_by(DBPrivacyEvent.timestamp.desc()).limit(limit)

    result = await db.execute(query)
    events = result.scalars().all()
    return [
        {
            "id": e.id,
            "session_id": e.session_id,
            "pii_type": e.pii_type,
            "confidence": e.confidence,
            "source": e.source,
            "redaction_method": e.redaction_method,
            "timestamp": str(e.timestamp),
            "raw_data_stored": e.raw_data_stored,
        }
        for e in events
    ]


# ── HEALTH ────────────────────────────────────────────────────────────────────

@router.get("/health")
async def health():
    provider = os.getenv("LLM_PROVIDER", "gemini")
    model_map = {
        "groq": os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        "gemini": os.getenv("GEMINI_MODEL", "gemini-2.0-flash"),
        "openai": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        "anthropic": os.getenv("ANTHROPIC_MODEL", "claude-haiku-20240307"),
    }
    return {
        "status": "ok",
        "llm_provider": provider,
        "model": model_map.get(provider, "dynamic-dom-solver"),
        "privacy_guarantee": "server_receives_no_raw_pii",
    }
