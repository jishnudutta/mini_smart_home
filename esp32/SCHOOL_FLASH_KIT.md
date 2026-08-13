# School flash kit — checklist

Take this on a pen drive, flash the Smart Room node, and get it talking to
the backend on **your VPS** — or run it standalone with no network at all.

## 1. What to copy onto the pen drive

Copy the **whole project folder** (it's small — source only, no node_modules
or build artifacts). You need at least:

| Item | Why |
| --- | --- |
| `esp32/firmware/smart_room_node/` | the sketch — `smart_room_node.ino` + `config.h` + `platformio.ini` |
| `esp32/SCHOOL_FLASH_KIT.md` | this checklist |

(The `backend/` folder isn't needed at school — your backend runs on the VPS.)

Keep the folder named `smart_room_node` — the Arduino IDE requires the sketch
folder name to match the `.ino` file. Don't drag the files out onto the desk.

## 2. ⚠ Do this BEFORE you leave home

Open `config.h` in the sketch folder and set the real values:

```cpp
const char* WIFI_SSID = "the-wifi-name-at-school";   // or a phone hotspot
const char* WIFI_PASS = "the-wifi-password";

// Your VPS — FastAPI + dashboard run there on port 9000. No "http://".
const char* BACKEND_HOST = "203.0.113.10";   // or your domain, e.g. "api.jishworks.in"
const uint16_t BACKEND_PORT = 9000;
```

- `BACKEND_HOST` is your **VPS address or domain** (or the LAN IP of any
  machine running the backend on the same network).
- The VPS must have the stack deployed and port **9000/TCP** open in its
  firewall (`docker compose up -d --build`, see `DEPLOY.md`).
- If the school Wi-Fi has a **captive portal** (browser login page), the
  ESP32 can't get out — use a phone hotspot.

## 3. At school — one-time Arduino IDE setup

1. Install the **Arduino IDE 2.x**.
2. *Tools → Board → Boards Manager* → search **esp32** by Espressif → Install.
3. *Library Manager* → install **ArduinoJson**, **DHT sensor library**,
   **Adafruit Unified Sensor**.
4. Plug the ESP32 in with a **data** USB cable (a charge-only cable shows no
   COM port).

## 4. Flash

1. *File → Open* → `smart_room_node.ino` (the whole folder comes with it).
2. *Tools → Board* → **ESP32 Dev Module**.
3. *Tools → Port* → the COM port that appeared (e.g. `COM5`).
4. *Sketch → Upload* (Ctrl+U). Expected: `... 80% (of 1310720 bytes) ... Done uploading.`

Gotchas:

- **No COM port** → the USB-serial driver is missing (CP210x or CH340 — find
  the chip on the board) or the cable is charge-only. Try another cable.
- **Hangs on "Connecting..."** → hold the **BOOT** button while it uploads.
- **Baud 115200** for the Serial Monitor (Ctrl+Shift+M).

## 5. Running it — three ways

**A. VPS (full dashboard, remote):** the node registers with your VPS, and
the dashboard at `http://<vps-ip>:9000/` shows the model live — no local
machine needed. The school network only has to allow outbound internet.

**B. Local backend (full dashboard, offline-ish):** run the backend on a
laptop on the same Wi-Fi and point `BACKEND_HOST` at that laptop's LAN IP
(port 8000). Useful if the VPS is down:

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
BACKEND_HOST=0.0.0.0 .venv/Scripts/python run.py
```

(Windows may prompt to allow Python through the firewall — allow it.)

**C. Standalone (no network at all):** nothing to do. If no backend answers
within 30 s — or there's no Wi-Fi — the node switches to the built-in device
map in `config.h` and drives the model directly from the serial monitor:

```
on room_light     # → the light on GPIO16 turns on
on fan_01         # → the fan starts (GPIO26 via transistor)
off fan_01        # → fan stops
help              # full command list
```

The node keeps retrying and upgrades to the dashboard automatically when a
backend appears.

## 6. What success looks like (serial monitor)

```
=== Smart Room ESP32 node ===
firmware v0.3.0 — by Jishworks - Jishnu Dutta - jishworks.in
node: esp32_room_01   backend: 203.0.113.10:9000
[register] ok
[devices] map refreshed: N device(s)
```

A `[register] failed (HTTP 404)` means the wrong `BACKEND_HOST`/port or no
backend reachable; failures that keep repeating usually mean the network
blocks outbound traffic — switch to a phone hotspot. If you see
`[standalone] backend unreachable`, the node is still working — it's just
running the model directly.
