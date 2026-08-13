# Smart Room — backend (Phase 2)

The API server for the miniature smart room. The ESP32 is **not** the API
server — it is a hardware node that registers here, reports state, and polls
for commands. The backend owns the registry, the database, command
validation, the WebSocket feed, and the Smart Mode automation engine.

## Run it

```bash
cd backend
python -m venv .venv                          # once
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python run.py                   # http://127.0.0.1:8000
```

**Deploying with Docker?** The whole stack (backend + dashboard + nginx
gateway, published on port 9000) is orchestrated from the repo root — see
[`../DEPLOY.md`](../DEPLOY.md). `backend/Dockerfile` is the backend container;
nginx runs as its own container and proxies `/api` and `/ws` to it.

Interactive docs: http://127.0.0.1:8000/docs

The backend is **dynamic by default**: the registry starts empty and the
dashboard shows exactly what real nodes register — no test devices. A
**simulator** (a virtual ESP32 node with the same devices as the hardware) is
available for development but **off by default**; enable it with
`SIMULATOR_ENABLED=true`. It drifts the temperature on a slow sine, cools the
room when the fan is on, and drops the corner lamp offline for a few seconds
every 90 seconds ("loose bulb") to exercise the offline path.

## Environment

See `.env.example`. Key knobs:

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///./smartroom.db` | SQLite location |
| `BACKEND_HOST` / `BACKEND_PORT` | `127.0.0.1` / `8000` | bind address |
| `NODE_ID` | `esp32_room_01` | default node identity |
| `SIMULATOR_ENABLED` | `false` | virtual node on/off |
| `SMART_FAN_ON_TEMP` / `SMART_FAN_OFF_TEMP` | `28` / `27` | the rule, with hysteresis |

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/devices` | every device, full shape — the dashboard's primary feed |
| POST | `/api/devices` | `{name, type, pin}` — add a device from the dashboard; the backend generates the id (`light_02`, `fan_03`, …) and derives capabilities from the type |
| POST | `/api/devices/{id}/command` | `{command, value}` — validated, routed to the node |
| PATCH | `/api/devices/{id}` | `{name}` — rename; the id never changes |
| DELETE | `/api/devices/{id}` | remove a device and its history; the id is never reused |
| GET | `/api/devices/{id}/history` | `{readings:[{timestamp,temperature,humidity}]}`, last 24h thinned for charting |
| GET | `/api/status` | `{online, deviceCount, connectedDevices, uptime, nodeId, mode}` |
| GET/POST | `/api/mode` | read or set `smart` / `manual` |
| POST | `/api/esp32/register` | node introduces itself (the registry lives here — the node declares nothing) |
| POST | `/api/esp32/report` | node reports state / sensor data / online status |
| GET | `/api/esp32/{node_id}/commands` | node polls for pending commands |
| GET | `/api/esp32/{node_id}/devices` | the pin map a node drives — the ESP32 fetches this instead of hard-coding devices |
| WS | `/ws` | live events: `device_update`, `device_renamed`, `device_removed`, `device_offline` |

## Adding devices (not hard-coded)

Devices are added from the dashboard — name, type, and the GPIO pin the
hardware is wired to. The backend generates the permanent id, derives the
capabilities from the type, and hands the pin map to the node via
`GET /api/esp32/{node_id}/devices`, which the firmware refreshes every few
seconds. Nothing about a device is hard-coded in the ESP32: it simply drives
whatever pins the backend tells it to own. Capabilities per type:
`light`/`fan`/`switch`/`rgb` → `power`; `sensor` → `temperature` + `humidity`;
`motion` → none. Adding a brand-new type requires no backend or dashboard
changes — the registry and the UI are both data-driven.

Command validation returns meaningful errors: device not found (404),
device offline (409), unsupported capability (400), invalid value (400),
ESP32 unavailable (503). In Smart Mode, user power commands for the fan are
rejected (409) — the engine owns it; the dashboard explains why.

## How it fits together

```
React ──REST + WS──► FastAPI ──SQLite──► registry / states / readings
                          │
                          ├─► automation (runs with no browser open)
                          │      rule: ≥28°C fan ON · <27°C fan OFF
                          ▼
                    command queue ──► ESP32 polls ──► hardware
                          ▲
                          └────── ESP32 reports state ◄──┘
```

Automation ticks in the backend process and keeps working with no dashboard
open — proven by the headless test flow (register a node via
`/api/esp32/register`, drive the temperature via `/api/esp32/report`, watch
the fan commands arrive at `/api/esp32/{node_id}/commands`).

## Structure

```
app/
├── main.py                 # app assembly + lifespan (starts automation, watchdog, simulator)
├── config.py               # every env knob, with defaults
├── database.py             # engine (WAL), session dependency
├── models/                 # Device, DeviceState, SensorReading (SQLModel)
├── schemas/                # wire shapes (camelCase where the dashboard expects it)
├── api/                    # devices, history, status, esp32, websocket routers
└── services/
    ├── device_manager.py   # registry, validation, state updates, broadcasts
    ├── esp32_manager.py    # node registry, command queues, watchdog
    ├── automation.py       # smart/manual mode + hysteresis rule
    ├── simulator.py        # virtual node until real hardware exists
    └── broadcast.py        # WebSocket fan-out (thread-safe)
```

## Phase 4 note (ESP32)

The firmware registers via `POST /api/esp32/register`, fetches its device
map via `GET /api/esp32/{node_id}/devices` (every ~10 s), reports every few
seconds via `POST /api/esp32/report`, and polls
`GET /api/esp32/{node_id}/commands` for pending work — the simulator is a
working reference implementation of the register/report/poll contract.
