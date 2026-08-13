# Smart Room — dashboard

> **Deploying with Docker?** The dashboard builds inside the nginx image
> (`docker/Dockerfile.nginx`) and is served same-origin behind the nginx
> gateway on port 9000 — see [`../DEPLOY.md`](../DEPLOY.md). The rest of this
> file describes local development.

Live control panel for a **miniature smart room**, driven by an ESP32
hardware node and the FastAPI backend in `../backend`. The dashboard is fully
**dynamic**: it renders whatever devices the backend reports — nothing is
hard-coded and no test data ships with the app. For each device it decides
the icon, controls, and info from `type`, `sensorType`, `capabilities`, and
`state`. An empty registry shows an empty room, until a real node registers.

## Quick start

The backend must be running first (see `../backend`), then:

```bash
npm install
npm run dev        # http://localhost:5173
```

## Environment

| Variable       | Default               | Meaning                    |
| -------------- | --------------------- | -------------------------- |
| `VITE_API_URL` | `http://localhost:8000` | FastAPI backend origin |

## Project structure

```
src/
├── api/smartRoomApi.js        # every backend call lives here (no URLs in components)
├── context/SmartRoomContext.jsx  # shared state: devices, mode, actions, WS handling
├── hooks/useSmartRoom.js
├── pages/Dashboard.jsx
├── components/
│   ├── DeviceCard.jsx         # one card for every device type (per-type accent)
│   ├── DeviceIcon.jsx         # type → icon (unknown types fall back safely)
│   ├── DeviceMenu.jsx         # per-card actions (rename / remove)
│   ├── AddDeviceModal.jsx     # add a device: name + type + GPIO pin (id is automatic)
│   ├── RemoveConfirmModal.jsx # destructive-action guard
│   ├── RenameModal.jsx
│   ├── EnvironmentCard.jsx    # atmosphere band (only when a sensor reports)
│   ├── ConnectionStatus.jsx
│   ├── SensorChart.jsx        # 24h temperature/humidity trace
│   └── ModeSwitch.jsx         # Smart / Manual (lives in the header)
└── utils/deviceIcons.js       # device type → icon map
```

## Design notes

The dashboard is a **bright, futuristic home-control surface** — the control
center of a modern smart-home product, not a dark developer console:

- **Palette** — a light base `#f4f7fd` with layered ambient gradients
  (soft cyan top-left, lavender top-right, faint teal below); deep navy ink
  `#12203f` for text; accents of blue `#3b82f6`, violet `#8b7cf6`, cyan
  `#0ea5e9`, amber `#f5a623`, and orange `#f97316` (hot / offline).
- **Type** — Space Grotesk for the display voice (brand, modal titles,
  state panels); Instrument Sans for body; IBM Plex Mono for every number,
  tag, and caption — the ESP32 serial-monitor vernacular.
- **Surfaces** — translucent glass panels: `backdrop-blur` + saturation,
  hairline borders, soft shadows, generous 18–20px radii, and a thin
  gradient hairline along each card's top edge.
- **Device accents** — each device card carries a subtle ambient accent from
  its own type: fan = cool cyan, light = warm amber, sensor = cyan (shifting
  to orange when the room runs hot), unknown types = neutral slate. The
  accent drives the icon chip, the top hairline, the corner glow, and the
  toggle's on-state.
- **Motion** — soft zone entrances on load, gentle glow pulse on online
  dots, a subtle pop when sensor values refresh over the WebSocket, and
  hover elevation on cards. `prefers-reduced-motion` is respected throughout.
- **Copy voice** — plain verbs, sentence case, names from the user's side
  ("The ID stays light_01 — only the label changes"). Errors say what
  happened and how to fix it; empty rooms invite a check-in.

## API contract

The api client expects these backend endpoints:

```
GET    /api/devices                    → { devices: [...] }   (each device carries its pin)
POST   /api/devices                    → { name, type, pin }  (backend generates the id)
DELETE /api/devices/{id}               → removes the device + its history
GET    /api/status                     → { online, deviceCount, connectedDevices, uptime, nodeId, mode }
POST   /api/devices/{id}/command       → { command, value }  (validates capability)
PATCH  /api/devices/{id}               → { name }  (id never changes)
GET    /api/devices/{id}/history       → { readings: [{ timestamp, temperature, humidity }] }
POST   /api/mode                       → { mode: "smart" | "manual" }
WS     /ws                             → { event: "device_update" | "device_renamed" | "device_removed" | "device_offline", ... }
```

Devices are **not hard-coded anywhere**: add one from the dashboard (name +
type + GPIO pin) and the ESP32 picks it up on its next device-map refresh —
the same dynamic contract covers adding, renaming, and removing.

Live updates arrive over `/ws`; the Smart Mode rule itself (`≥28°C → fan on`,
`<27°C → fan off`, hysteresis) runs in the backend automation engine and keeps
working with no browser open.

## Roadmap

Phase 1: UI · Phase 2 (done): FastAPI backend · Phase 3 (done with 2): SQLite
persistence · Phase 4 (done): ESP32 firmware in `../esp32` · Phases 5–8:
integration, WebSockets (done with 2), automation (done with 2), and the
physical mini room.
