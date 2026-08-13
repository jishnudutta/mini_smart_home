"""A virtual ESP32 node so the whole system runs before hardware exists.

It behaves exactly like the Phase 4 firmware will: register once with the
backend, then every few seconds report device states and poll the command
queue. The room has a little physics to make the demo honest:

  * the temperature drifts on a slow sine (a room that warms and cools)
  * when the fan is ON, the room cools slightly — so Smart Mode visibly
    self-regulates instead of just flipping a switch
  * the corner lamp has a "loose bulb": it drops offline briefly every 90s,
    which exercises the offline path end to end
"""

import asyncio
import logging
import math
import random
import time

from sqlmodel import Session

from app import config
from app.database import engine
from app.models.sensor import SensorReading
from app.schemas.device import DeviceRegistration
from app.services import esp32_manager

logger = logging.getLogger("smartroom.simulator")

SIM_DEVICES = [
    DeviceRegistration(
        id="fan_01", type="fan", name="Ceiling Fan", capabilities=["power"]
    ),
    DeviceRegistration(
        id="light_01", type="light", name="Room Light", capabilities=["power"]
    ),
    DeviceRegistration(
        id="dht11_01",
        type="sensor",
        name="Room Sensor",
        sensorType="temperature_humidity",
        capabilities=["temperature", "humidity"],
    ),
    DeviceRegistration(
        id="light_02", type="light", name="Corner Lamp", capabilities=["power"]
    ),
]

_sim_state = {
    "fan_01": {"power": False},
    "light_01": {"power": True},
    "light_02": {"power": True},
}

_start = time.monotonic()


def _temperature(elapsed: float) -> float:
    fan_on = bool(_sim_state["fan_01"].get("power", False))
    cooling = 0.5 if fan_on else 0.0
    wave = config.SIM_TEMP_AMPLITUDE * math.sin(2 * math.pi * elapsed / config.SIM_TEMP_PERIOD)
    noise = random.gauss(0, 0.06)
    return round(config.SIM_TEMP_BASE + wave - cooling + noise, 1)


def _humidity(elapsed: float) -> float:
    wave = 4.5 * math.sin(2 * math.pi * elapsed / (config.SIM_TEMP_PERIOD * 1.4) + 2.1)
    noise = random.gauss(0, 0.8)
    return round(63 + wave + noise)


async def run() -> None:
    with Session(engine) as session:
        esp32_manager.register(session, config.DEFAULT_NODE_ID, SIM_DEVICES)
    logger.info("simulator registered node %s with %d devices", config.DEFAULT_NODE_ID, len(SIM_DEVICES))

    last_reading = 0.0
    while True:
        try:
            # Apply anything the backend asked for (including automation).
            commands = esp32_manager.pop_commands(config.DEFAULT_NODE_ID)
            for cmd in commands:
                device_id, command, value = cmd["deviceId"], cmd["command"], cmd["value"]
                if device_id in _sim_state and command == "power":
                    _sim_state[device_id]["power"] = bool(value)
                    logger.info("simulator applied %s %s=%s", device_id, command, value)

            elapsed = time.monotonic() - _start
            temp = _temperature(elapsed)
            hum = _humidity(elapsed)

            # The corner lamp's "loose bulb": offline 12s of every 90s.
            loose_bulb = (elapsed % 90) < 12

            reports = [
                {"id": "fan_01", "state": dict(_sim_state["fan_01"])},
                {"id": "light_01", "state": dict(_sim_state["light_01"])},
                {"id": "dht11_01", "data": {"temperature": temp, "humidity": hum}},
                {
                    "id": "light_02",
                    "state": dict(_sim_state["light_02"]),
                    "online": not loose_bulb,
                },
            ]

            with Session(engine) as session:
                esp32_manager.report(session, config.DEFAULT_NODE_ID, reports)
                if elapsed - last_reading >= config.SIM_READING_INTERVAL:
                    last_reading = elapsed
                    session.add(
                        SensorReading(device_id="dht11_01", temperature=temp, humidity=hum)
                    )
                    session.commit()

            await asyncio.sleep(config.SIM_REPORT_INTERVAL)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("simulator tick failed")
            await asyncio.sleep(2)
