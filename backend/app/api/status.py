import time

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app import config
from app.database import get_session
from app.schemas.status import ModeRequest
from app.services import automation, device_manager, esp32_manager

router = APIRouter(prefix="/api", tags=["system"])

_started = time.monotonic()


@router.get("/status")
def system_status(session: Session = Depends(get_session)):
    devices = device_manager.list_devices(session)
    nodes = esp32_manager.active_nodes()
    return {
        "online": len(nodes) > 0,
        "deviceCount": len(devices),
        "connectedDevices": sum(1 for d in devices if d["online"]),
        "uptime": int(time.monotonic() - _started),
        "nodeId": next(iter(nodes)) if nodes else config.DEFAULT_NODE_ID,
        "mode": automation.get_mode(),
    }


@router.get("/mode")
def get_mode():
    return {"mode": automation.get_mode()}


@router.post("/mode")
def set_mode(body: ModeRequest):
    if body.mode not in ("smart", "manual"):
        raise HTTPException(status_code=400, detail="Mode must be 'smart' or 'manual'")
    automation.set_mode(body.mode)
    return {"success": True, "mode": body.mode}
