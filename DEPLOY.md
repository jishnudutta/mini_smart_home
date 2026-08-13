# Deploying with Docker

The whole stack — backend, dashboard, and the nginx gateway — runs as two
containers defined in `docker-compose.yml`. nginx is its own image: it serves
the built dashboard and forwards `/api` and `/ws` to the backend container, so
the browser only ever talks to one origin (port 9000 by default).

```
  browser ──▶ http://<vps>:9000 ──▶ nginx (port 80) ──┬─▶ /  , /assets  → static dashboard
                                                      ├─▶ /api/*        → backend:8000
                                                      └─▶ /ws           → backend:8000 (WebSocket)
  ESP32 node ──▶ http://<vps>:9000/api/esp32/...  (same gateway)
```

## Prerequisites

- A VPS (or any host) with **Docker** and **Docker Compose**.
- Port **9000/TCP** open in the VPS firewall / security group — that's the
  published port the browser *and* the ESP32 use.

## Run it

```bash
# from the repo root
docker compose up -d --build
```

- Dashboard: `http://<vps-ip>:9000/` (Docs page → interactive circuit lab, API playground, setup guide)
- API (via gateway): `http://<vps-ip>:9000/api/status`
- API docs (via gateway): `http://<vps-ip>:9000/docs` (proxied through nginx)
- Health: `http://<vps-ip>:9000/api/health` (liveness/readiness — the stack's
  container healthchecks probe this endpoint, and nginx waits for the
  backend to report healthy before it starts)
- **API direct: `http://<vps-ip>:9001/api/status`** — the backend is published
  directly on **9001** (no nginx in between). FastAPI answers `/api/*`,
  `/docs`, and `/ws` here — handy for `curl`, scripts, and other tools.

Change the published ports by editing the `ports:` lines in
`docker-compose.yml` — `"9000:80"` → `"9001:80"` for the dashboard, etc.

## Verify it works

```bash
curl http://127.0.0.1:9000/api/status        # {"online":false,"deviceCount":0,...}
curl http://127.0.0.1:9000/api/devices       # {"devices":[]} — empty until hardware checks in
curl http://127.0.0.1:9001/api/status        # same via the direct API port
```

```bash
curl http://127.0.0.1:9000/api/health       # {"status":"ok","database":"ok",...}
```

A WebSocket check: `curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
-H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
http://127.0.0.1:9000/ws` should return `101 Switching Protocols`.

## Data persistence

The SQLite database lives on the named volume `smartroom-data`, mounted at
`/app/data` in the backend container. Restarts and rebuilds keep your device
registry and history:

```bash
docker compose down        # containers stop; data stays
docker compose down -v     # ⚠ also deletes the database
```

## Pointing the ESP32 at the deployed backend

In `esp32/firmware/smart_room_node/config.h`, set `BACKEND_HOST` to the VPS
address and recompile/upload:

```cpp
const char* BACKEND_HOST = "<vps-ip-or-domain>";  // no http:// — the firmware adds it
const uint16_t BACKEND_PORT = 9000;
```

The node registers, fetches its device map, and polls commands through the same
nginx gateway. The dashboard is fully dynamic: whatever the node registers is
what renders — nothing is pre-seeded in the container database.

## Updating

```bash
git pull
docker compose up -d --build
```

## Notes

- The dashboard is built **same-origin** (`VITE_API_URL=""`): it talks only to
  nginx, which proxies to the backend. There is no cross-origin traffic in the
  container stack.
- `SIMULATOR_ENABLED=false` by default — the container waits for real hardware.
- The stack has **no authentication** (v0.1 assumes a trusted network, see the
  plan's security notes). If you expose port 9000 to the public internet, put
  TLS in front (Caddy, certbot + nginx) and add auth before doing so — anyone
  who can reach the port can add and control devices.
