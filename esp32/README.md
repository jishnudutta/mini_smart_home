# Smart Room — ESP32 hardware node (Phase 4)

The firmware in `firmware/smart_room_node/` turns an ESP32 into the room's
hardware node. It is deliberately small and **fully data-driven**: it
connects to Wi-Fi, registers with the FastAPI backend, **fetches the list of
devices it drives (id → type → GPIO pin) from the backend**, reports each
device's state, and polls for commands. **All intelligence lives in the
backend** (`../backend`) — the registry, the database, the WebSocket feed,
and Smart Mode automation. The dashboard never talks to this device
directly, and the firmware contains no hard-coded device table: you add a
device from the dashboard (name + type + pin) and the node picks it up on
its next refresh (~10 s), no reflash needed.

## Wiring

Pins are **not** configured in the sketch — they're assigned in the
dashboard when you add a device. Wire the hardware to the GPIO you name
there. A sensible layout for the classic ESP32 Dev Module:

| Component        | ESP32 pin | Notes                                                        |
| ---------------- | --------- | ------------------------------------------------------------ |
| Built-in LED     | GPIO2     | The board's blue LED — the minimal bring-up device (`light_01`). |
| DHT11 data       | GPIO4     | Pull data up with 4.7–10 kΩ to 3V3 (most modules have this) |
| Fan gate         | GPIO26    | Drive through an NPN/MOSFET (or relay) + flyback diode. A fan pulls more current than a GPIO can source, and the motor needs a diode across it. **Never connect the fan directly to a GPIO.** |
| Room light LED   | GPIO16    | Through a 220 Ω–1 kΩ series resistor to GND                  |
| Corner lamp LED  | GPIO17    | Through a 220 Ω–1 kΩ series resistor to GND                  |

```
DHT11              ESP32 (30-pin DevKit)
  VCC ───────────────── 3V3
  GND ───────────────── GND
  DATA ──[4.7k]──3V3 ── GPIO4
        └────────────── GPIO4

Fan (mini DC)      driver
  + ──[5V]
  − ── collector of NPN (base ← GPIO26 via 1k)  + flyback diode across motor
Room light LED ──[resistor]── GPIO16 ── GND
Corner lamp LED ──[resistor]── GPIO17 ── GND
```

To add a device: open the dashboard → **Add device** → name, type, GPIO pin.
The backend generates the id (e.g. `fan_01`), and the node's next device-map
refresh makes it live. To rewire, remove the device and add it again with
the new pin.

## Setup

**Arduino IDE (2.x)**
1. Install the ESP32 board package (Boards Manager → search `esp32` by
   Espressif). Select your board under *Tools → Board*.
2. Install libraries (Library Manager): **ArduinoJson**, **DHT sensor
   library**, **Adafruit Unified Sensor**.
3. Open `firmware/smart_room_node/smart_room_node.ino`, edit the config
   block at the top, select the right port, and upload.

**PlatformIO** (alternative)

```bash
cd esp32/firmware/smart_room_node
pio run --target upload
pio device monitor -b 115200
```

**arduino-cli** (command line, verified on this machine)

The IDE ships a bundled `arduino-cli` at
`C:\Program Files\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe`.
This repo includes a compile-time config that points the sketchbook at an
isolated, gitignored folder (`firmware/build/`), which sidesteps OneDrive
issues and lets the build be reproduced:

```bash
CLI="/c/Program Files/Arduino IDE/resources/app/lib/backend/resources/arduino-cli.exe"
CFG="E:/<your-path>/esp32/firmware/build/arduino-cli.yaml"

# once, to install libraries into the isolated sketchbook:
"$CLI" --config-file "$CFG" lib install ArduinoJson "DHT sensor library" "Adafruit Unified Sensor"

# then compile (or add --upload --port COMx to flash):
"$CLI" --config-file "$CFG" compile --fqbn esp32:esp32:esp32 firmware/smart_room_node
```

Verified build result: **80% flash / 15% RAM** on `esp32:esp32` core 3.3.8.

## Config to edit before flashing

Everything lives in **`config.h`** next to the sketch:

```cpp
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
const char* BACKEND_HOST = "192.168.1.50";   // LAN IP of the backend machine
const uint16_t BACKEND_PORT = 8000;
const char* NODE_ID = "esp32_room_01";
#define DHT_MODEL DHT11    // DHT11 or DHT22 — the wired climate sensor
```

- **`BACKEND_HOST` must be the backend machine's LAN address**, not
  `localhost` — the ESP32 is a separate computer and can't see the host's
  loopback interface. Find it with `ipconfig` (Windows) or `ip addr`.
- The backend must **listen on the network**, not just loopback. Start it
  with:

  ```bash
  cd backend
  BACKEND_HOST=0.0.0.0 .venv/Scripts/python run.py
  ```

  (On Windows, allow Python through the firewall when prompted.)
