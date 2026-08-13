from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.database import get_session
from app.schemas.command import CommandRequest
from app.schemas.device import CreateDeviceRequest, RenameRequest
from app.services import device_manager

router = APIRouter(prefix="/api/devices", tags=["devices"])


@router.get("")
def list_devices(session: Session = Depends(get_session)):
    """Every device the backend knows, in full — the dashboard's primary feed."""
    return {"devices": device_manager.list_devices(session)}


@router.post("")
def create_device(body: CreateDeviceRequest, session: Session = Depends(get_session)):
    """Add a device from the dashboard: name + type + GPIO pin. The backend
    generates the permanent id (light_02, fan_03, …) and derives the
    capabilities from the type. The owning node picks up the pin on its next
    device-map refresh — nothing is hard-coded in firmware."""
    return device_manager.create_device(
        session,
        body.name,
        body.type,
        body.pin,
        sensor_type=body.sensorType,
    )


@router.post("/{device_id}/command")
def send_command(
    device_id: str, body: CommandRequest, session: Session = Depends(get_session)
):
    """One generic endpoint for every device and every command.

    The backend validates the command (exists, online, capability, value) and
    routes it to the owning ESP32. Success here means *accepted* — the state
    changes when the node reports back.
    """
    return device_manager.apply_command(session, device_id, body.command, body.value)


@router.patch("/{device_id}")
def rename_device(
    device_id: str, body: RenameRequest, session: Session = Depends(get_session)
):
    """Change the display name. The id never changes."""
    return device_manager.rename_device(session, device_id, body.name)


@router.delete("/{device_id}")
def remove_device(device_id: str, session: Session = Depends(get_session)):
    """Remove a device and its history. The id is never reused."""
    return device_manager.remove_device(session, device_id)
