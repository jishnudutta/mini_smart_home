from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.broadcast import manager

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """Live event stream for dashboard clients.

    Events: device_update, device_renamed, device_offline — each carrying the
    affected device (or its id) so the UI can update in place.
    """
    await manager.connect(ws)
    try:
        while True:
            # We only send; receiving keeps the socket healthy and surfaces
            # client disconnects promptly.
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception:
        manager.disconnect(ws)