- `NODE_ID` must match `NODE_ID` in `backend/.env.example` if you override
  it there.

## How it talks to the backend

| Direction | Endpoint | When |
| --- | --- | --- |
| Node → backend | `POST /api/esp32/register` | at boot, retried every 10 s until accepted |
| Node → backend | `GET /api/esp32/{node_id}/devices` | every 10 s — the device/pin map; picks up dashboard-added devices without a reflash |
| Node → backend | `POST /api/esp32/report` | every 5 s (heartbeat + state), and immediately after executing a command |
| Node → backend | `GET /api/esp32/{node_id}/commands` | every 0.5 s — drains anything the dashboard or automation queued (devices react within ~0.5 s) |

The report doubles as the heartbeat: the backend's watchdog marks the
node's devices offline if it goes quiet for ~60 s (`NODE_TIMEOUT_SECONDS`).

**v0.2 senses the room too:** every `sensor` device in the map is read from
its pin as a DHT11/DHT22 and reported as `data.temperature` + `data.humidity`
(the dashboard's sensor card), and every `motion` device is read as a digital
input and reported as `data.motion`. Sensor/motion pins are configured as
inputs — the node never drives them. Registration failures now print the
backend's reply (a `404` usually means the wrong port or a missing backend),
and register retries back off from 10 s to 30 s while the backend is down.

The firmware is self-healing so the node stays on: if the backend stops
answering it cycles the Wi-Fi stack, and if there is no contact for 120 s it
restarts itself. A `[status] rssi=… heap=…` line is printed every 30 s so a
future failure is diagnosable from the serial monitor.

## Serial console

Open the monitor (`pio device monitor -b 115200` or the IDE's Serial
Monitor) and type commands — no reflash needed:

```
help      # this list
status    # node, backend, Wi-Fi RSSI, heap, uptime, fail streak
devices   # the live device map, including current sensor / motion readings
reboot    # restart the node
```

## Verify it end to end

With the node running, the backend should show it live:

```bash
curl http://localhost:8000/api/status          # online: true once it registers
curl http://localhost:8000/api/devices         # fan/light/lamp/sensor, online: true
```

Then control it the same way the dashboard does — the device ids are the
ones you added (check `curl http://localhost:8000/api/devices`):

```bash
curl -X POST http://localhost:8000/api/devices/light_01/command \
     -H "Content-Type: application/json" \
     -d '{"command":"power","value":true}'
```

Within a poll cycle the LED should light, and the serial monitor should log
`[cmd] light_01 power -> ON`. Add another device in the dashboard and it
appears in the node's log as `[devices] map refreshed` within ~10 s.

## Going live

The backend is **dynamic by default** — the registry starts empty and only
devices added from the dashboard appear. The virtual simulator is off unless
`SIMULATOR_ENABLED=true`; leave it off so real hardware is the only thing
in the room.

## Troubleshooting

- **`[register] failed` forever** — is the backend running with
  `BACKEND_HOST=0.0.0.0`? Can the ESP32 reach it? (Point a browser at
  `http://<BACKEND_HOST>:8000/docs` from another device on the same Wi-Fi.)
- **Serial monitor shows garbage** — baud rate must be `115200`.
- **`[dht] read failed`** — check wiring, the pull-up resistor, and that the
  sensor is powered from 3V3. Reads happen once per 5 s, well within the
  DHT11's 1 s minimum spacing.
- **Dashboard says offline** — the node stopped reporting (check serial
  logs), the wrong `NODE_ID` is in the sketch, or `NODE_TIMEOUT_SECONDS`
  elapsed during a disconnect.
- **Commands don't execute** — is the node registered? Try the poll
  endpoint directly: `curl http://<BACKEND_HOST>:8000/api/esp32/esp32_room_01/commands`
  after sending a dashboard command; it should return the queued command.
  If the serial log says `not in local map yet`, the node hasn't fetched its
  device map since you added the device — wait for the next 10 s refresh.
- **A device I added never shows up** — it was added to the backend, but the
  node only drives what it fetched. Give it up to 10 s (or reflash) and
  check the `[devices] map refreshed` log line.
- **Fan LED works but motor doesn't turn** — check the transistor wiring and
  flyback diode; a GPIO alone can't drive a motor.
- **`Permission denied` reading library files / libraries silently skipped**
  — the sketchbook lives in OneDrive (`Documents\Arduino`) and its library
  files are cloud placeholders that OneDrive hasn't downloaded (the `O`
  attribute shows in `attrib`). Either start OneDrive to hydrate them, or
  move the sketchbook out of OneDrive (Arduino IDE → File → Preferences →
  *Sketchbook location*, e.g. `C:\Users\<you>\Arduino`) and reinstall the
  libraries. The bundled `DHT_sensor_library` folder also contains stray
  `DHT - Copy.cpp` files that will break the IDE build — delete the
  `* - Copy.*` files or reinstall the library cleanly in the new sketchbook.
