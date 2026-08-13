# Smart Room

A miniature smart room you build, wire, and control — ESP32 hardware, a FastAPI
backend that owns all the logic, and a live glass dashboard.

*Built by Jishworks — Jishnu Dutta · [jishworks.in](https://jishworks.in)*

```
┌────────────────────────────┐        ┌──────────────────────────────┐
│  ESP32 hardware node       │  HTTP  │  FastAPI backend             │
│  (data-driven firmware)    │◀──────▶│  registry · SQLite · WS ·     │
│  register / report / poll  │        │  smart-mode automation        │
└────────────────────────────┘        └──────────────┬───────────────┘
                                                     │ WebSocket + REST
                                          ┌──────────▼───────────────┐
                                          │  React dashboard         │
                                          │  (or the Docker stack:   │
                                          │   nginx serves + proxies)│
                                          └──────────────────────────┘
```

**The core idea:** the ESP32 is *not* an API server. It connects to Wi-Fi,
registers with the backend, **fetches the list of devices it drives from the
backend**, reports state, and polls for commands. All intelligence — the
device registry, the database, live events, and the smart-mode rule — lives
in the backend. Nothing about a device is hard-coded in the firmware: add a
device from the dashboard (name + type + GPIO pin) and the node picks it up
on its next refresh, no reflash.

## Repo layout

| Directory | What it is |
| --- | --- |
| `backend/` | FastAPI + SQLModel + SQLite. Registry, command validation, WebSocket feed, automation, node watchdog, optional simulator. |
| `frontend/` | Vite + React + Tailwind dashboard. Live device cards, sensor trace, add/rename/remove, smart/manual mode. |
| `esp32/` | Arduino firmware for the hardware node — a small, self-healing register/report/poll client. |
| `docker/`, `docker-compose.yml` | The production stack: nginx serves the built dashboard and proxies `/api` + `/ws` to the backend; one published port. |
| `DEPLOY.md` | Step-by-step deployment walkthrough (Docker, TLS notes, ESP32 pointing). |

## Quick start (development)

```bash
# 1. backend — http://127.0.0.1:8000  (interactive docs at /docs)
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python run.py

# 2. dashboard — http://127.0.0.1:5173
cd ../frontend
npm install
cp .env.example .env.local        # set VITE_API_URL=http://127.0.0.1:8000
npm run dev
```

Without hardware, enable the built-in simulator for a virtual node:

```bash
cd backend
SIMULATOR_ENABLED=true .venv/Scripts/python run.py
```

## Interactive docs

The dashboard ships a **Docs** page (button in the header) with three tools:

- **Circuit design lab** — an interactive ESP32 pinout and wiring diagram.
  Pick a component and a GPIO pin and the schematic draws itself; click any
  registered device to see exactly how it's wired, then provision the device
  straight from the diagram.
- **API playground** — every backend endpoint, tryable against the live room.
- **Setup guide** — a checkable, copy-paste walkthrough from bare repo to
  deployed room.

Each component has deeper docs in its own README:

- [backend/README.md](backend/README.md) — API table, environment, automation rule
- [esp32/README.md](esp32/README.md) — wiring, flashing, troubleshooting
- [DEPLOY.md](DEPLOY.md) — the Docker stack, persistence, going live

## Deploying

```bash
docker compose up -d --build
```

That builds the dashboard + nginx gateway + backend, publishes port **9000**,
and persists the SQLite database on a named volume. The ESP32 dials the same
port. Full walkthrough (including TLS + auth warnings): [`DEPLOY.md`](DEPLOY.md).

## Operations

- **Health checks** — `/api/health` answers liveness/readiness (database +
  node presence); both containers are healthchecked against it in the stack.
- **State** — `docker compose down` keeps your data; `down -v` deletes it.
- **Updating** — `git pull && docker compose up -d --build`.
