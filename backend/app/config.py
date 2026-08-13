"""All configuration lives here, read from environment variables.

Nothing in the app hard-codes a URL or a tuning value; the .env.example
file documents every knob.
"""

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _env_bool(name: str, default: str) -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


# --- database ------------------------------------------------------------

DATABASE_URL = os.getenv("DATABASE_URL") or f"sqlite:///{(BACKEND_DIR / 'smartroom.db').as_posix()}"

# --- server ---------------------------------------------------------------

HOST = os.getenv("BACKEND_HOST", "127.0.0.1")
PORT = int(os.getenv("BACKEND_PORT", "8000"))

# --- nodes ----------------------------------------------------------------

DEFAULT_NODE_ID = os.getenv("NODE_ID", "esp32_room_01")

# A node that stops reporting for this long has its devices marked offline.
NODE_TIMEOUT_SECONDS = float(os.getenv("NODE_TIMEOUT_SECONDS", "60"))

# --- simulator (virtual ESP32 node) ----------------------------------------
# Off by default: the system is dynamic — only devices a real node registers
# appear in the dashboard. Enable only when you want a virtual node for
# development (SIMULATOR_ENABLED=true).

SIMULATOR_ENABLED = _env_bool("SIMULATOR_ENABLED", "false")
SIM_REPORT_INTERVAL = float(os.getenv("SIM_REPORT_INTERVAL", "1"))
SIM_READING_INTERVAL = float(os.getenv("SIM_READING_INTERVAL", "30"))  # history row cadence (s)
SIM_TEMP_BASE = float(os.getenv("SIM_TEMP_BASE", "27.6"))
SIM_TEMP_AMPLITUDE = float(os.getenv("SIM_TEMP_AMPLITUDE", "0.8"))
SIM_TEMP_PERIOD = float(os.getenv("SIM_TEMP_PERIOD", "420"))           # sine period (s)

# --- automation -----------------------------------------------------------

AUTOMATION_INTERVAL = float(os.getenv("AUTOMATION_INTERVAL", "2"))     # rule tick (s)

# Smart Mode rule for the fan, with hysteresis:
#   temperature >= SMART_FAN_ON_TEMP  -> fan ON
#   temperature <  SMART_FAN_OFF_TEMP -> fan OFF
# The dead band between the two prevents rapid switching.
SMART_FAN_ON_TEMP = float(os.getenv("SMART_FAN_ON_TEMP", "28"))
SMART_FAN_OFF_TEMP = float(os.getenv("SMART_FAN_OFF_TEMP", "27"))
