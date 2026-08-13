"""WebSocket fan-out for live dashboard updates.

One connection manager shared by every service. `broadcast()` is safe to call
from anywhere — the event loop (background tasks) or FastAPI's threadpool
(sync endpoints) — because it schedules onto the main loop internally.
"""

import asyncio
import json
import logging
from typing import Any, Optional

from fastapi import WebSocket

logger = logging.getLogger("smartroom.ws")


class ConnectionManager:
    def __init__(self) -> None:
        self.active: set[WebSocket] = set()
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self.active.discard(ws)

    async def _broadcast(self, payload: dict[str, Any]) -> None:
        if not self.active:
            return
        text = json.dumps(payload, default=str)
        dead: list[WebSocket] = []
        for ws in list(self.active):
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    def broadcast(self, payload: dict[str, Any]) -> None:
        if self._loop is None or self._loop.is_closed():
            return
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is self._loop:
            asyncio.create_task(self._broadcast(payload))
        else:
            asyncio.run_coroutine_threadsafe(self._broadcast(payload), self._loop)


manager = ConnectionManager()


def broadcast_event(event: str, **payload: Any) -> None:
    manager.broadcast({"event": event, **payload})
