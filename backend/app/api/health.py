"""Liveness / readiness endpoint for orchestrators and Docker healthchecks.

`/api/status` answers the dashboard's "is the room alive" question with rich
state. This endpoint is deliberately small and side-effect free so container
orchestrators and load balancers can probe it every few seconds.

Returns HTTP 200 whenever the process is up and the database answers; the
payload carries details (database, node presence) for human debugging.
"""

import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlmodel import Session, text

from app import config
from app.database import get_session
from app.services import esp32_manager

router = APIRouter(tags=["health"])

_started = time.monotonic()


@router.get("/api/health")
def health(session: Session = Depends(get_session)):
    try:
        session.exec(text("SELECT 1"))
        database = "ok"
    except Exception:
        database = "error"

    now = datetime.now(timezone.utc)
    nodes = esp32_manager.active_nodes()
    node_online = any(
        (now - node.last_seen).total_seconds() <= config.NODE_TIMEOUT_SECONDS
        for node in nodes.values()
    )

    return {
        "status": "ok" if database == "ok" else "degraded",
        "service": "smart-room-backend",
        "version": "0.1.0",
        "database": database,
        "nodeOnline": node_online,
        "uptimeSeconds": int(time.monotonic() - _started),
        "time": now.isoformat(),
    }
