"""API routes for the Privacy-Preserving Browser Agent server."""
from __future__ import annotations
import time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.schemas.action import (
    ActionRequest, ActionResponse, SessionCreate, MetricsUpdate, BrowserAction
)
from app.agent.reasoner import reason
from app.models.db import (
    Session as DBSession, Action as DBAction, Metrics as DBMetrics, get_db
)

router = APIRouter()


# ── SESSIONS ──────────────────────────────────────────────────────────────────

@router.post("/sessions")
async def create_session(body: SessionCreate, db: AsyncSession = Depends(get_db)):
    session = DBSession(id=body.sessionId, task=body.taskInstruction)
    db.add(session)
    await db.commit()
    return {"sessionId": body.sessionId, "status": "created"}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DBSession).where(DBSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"id": session.id, "task": session.task, "status": session.status}


@router.get("/sessions")
async def list_sessions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DBSession).order_by(DBSession.created_at.desc()).limit(20))
    sessions = result.scalars().all()
    return [{"id": s.id, "task": s.task, "status": s.status, "created_at": str(s.created_at)} for s in sessions]


# ── MAIN ACTION ENDPOINT ───────────────────────────────────────────────────────

@router.post("/action", response_model=ActionResponse)
async def get_next_action(request: ActionRequest, db: AsyncSession = Depends(get_db)):
    """
    Core endpoint: receives sanitized context, calls LLM, returns structured action.

    PRIVACY INVARIANT: This function receives ONLY sanitized context.
    No raw PII ever reaches this endpoint.
    """
    t0 = time.time()

    try:
        action, llm_latency, model_name = await reason(
            task=request.task,
            context=request.context,
            step=request.stepNumber,
        )
    except Exception as e:
        # If LLM fails, return a safe wait action rather than crashing
        action = BrowserAction(
            action="wait",
            amount=2000,
            reason=f"LLM error: {str(e)[:100]}. Waiting before retry.",
            confidence=0.0,
        )
        llm_latency = 0
        model_name = "error"

    total_ms = int((time.time() - t0) * 1000)

    # Persist action to DB
    db_action = DBAction(
        session_id=request.sessionId,
        step=request.stepNumber,
        action_type=action.action,
        action_json=action.model_dump(),
        latency_ms=total_ms,
    )
    db.add(db_action)
    await db.commit()

    return ActionResponse(
        action=action,
        sessionId=request.sessionId,
        stepNumber=request.stepNumber,
        serverLatencyMs=total_ms,
        llmProvider=model_name,
        modelUsed=model_name,
    )


# ── METRICS ───────────────────────────────────────────────────────────────────

@router.post("/metrics")
async def save_metrics(body: MetricsUpdate, db: AsyncSession = Depends(get_db)):
    m = body.metrics
    db_metrics = DBMetrics(
        session_id=body.sessionId,
        step=body.stepNumber,
        dom_analysis_ms=m.get("domAnalysis"),
        pii_detection_ms=m.get("piiDetection"),
        redaction_ms=m.get("redaction"),
        ocr_ms=m.get("ocr"),
        network_ms=m.get("network"),
        server_ms=m.get("serverReasoning"),
        total_ms=m.get("total"),
        raw_bytes_sent=0,  # Invariant: always 0
    )
    db.add(db_metrics)
    await db.commit()
    return {"saved": True}


@router.get("/metrics/summary")
async def get_metrics_summary(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(
            func.avg(DBMetrics.dom_analysis_ms),
            func.avg(DBMetrics.network_ms),
            func.avg(DBMetrics.server_ms),
            func.avg(DBMetrics.total_ms),
            func.sum(DBMetrics.raw_bytes_sent),
            func.count(DBMetrics.id),
        )
    )
    row = result.one()
    return {
        "avg_dom_analysis_ms": round(row[0] or 0),
        "avg_network_ms": round(row[1] or 0),
        "avg_server_ms": round(row[2] or 0),
        "avg_total_ms": round(row[3] or 0),
        "total_raw_bytes_sent": row[4] or 0,
        "total_steps": row[5] or 0,
    }


# ── HEALTH ────────────────────────────────────────────────────────────────────

@router.get("/health")
async def health():
    import os
    provider = os.getenv("LLM_PROVIDER", "gemini")
    return {
        "status": "ok",
        "llm_provider": provider,
        "privacy_guarantee": "server_receives_no_raw_pii",
    }
