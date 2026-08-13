"""The device registry and the single funnel every state change flows through.

All updates commit to SQLite and then broadcast the appropriate WebSocket
event, so the dashboard stays live no matter who caused the change — a user
command, an ESP32 report, or the automation engine.
"""

import math
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app import config
from app.models.device import Device, DeviceState
from app.models.sensor import SensorReading
from app.services.broadcast import broadcast_event

DEFAULT_NAMES = {
    "fan": "Fan",
    "light": "Light",
    "sensor": "Sensor",
    "switch": "Switch",
    "motion": "Motion",
    "rgb": "RGB Light",
}

# What a dashboard-added device can do, by type. Adding a new type here (or
# leaving it out for a fully custom device) is all the backend needs — the
# dashboard renders whatever capabilities the registry reports.
CAPABILITY_BY_TYPE = {
    "fan": ["power"],
    "light": ["power"],
    "switch": ["power"],
    "rgb": ["power", "color"],
    "motion": [],
    "sensor": ["temperature", "humidity"],
}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------

def serialize(device: Device, state: Optional[DeviceState]) -> dict[str, Any]:
    return {
        "id": device.id,
        "name": device.name,
        "type": device.type,
        "sensorType": device.sensor_type,
        "pin": device.pin,
        "online": state.online if state else False,
        "capabilities": list(device.capabilities or []),
        "state": dict(state.state) if state else {},
        "data": dict(state.data) if state and state.data else None,
        "lastSeen": state.last_seen.isoformat() if state and state.last_seen else None,
        "nodeId": device.node_id,
    }


def default_name(device_type: str, device_id: str) -> str:
    base = DEFAULT_NAMES.get(device_type, device_type.capitalize())
    parts = device_id.split("_")
    if len(parts) > 1 and parts[-1].isdigit():
        return f"{base} {int(parts[-1])}"
    return base


# ---------------------------------------------------------------------------
# Provisioning (devices added from the dashboard)
# ---------------------------------------------------------------------------

def _next_device_id(session: Session, device_type: str) -> str:
    """Automatic ids in the house style: light_01, fan_02, … The number is
    the next free slot for that type, so ids stay stable and readable."""
    prefix = f"{device_type}_"
    nums = [
        int(i[len(prefix):])
        for i in session.exec(select(Device.id)).all()
        if i.startswith(prefix) and i[len(prefix):].isdigit()
    ]
    return f"{prefix}{max(nums, default=0) + 1:02d}"


def create_device(
    session: Session,
    name: str,
    device_type: str,
    pin: int,
    sensor_type: Optional[str] = None,
) -> dict[str, Any]:
    """Add a device to the registry from the dashboard.

    The user supplies name, type, and the GPIO pin the hardware is wired to;
    the backend generates the permanent id, derives capabilities from the
    type, and hands the pin map to the owning node via /api/esp32/{id}/devices
    (the node is data-driven — nothing is hard-coded in firmware).
    """
    name = (name or "").strip()
    device_type = (device_type or "").strip().lower()
    if not name:
        raise HTTPException(status_code=400, detail="Give the device a name.")
    if len(name) > 40:
        raise HTTPException(status_code=400, detail="Name is too long (40 characters max).")
    if not device_type or not re.fullmatch(r"[a-z0-9_]+", device_type):
        raise HTTPException(
            status_code=400,
            detail="Type must use letters, numbers, or underscores.",
        )
    if pin is None or not isinstance(pin, int):
        raise HTTPException(status_code=400, detail="A GPIO pin is required.")
    if not 0 <= pin <= 48:
        raise HTTPException(status_code=400, detail="Pin must be between 0 and 48.")

    clash = session.exec(
        select(Device).where(Device.node_id == config.DEFAULT_NODE_ID, Device.pin == pin)
    ).first()
    if clash is not None:
        raise HTTPException(
            status_code=400,
            detail=f"Pin {pin} is already used by {clash.name} ({clash.id}).",
        )

    device_id = _next_device_id(session, device_type)
    capabilities = list(CAPABILITY_BY_TYPE.get(device_type, []))
    resolved_sensor_type = sensor_type or ("temperature_humidity" if device_type == "sensor" else None)

    now = utcnow()
    device = Device(
        id=device_id,
        name=name,
        type=device_type,
        sensor_type=resolved_sensor_type,
        capabilities=capabilities,
        node_id=config.DEFAULT_NODE_ID,
        pin=pin,
        created_at=now,
        updated_at=now,
    )
    session.add(device)
    # Honest start: nobody is reporting it yet. It flips online the moment the
    # node's next report covers it.
    session.add(DeviceState(device_id=device_id, online=False, updated_at=now))
    session.commit()
    session.refresh(device)

    serialized = serialize(device, session.get(DeviceState, device_id))
    broadcast_event("device_update", device=serialized)
    return {"success": True, "device": serialized}


