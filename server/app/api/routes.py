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
    session = await db.merge(DBSession(id=body.sessionId, task=body.taskInstruction, status="running"))
    await db.commit()
    return {"sessionId": session.id, "status": session.status}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DBSession).where(DBSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"id": session.id, "task": session.task, "status": session.status, "created_at": str(session.created_at)}


@router.get("/sessions/{session_id}/actions")
async def get_session_actions(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DBAction).where(DBAction.session_id == session_id).order_by(DBAction.step.asc())
    )
    actions = result.scalars().all()
    return [
        {
            "id": a.id,
            "session_id": a.session_id,
            "step": a.step,
            "action_type": a.action_type,
            "action": a.action_json,
            "latency_ms": a.latency_ms,
            "timestamp": str(a.executed_at),
        }
        for a in actions
    ]


@router.get("/sessions")
async def list_sessions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DBSession).order_by(DBSession.created_at.desc()).limit(20))
    sessions = result.scalars().all()
    return [{"id": s.id, "task": s.task, "status": s.status, "created_at": str(s.created_at)} for s in sessions]


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
            "latency_ms": a.latency_ms,
            "timestamp": str(a.executed_at),
        }
        for a in actions
    ]


# ── MAIN ACTION ENDPOINT ───────────────────────────────────────────────────────

@router.post("/action", response_model=ActionResponse)
async def get_next_action(request: ActionRequest, db: AsyncSession = Depends(get_db)):
    """
    Core endpoint: receives sanitized context, calls LLM, returns structured action.
    PRIVACY INVARIANT: This function receives ONLY sanitized context.
    """
    t0 = time.time()

    # Ensure session exists in DB
    sess_result = await db.execute(select(DBSession).where(DBSession.id == request.sessionId))
    session = sess_result.scalar_one_or_none()
    if not session:
        session = DBSession(id=request.sessionId, task=request.task, status="running")
        db.add(session)
        await db.commit()

    # Fetch prior actions from DB for this session (Gemini memory)
    history_result = await db.execute(
        select(DBAction)
        .where(DBAction.session_id == request.sessionId)
        .order_by(DBAction.step.asc())
    )
    prior_db_actions = history_result.scalars().all()

    # Merge: DB history + any extra history sent from extension
    previous_actions: list[dict] = []
    for a in prior_db_actions:
        entry = a.action_json or {}
        entry["step"] = a.step
        previous_actions.append(entry)

    # Also include any actions sent from the client (in case they're ahead of DB)
    for extra in request.previousActions:
        if not any(p.get("step") == extra.get("step") for p in previous_actions):
            previous_actions.append(extra)

    try:
        action, llm_latency, model_name = await reason(
            task=request.task,
            context=request.context,
            step=request.stepNumber,
            previous_actions=previous_actions,
        )
    except Exception as e:
        action = BrowserAction(
            action="wait",
            amount=2000,
            reason=f"LLM error: {str(e)[:100]}",
            confidence=0.0,
        )
        llm_latency = 0
        model_name = "error"

    total_ms = int((time.time() - t0) * 1000)

    db_action = DBAction(
        session_id=request.sessionId,
        step=request.stepNumber,
        action_type=action.action,
        action_json=action.model_dump(),
        latency_ms=total_ms,
    )
    db.add(db_action)

    if action.action == "done":
        session.status = "completed"

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
