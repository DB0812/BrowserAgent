"""SQLAlchemy async models for sessions, actions, metrics, and privacy events."""
from __future__ import annotations
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text, JSON
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./privacy_agent.db")

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Session(Base):
    __tablename__ = "sessions"
    id           = Column(String, primary_key=True)
    task         = Column(Text, nullable=False)
    status       = Column(String, default="active")
    created_at   = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)


class Action(Base):
    __tablename__ = "actions"
    id           = Column(Integer, primary_key=True, autoincrement=True)
    session_id   = Column(String, nullable=False)
    step         = Column(Integer, nullable=False)
    action_type  = Column(String, nullable=False)
    action_json  = Column(JSON, nullable=False)
    success      = Column(Boolean, default=True)
    executed_at  = Column(DateTime, default=datetime.utcnow)
    latency_ms   = Column(Integer, nullable=True)
    prompt_sent  = Column(Text, nullable=True)
    raw_response = Column(Text, nullable=True)
    model_used   = Column(String, nullable=True)


class PrivacyEvent(Base):
    __tablename__ = "privacy_events"
    id               = Column(Integer, primary_key=True, autoincrement=True)
    session_id       = Column(String, nullable=False)
    pii_type         = Column(String, nullable=False)
    confidence       = Column(Float, nullable=False)
    source           = Column(String, nullable=False)
    redaction_method = Column(String, nullable=False)
    timestamp        = Column(DateTime, default=datetime.utcnow)
    # INVARIANT: raw_value is NEVER stored
    raw_data_stored  = Column(Boolean, default=False)


class Metrics(Base):
    __tablename__ = "metrics"
    id                = Column(Integer, primary_key=True, autoincrement=True)
    session_id        = Column(String, nullable=False)
    step              = Column(Integer, nullable=False)
    dom_analysis_ms   = Column(Integer, nullable=True)
    pii_detection_ms  = Column(Integer, nullable=True)
    redaction_ms      = Column(Integer, nullable=True)
    ocr_ms            = Column(Integer, nullable=True)
    network_ms        = Column(Integer, nullable=True)
    server_ms         = Column(Integer, nullable=True)
    total_ms          = Column(Integer, nullable=True)
    pii_detected      = Column(Integer, default=0)
    pii_redacted      = Column(Integer, default=0)
    raw_bytes_sent    = Column(Integer, default=0)   # Always 0 if privacy holds
    created_at        = Column(DateTime, default=datetime.utcnow)


async def init_db():
    """Create all tables on startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    """Dependency: yields an async DB session."""
    async with AsyncSessionLocal() as session:
        yield session
