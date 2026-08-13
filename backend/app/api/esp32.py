from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.database import get_session
from app.schemas.device import NodeRegistration, NodeReport
from app.services import device_manager, esp32_manager

router = APIRouter(prefix="/api/esp32", tags=["esp32"])


@router.post("/register")
def register_node(body: NodeRegistration, session: Session = Depends(get_session)):
    """A node introduces itself and the hardware it owns."""
    devices = esp32_manager.register(session, body.node_id, body.devices)
    return {"success": True, "nodeId": body.node_id, "devices": devices}


@router.post("/report")
def report_node(body: NodeReport, session: Session = Depends(get_session)):
    """A node reports the current state of its devices (heartbeat)."""
    updated = esp32_manager.report(session, body.node_id, body.devices)
    return {"success": True, "updated": updated}


@router.get("/{node_id}/commands")
def node_commands(node_id: str):
    """Drain the pending commands for a node. Polled by the ESP32."""
    return {"commands": esp32_manager.pop_commands(node_id)}


@router.get("/{node_id}/devices")
def node_devices(node_id: str, session: Session = Depends(get_session)):
    """The pin map a node drives, fetched by the ESP32 at boot and on a
    refresh timer. Devices are added from the dashboard (name + pin + type);
    the firmware holds no hard-coded device table."""
    return {"devices": device_manager.node_devices(session, node_id)}