def node_devices(session: Session, node_id: str) -> list[dict[str, Any]]:
    """The pin map a node drives: every device assigned to it that has a pin.
    This is what the ESP32 fetches instead of a hard-coded device table."""
    devices = session.exec(
        select(Device)
        .where(Device.node_id == node_id, Device.pin.is_not(None))
        .order_by(Device.id)
    ).all()
    return [
        {
            "id": d.id,
            "type": d.type,
            "pin": d.pin,
            "sensorType": d.sensor_type,
            "capabilities": list(d.capabilities or []),
        }
        for d in devices
    ]


def remove_device(session: Session, device_id: str) -> dict[str, Any]:
    """Delete a device and everything about it. The id is never reused."""
    device = session.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")

    state = session.get(DeviceState, device_id)
    if state is not None:
        session.delete(state)
    for reading in session.exec(
        select(SensorReading).where(SensorReading.device_id == device_id)
    ).all():
        session.delete(reading)
    session.delete(device)
    session.commit()
    broadcast_event("device_removed", deviceId=device_id)
    return {"success": True}


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------

def list_devices(session: Session) -> list[dict[str, Any]]:
    devices = session.exec(select(Device).order_by(Device.id)).all()
    states = {s.device_id: s for s in session.exec(select(DeviceState)).all()}
    return [serialize(d, states.get(d.id)) for d in devices]


def get_device(session: Session, device_id: str) -> dict[str, Any]:
    device = session.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    return serialize(device, session.get(DeviceState, device_id))


# ---------------------------------------------------------------------------
# Node reporting (registration + state)
# ---------------------------------------------------------------------------

def register_devices(
    session: Session, node_id: str, registrations: list
) -> list[dict[str, Any]]:
    """Create or refresh the registry entries a node claims to own."""
    now = utcnow()
    out: list[dict[str, Any]] = []
    for reg in registrations:
        device = session.get(Device, reg.id)
        if device is None:
            device = Device(
                id=reg.id,
                name=reg.name or default_name(reg.type, reg.id),
                type=reg.type,
                sensor_type=reg.sensorType,
                capabilities=list(reg.capabilities),
                node_id=node_id,
                created_at=now,
                updated_at=now,
            )
            session.add(device)
            state = DeviceState(device_id=reg.id, online=True, last_seen=now, updated_at=now)
            session.add(state)
        else:
            device.type = reg.type
            device.sensor_type = reg.sensorType
            device.capabilities = list(reg.capabilities)
            device.node_id = node_id
            device.updated_at = now
            session.add(device)
            state = session.get(DeviceState, reg.id)
            if state is None:
                state = DeviceState(device_id=reg.id)
                session.add(state)
            state.online = True
            state.last_seen = now
            state.updated_at = now
        session.commit()
        session.refresh(device)
        serialized = serialize(device, session.get(DeviceState, reg.id))
        out.append(serialized)
        broadcast_event("device_update", device=serialized)
    return out


def report_states(session: Session, node_id: str, reports: list) -> list[dict[str, Any]]:
    """Apply a node's state report and broadcast what changed."""
    now = utcnow()
    updated: list[dict[str, Any]] = []
    for rep in reports:
        device = session.get(Device, rep.id)
        if device is None:
            # Unknown device — it must register before reporting.
            continue
        state = session.get(DeviceState, rep.id)
        if state is None:
            state = DeviceState(device_id=rep.id)
            session.add(state)

        was_online = state.online
        if rep.state is not None:
            state.state = dict(rep.state)
        if rep.data is not None:
            state.data = dict(rep.data)
        if rep.online is not None:
            state.online = bool(rep.online)
        else:
            state.online = True
        state.last_seen = now
        state.updated_at = now
        session.add(state)
        session.commit()

        serialized = serialize(device, state)
        updated.append(serialized)
        if was_online and not state.online:
            broadcast_event("device_offline", deviceId=rep.id)
        else:
            broadcast_event("device_update", device=serialized)
    return updated


