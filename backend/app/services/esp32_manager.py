"""ESP32 node management.

The FastAPI backend is the API server; each ESP32 is just a hardware node that
registers itself, reports state, and polls for pending commands. This module
keeps the node registry and the per-node command queues.

Command flow (v0.1, HTTP):
    React -> POST /api/devices/{id}/command
          -> device_manager validates
          -> esp32_manager enqueues for the owning node
          -> the node polls GET /api/esp32/{node_id}/commands
          -> executes on hardware
          -> reports new state via POST /api/esp32/report
          -> backend persists + broadcasts over WebSocket
"""

import asyncio
import logging
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any, Optional

from fastapi import HTTPException
from sqlmodel import Session

from app import config
from app.database import engine

logger = logging.getLogger("smartroom.esp32")


class Node:
    def __init__(self, node_id: str) -> None:
        self.node_id = node_id
        self.last_seen: datetime = datetime.now(timezone.utc)
        self.commands: "asyncio.Queue[dict[str, Any]]" = asyncio.Queue()
        self.device_ids: set[str] = set()


_nodes: dict[str, Node] = {}


def active_nodes() -> dict[str, Node]:
    return dict(_nodes)


def _get_node(node_id: str) -> Node:
    node = _nodes.get(node_id)
    if node is None:
        node = Node(node_id)
        _nodes[node_id] = node
    return node


def _as_obj(item: Any) -> Any:
    """Accept either pydantic objects (API) or plain dicts (simulator),
    with every optional attribute defaulted so downstream code can read
    `reg.name`, `rep.data`, etc. without guarding each one."""
    if not isinstance(item, dict):
        return item
    defaults = {
        "name": None,
        "sensorType": None,
        "capabilities": [],
        "state": None,
        "data": None,
        "online": None,
    }
    return SimpleNamespace(**{**defaults, **item})


def register(session: Session, node_id: str, registrations: list) -> list[dict[str, Any]]:
    from app.services import device_manager

    registrations = [_as_obj(r) for r in registrations]
    node = _get_node(node_id)
    node.last_seen = datetime.now(timezone.utc)
    node.device_ids = {r.id for r in registrations}
    return device_manager.register_devices(session, node_id, registrations)


def report(session: Session, node_id: str, reports: list) -> list[dict[str, Any]]:
    from app.services import device_manager

    reports = [_as_obj(r) for r in reports]
    node = _get_node(node_id)
    node.last_seen = datetime.now(timezone.utc)
    node.device_ids.update(r.id for r in reports)
    return device_manager.report_states(session, node_id, reports)


def enqueue_command(
    node_id: Optional[str], device_id: str, command: str, value: Any
) -> None:
    node = _nodes.get(node_id) if node_id else None
    if node is None:
        raise HTTPException(status_code=503, detail="ESP32 unavailable")
    node.commands.put_nowait({"deviceId": device_id, "command": command, "value": value})


def has_pending_command(node_id: Optional[str], device_id: str) -> bool:
    """True if a command for this device is still waiting for the node to
    pick it up — lets the automation engine avoid re-enqueuing a transition
    while hardware is still executing it."""
    node = _nodes.get(node_id) if node_id else None
    if node is None:
        return False
    return any(c["deviceId"] == device_id for c in node.commands._queue)  # noqa: SLF001


def pop_commands(node_id: str) -> list[dict[str, Any]]:
    """Drain a node's pending commands. Polled by the ESP32 (or simulator)."""
    node = _nodes.get(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    out: list[dict[str, Any]] = []
    while not node.commands.empty():
        out.append(node.commands.get_nowait())
    return out


async def watchdog_loop() -> None:
    """Mark the devices of silent nodes offline."""
    from app.services import device_manager

    while True:
        await asyncio.sleep(15)
        now = datetime.now(timezone.utc)
        stale = [
            node_id
            for node_id, node in _nodes.items()
            if (now - node.last_seen).total_seconds() > config.NODE_TIMEOUT_SECONDS
        ]
        if not stale:
            continue
        for node_id in stale:
            node = _nodes.get(node_id)
            if node is None:
                continue
            logger.warning("node %s missed its heartbeat — marking devices offline", node_id)
            try:
                with Session(engine) as session:
                    for device_id in list(node.device_ids):
                        device_manager.mark_offline(session, device_id)
            except Exception:
                logger.exception("watchdog failed for node %s", node_id)
            _nodes.pop(node_id, None)
