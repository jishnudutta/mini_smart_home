"""Smart Mode automation.

The rules live here, in the backend process, and tick whether or not any
browser is open. The dashboard is just a window onto what this engine does.

Rule (hysteresis, so the fan doesn't chatter):
    temperature >= SMART_FAN_ON_TEMP  -> fan ON
    temperature <  SMART_FAN_OFF_TEMP -> fan OFF
    between the two: leave the fan alone

In Manual mode the engine does nothing — the user is in charge.
"""

import asyncio
import logging

from sqlmodel import Session

from app import config
from app.database import engine
from app.services import device_manager, esp32_manager

logger = logging.getLogger("smartroom.automation")

_mode = "manual"


def get_mode() -> str:
    return _mode


def set_mode(mode: str) -> None:
    global _mode
    if mode not in ("smart", "manual"):
        raise ValueError(f"Unknown mode: {mode}")
    _mode = mode


async def automation_loop() -> None:
    while True:
        await asyncio.sleep(config.AUTOMATION_INTERVAL)
        if _mode != "smart":
            continue
        try:
            with Session(engine) as session:
                devices = device_manager.list_devices(session)
                sensor = next(
                    (
                        d
                        for d in devices
                        if d["type"] == "sensor"
                        and d.get("data")
                        and d["data"].get("temperature") is not None
                    ),
                    None,
                )
                fan = next((d for d in devices if d["type"] == "fan"), None)
                if sensor is None or fan is None:
                    continue

                temp = sensor["data"]["temperature"]
                fan_power = bool(fan["state"].get("power", False))
                already_queued = esp32_manager.has_pending_command(fan.get("nodeId"), fan["id"])

                if already_queued:
                    continue  # hardware is still executing the last transition
                if temp >= config.SMART_FAN_ON_TEMP and not fan_power:
                    device_manager.apply_command(session, fan["id"], "power", True, source="automation")
                elif temp < config.SMART_FAN_OFF_TEMP and fan_power:
                    device_manager.apply_command(session, fan["id"], "power", False, source="automation")
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("automation tick failed")