def mark_offline(session: Session, device_id: str) -> None:
    """Force a device offline (used by the node watchdog)."""
    state = session.get(DeviceState, device_id)
    if state is None or not state.online:
        return
    state.online = False
    state.updated_at = utcnow()
    session.add(state)
    session.commit()
    broadcast_event("device_offline", deviceId=device_id)


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def _validate_command_value(command: str, value: Any) -> None:
    if command == "power":
        if not isinstance(value, bool):
            raise HTTPException(400, "Invalid value for power — expected true or false")
    elif command == "brightness":
        if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 100:
            raise HTTPException(400, "Invalid value for brightness — expected an integer from 0 to 100")
    elif command == "speed":
        if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 3:
            raise HTTPException(400, "Invalid value for speed — expected an integer from 0 to 3")
    elif command == "color":
        if not isinstance(value, str) or not value.startswith("#"):
            raise HTTPException(400, "Invalid value for color — expected a hex string like #ff8800")
    # Unknown capabilities pass through unvalidated; the device decides.


def apply_command(
    session: Session,
    device_id: str,
    command: str,
    value: Any,
    *,
    source: str = "user",
) -> dict[str, Any]:
    """Validate a command, then hand it to the owning node.

    The command is *enqueued*, not executed: the ESP32 executes it and the
    resulting state arrives via its next report, which is what the dashboard
    shows. Nothing is assumed to have happened until then.
    """
    from app.services import automation, esp32_manager  # late import to avoid a cycle

    device = session.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")

    state = session.get(DeviceState, device_id)
    if state is None or not state.online:
        raise HTTPException(status_code=409, detail="Device is offline")

    capabilities = device.capabilities or []
    if command not in capabilities:
        raise HTTPException(status_code=400, detail=f"Device does not support {command} control")

    _validate_command_value(command, value)

    # In Smart Mode the automation engine owns the fan. A user request is told
    # to switch to Manual; the engine itself uses source="automation".
    if source == "user" and device.type == "fan" and automation.get_mode() == "smart":
        raise HTTPException(
            status_code=409,
            detail="Smart mode is controlling this fan — switch to Manual to take over",
        )

    esp32_manager.enqueue_command(device.node_id, device_id, command, value)
    return {"success": True, "device": serialize(device, state)}


# ---------------------------------------------------------------------------
# Renaming
# ---------------------------------------------------------------------------

def rename_device(session: Session, device_id: str, name: str) -> dict[str, Any]:
    device = session.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    name = name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name can't be empty")
    if len(name) > 40:
        raise HTTPException(status_code=400, detail="Name is too long (40 characters max)")

    device.name = name
    device.updated_at = utcnow()
    session.add(device)
    session.commit()
    session.refresh(device)

    serialized = serialize(device, session.get(DeviceState, device_id))
    broadcast_event("device_renamed", device=serialized)
    return {"success": True, "device": serialized}


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

def get_history(
    session: Session,
    device_id: str,
    hours: int = 24,
    max_points: int = 96,
) -> dict[str, Any]:
    device = session.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")

    since = utcnow() - timedelta(hours=hours)
    rows = session.exec(
        select(SensorReading)
        .where(SensorReading.device_id == device_id, SensorReading.timestamp >= since)
        .order_by(SensorReading.timestamp.asc())
    ).all()

    # Keep the payload bounded for the chart: thin to ~max_points evenly.
    if len(rows) > max_points:
        step = math.ceil(len(rows) / max_points)
        rows = rows[::step]

    return {
        "readings": [
            {
                "timestamp": r.timestamp.isoformat(),
                "temperature": r.temperature,
                "humidity": r.humidity,
            }
            for r in rows
        ]
    }
