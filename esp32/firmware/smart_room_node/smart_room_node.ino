/*
 * Smart Room — ESP32 hardware node  (v0.2.0)
 * ==========================================
 * This sketch is a *hardware node*, not an API server. It:
 *
 *   1. connects to Wi-Fi,
 *   2. registers its node with the FastAPI backend
 *      (POST /api/esp32/register),
 *   3. FETCHES the devices it drives from the backend
 *      (GET /api/esp32/<node_id>/devices) — nothing is hard-coded here.
 *      Devices are added from the dashboard with a name, type, and GPIO pin;
 *      this node just executes what the backend tells it to own,
 *   4. reports every device's state every few seconds
 *      (POST /api/esp32/report),
 *   5. polls for pending commands and executes them
 *      (GET /api/esp32/<node_id>/commands).
 *
 * The dashboard never talks to this device directly. Everything flows
 * through the backend, which owns the registry, the database, the
 * WebSocket feed, and the Smart Mode automation engine.
 *
 * v0.2 adds:
 *   - CLIMATE: "sensor" devices are read (DHT11 / DHT22) and reported as
 *     temperature + humidity — the dashboard's sensor card comes alive.
 *   - MOTION: "motion" devices are read as digital inputs and reported.
 *   - SAFER PINS: sensor/motion pins are inputs, never outputs.
 *   - SERIAL CONSOLE: type `help` in the monitor — status, devices, reboot.
 *   - BETTER DIAGNOSTICS: registration failures print the backend's reply,
 *     and register retries back off while the backend is down.
 *
 * v0.3 adds STANDALONE MODE: if no backend answers within
 * FALLBACK_AFTER_MS, the node switches to the built-in device map in
 * config.h and drives the model directly — `on <id>` / `off <id>` from the
 * serial console. No backend required. It keeps re-registering quietly and
 * switches back the moment a backend appears.
 *
 * Edit config.h for Wi-Fi, backend address, node id, and the sensor model.
 *
 * Libraries (Arduino Library Manager, or see platformio.ini):
 *   - ArduinoJson          https://github.com/bblanchon/ArduinoJson
 *   - DHT sensor library   https://github.com/adafruit/DHT-sensor-library
 *   - Adafruit Unified Sensor
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <math.h>

#include "config.h"

// ---------------------------------------------------------------------------
// Device map — data-driven. Fetched from the backend; NOT hard-coded.
// ---------------------------------------------------------------------------

struct NodeDevice {
  String id;
  String type;
  uint8_t pin;
  bool power = false;   // last commanded state, preserved across map refreshes

  // sensor / motion readings (filled by readSensors, reported as `data`)
  bool hasRead = false; // true once at least one valid reading exists
  float temperature = NAN;
  float humidity = NAN;
  bool motion = false;
};

NodeDevice g_devices[MAX_DEVICES];
size_t g_numDevices = 0;

// True while running on the built-in device map (no backend reachable).
static bool g_standalone = false;
static unsigned long g_bootMs = 0;

static WiFiClient g_wifiClient;
static WiFiClientSecure g_wifiClientSecure;
static bool g_secureInited = false;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

static String backendUrl(const String& path) {
  String host = String(BACKEND_HOST);
  if (host.startsWith("http://") || host.startsWith("https://")) {
    return host + path;
  }
  if (host.length() > 0 && isDigit(host.charAt(0))) {
    return "http://" + host + path;
  }
  return "https://" + host + path;
}

static void setupHttpClient(HTTPClient& http, const String& url) {
  if (url.startsWith("https://")) {
    if (!g_secureInited) {
      g_wifiClientSecure.setInsecure();
      g_secureInited = true;
    }
    http.begin(g_wifiClientSecure, url);
  } else {
    http.begin(g_wifiClient, url);
  }
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  http.setTimeout(5000);
  http.setConnectTimeout(5000);
}

static NodeDevice* findDevice(const char* id) {
  for (size_t i = 0; i < g_numDevices; i++) {
    if (g_devices[i].id == id) return &g_devices[i];
  }
  return nullptr;
}

static void setPower(NodeDevice* d, bool on) {
  d->power = on;
  digitalWrite(d->pin, on ? HIGH : LOW);
}

// ---------------------------------------------------------------------------
// Liveness tracking. ESP32 Wi-Fi can go stale (status still says CONNECTED
// while nothing gets through), so we watch real request results and heal:
//   - 5 consecutive failures  -> cycle the Wi-Fi stack and re-register
//   - no backend for HARD_RESTART_AFTER_MS -> hard restart
// ---------------------------------------------------------------------------

static unsigned long g_lastSuccess = 0;
static int g_failStreak = 0;

static void noteNetworkResult(bool alive) {
  if (alive) {
    g_lastSuccess = millis();
    if (g_failStreak >= 3) Serial.println("[net] backend reachable again");
    g_failStreak = 0;
  } else {
    g_failStreak++;
    if (g_failStreak == 1 || g_failStreak == 5) {
      Serial.printf("[net] backend unreachable (%d consecutive)\n", g_failStreak);
    }
  }
}

static void ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("[wifi] connecting to \"%s\"", WIFI_SSID);
  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000UL) {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf(" connected, IP %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println(" failed — will retry from loop()");
  }
}

// ---------------------------------------------------------------------------
// Backend calls
// ---------------------------------------------------------------------------

// POST /api/esp32/register — announce this node. The device list is NOT sent
// here: the backend owns the registry (devices are added from the dashboard),
// and this node fetches its pin map separately. Registration is a liveness
// handshake so the backend knows which node is on the network.
//
// On failure the backend's reply is printed — a 404 usually means the wrong
// port (another app on it), a wrong BACKEND_HOST, or the backend not running.
static bool registerWithBackend() {
  HTTPClient http;
  String url = backendUrl("/api/esp32/register");
  setupHttpClient(http, url);
  http.addHeader("Content-Type", "application/json");

  JsonDocument doc;
  doc["node_id"] = NODE_ID;
  doc["devices"].to<JsonArray>();  // intentionally empty — see above

  String payload;
  serializeJson(doc, payload);

  int code = http.POST(payload);
  String body = http.getString();  // may be empty on connection failure
  http.end();

  if (code == 200) {
    Serial.println("[register] ok");
    return true;
  }
  body.trim();
  Serial.printf("[register] failed (HTTP %d)%s%s\n", code,
                body.length() ? ": " : "", body.c_str());
  return false;
}

// GET /api/esp32/<node_id>/devices — the pin map this node drives. Rebuilds
// the local map, preserving each device's last commanded state, and (re)applies
// the pins so a newly-added device is driven as soon as it's known.
// Sensor/motion pins are inputs — they are never driven as outputs.
static bool fetchDevices() {
  HTTPClient http;
  String url = backendUrl(String("/api/esp32/") + NODE_ID + "/devices");
  setupHttpClient(http, url);

  int code = http.GET();
  noteNetworkResult(code >= 0);
  if (code != 200) {
    http.end();
    Serial.printf("[devices] fetch failed (HTTP %d)\n", code);
    return false;
  }
  String body = http.getString();
  http.end();

  JsonDocument doc;
  if (deserializeJson(doc, body)) {
    Serial.println("[devices] could not parse device map");
    return false;
  }

  size_t n = 0;
  for (JsonObject d : doc["devices"].as<JsonArray>()) {
    if (n >= MAX_DEVICES) break;
    const char* id = d["id"] | "";
    int pin = d["pin"] | -1;
    if (!id[0] || pin < 0 || pin > 48) continue;

    bool prevPower = false;
    for (size_t i = 0; i < g_numDevices; i++) {
      if (g_devices[i].id == id) {
        prevPower = g_devices[i].power;
        break;
      }
    }

    g_devices[n].id = id;
    g_devices[n].type = d["type"] | "light";
    g_devices[n].pin = (uint8_t)pin;
    g_devices[n].power = prevPower;
    n++;
  }

  bool changed = (n != g_numDevices);
  g_numDevices = n;

  for (size_t i = 0; i < g_numDevices; i++) {
    NodeDevice& dev = g_devices[i];
    if (dev.type == "sensor" || dev.type == "motion") {
      // Inputs only. (DHT.begin() re-applies the mode for sensor pins.)
      pinMode(dev.pin, dev.type == "motion" ? INPUT_PULLDOWN : INPUT);
    } else {
      pinMode(dev.pin, OUTPUT);
      digitalWrite(dev.pin, dev.power ? HIGH : LOW);
    }
  }

  if (changed) {
    Serial.printf("[devices] map refreshed: %u device(s)\n", g_numDevices);
    for (size_t i = 0; i < g_numDevices; i++) {
      Serial.printf("  - %s (%s) gpio %u %s\n",
                    g_devices[i].id.c_str(), g_devices[i].type.c_str(),
                    g_devices[i].pin, g_devices[i].power ? "ON" : "OFF");
    }
  }
  return true;
}

// POST /api/esp32/report — heartbeat: the current state of every device.
//   power devices -> state {power}
//   sensor        -> data {temperature, humidity}   (once a valid read exists)
//   motion        -> data {motion}
static bool reportState() {
  HTTPClient http;
  String url = backendUrl("/api/esp32/report");
  setupHttpClient(http, url);
  http.addHeader("Content-Type", "application/json");

  JsonDocument doc;
  doc["node_id"] = NODE_ID;

  JsonArray devs = doc["devices"].to<JsonArray>();
  for (size_t i = 0; i < g_numDevices; i++) {
    NodeDevice& dev = g_devices[i];
    JsonObject d = devs.add<JsonObject>();
    d["id"] = dev.id;

    if (dev.type == "sensor") {
      if (dev.hasRead) {
        JsonObject data = d["data"].to<JsonObject>();
        if (!isnan(dev.temperature)) data["temperature"] = dev.temperature;
        if (!isnan(dev.humidity)) data["humidity"] = dev.humidity;
      }
    } else if (dev.type == "motion") {
      JsonObject data = d["data"].to<JsonObject>();
      data["motion"] = dev.motion;
    } else {
      d["state"]["power"] = dev.power;
    }
  }

  String payload;
  serializeJson(doc, payload);

  int code = http.POST(payload);
  http.end();
  noteNetworkResult(code >= 0);
  if (code != 200) {
    Serial.printf("[report] failed (HTTP %d)\n", code);
  }
  return code == 200;
}

// GET /api/esp32/<node_id>/commands — execute anything the backend queued.
// Returns true if a device changed (so the caller can report right away and
// the dashboard updates quickly).
static bool pollAndExecuteCommands() {
  HTTPClient http;
  String url = backendUrl(String("/api/esp32/") + NODE_ID + "/commands");
  setupHttpClient(http, url);

  int code = http.GET();
  noteNetworkResult(code >= 0);
  if (code != 200) {
    http.end();
    return false;
  }
  String body = http.getString();
  http.end();

  JsonDocument doc;
  if (deserializeJson(doc, body)) {
    Serial.println("[poll] could not parse command response");
    return false;
  }

  bool changed = false;
  for (JsonObject cmd : doc["commands"].as<JsonArray>()) {
    const char* deviceId = cmd["deviceId"] | "";
    const char* command = cmd["command"] | "";

    if (strcmp(command, "power") != 0) {
      Serial.printf("[cmd] %s: unsupported command \"%s\"\n", deviceId, command);
      continue;
    }
    NodeDevice* d = findDevice(deviceId);
    if (d == nullptr) {
      // Not in the map yet — a dashboard-added device arrives on the next
      // device refresh (up to ~10 s away).
      Serial.printf("[cmd] %s: not in local map yet (refresh pending)\n", deviceId);
      continue;
    }
    bool value = cmd["value"].as<bool>();
    setPower(d, value);
    changed = true;
    Serial.printf("[cmd] %s power -> %s\n", deviceId, value ? "ON" : "OFF");
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Sensing — DHT climate + PIR motion, driven by the backend device map.
// ---------------------------------------------------------------------------

// Reads every sensor/motion device the backend has assigned. Constructing a
// fresh DHT per read is deliberate: the node is stateless, reads are capped
// by SENSOR_READ_MS, and there is no heap to manage.
static void readSensors() {
  static unsigned long lastHint = 0;

  for (size_t i = 0; i < g_numDevices; i++) {
    NodeDevice& dev = g_devices[i];

    if (dev.type == "sensor") {
      DHT dht(dev.pin, DHT_MODEL, 3);   // count=3: fail fast on a bare pin
      dht.begin();
      float t = dht.readTemperature();
      float h = dht.readHumidity();
      if (!isnan(t)) { dev.temperature = t; dev.hasRead = true; }
      if (!isnan(h)) { dev.humidity = h; dev.hasRead = true; }
      if (isnan(t) && isnan(h) && !dev.hasRead &&
          millis() - lastHint > 60000UL) {
        lastHint = millis();
        Serial.printf("[sensor] %s: no reading on GPIO %u — check wiring / pull-up\n",
                      dev.id.c_str(), dev.pin);
      }
    } else if (dev.type == "motion") {
      dev.motion = (digitalRead(dev.pin) == HIGH);
    }
  }
}

// ---------------------------------------------------------------------------
// Standalone fallback — runs the model with just the ESP32 when the backend
// is unreachable. The built-in device map lives in config.h.
// ---------------------------------------------------------------------------

static void enableStandalone() {
  g_standalone = true;
  g_numDevices = 0;
  for (size_t i = 0; i < FALLBACK_DEVICE_COUNT && i < MAX_DEVICES; i++) {
    g_devices[i].id = FALLBACK_DEVICES[i].id;
    g_devices[i].type = FALLBACK_DEVICES[i].type;
    g_devices[i].pin = FALLBACK_DEVICES[i].pin;
    g_devices[i].power = false;
    g_numDevices++;
  }
  for (size_t i = 0; i < g_numDevices; i++) {
    NodeDevice& dev = g_devices[i];
    if (dev.type == "sensor" || dev.type == "motion") {
      pinMode(dev.pin, INPUT);
    } else {
      pinMode(dev.pin, OUTPUT);
      digitalWrite(dev.pin, LOW);
    }
  }
  Serial.println("[standalone] backend unreachable — built-in device map active");
  Serial.println("[standalone] drive it with `on <id>` / `off <id>` (type help)");
  for (size_t i = 0; i < g_numDevices; i++) {
    Serial.printf("  - %s (%s) gpio %u\n",
                  g_devices[i].id.c_str(), g_devices[i].type.c_str(),
                  g_devices[i].pin);
  }
}

// ---------------------------------------------------------------------------
// Serial console — diagnostics without a reflash.
//   help / status / devices / on <id> / off <id> / reboot
// ---------------------------------------------------------------------------

static void printStatus() {
  Serial.printf("node:      %s\n", NODE_ID);
  Serial.printf("firmware:  v%s %s\n", FIRMWARE_VERSION, FIRMWARE_BY);
  Serial.printf("mode:      %s\n", g_standalone ? "standalone (no backend)" : "backend");
  Serial.printf("backend:   %s\n", BACKEND_HOST);
  Serial.printf("wifi:      %s (rssi %d dBm)\n",
                WiFi.status() == WL_CONNECTED ? "connected" : "disconnected",
                WiFi.RSSI());
  Serial.printf("heap:      %u bytes free\n", ESP.getFreeHeap());
  Serial.printf("uptime:    %lus\n", millis() / 1000);
  Serial.printf("devices:   %u  failStreak: %d\n", g_numDevices, g_failStreak);
}

static void handleSerial() {
  static String line;
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n') {
      line.trim();
      if (line.length()) {
        Serial.printf("> %s\n", line.c_str());
        if (line == "help") {
          Serial.println("commands: help | status | devices | on <id> | off <id> | reboot");
        } else if (line == "status") {
          printStatus();
        } else if (line == "devices") {
          Serial.printf("device map (%u):\n", g_numDevices);
          for (size_t i = 0; i < g_numDevices; i++) {
            NodeDevice& d = g_devices[i];
            Serial.printf("  %s (%s) gpio %u", d.id.c_str(), d.type.c_str(), d.pin);
            if (d.type == "sensor" && d.hasRead) {
              if (!isnan(d.temperature)) Serial.printf("  %.1f C", d.temperature);
              if (!isnan(d.humidity)) Serial.printf("  / %.0f %%rh", d.humidity);
            } else if (d.type == "motion") {
              Serial.printf("  motion %s", d.motion ? "DETECTED" : "clear");
            } else {
              Serial.printf("  power %s", d.power ? "ON" : "OFF");
            }
            Serial.println();
          }
        } else if (line.startsWith("on ") || line.startsWith("off ")) {
          // Standalone driving: turn a model device on/off from the console.
          String id = line.substring(3);
          id.trim();
          if (!id.length()) {
            Serial.println("usage: on <device id> | off <device id>");
          } else if (!g_standalone) {
            Serial.println("backend mode — control devices from the dashboard");
          } else {
            NodeDevice* d = findDevice(id.c_str());
            if (d == nullptr) {
              Serial.println("unknown device — type devices");
            } else if (d->type == "sensor" || d->type == "motion") {
              Serial.println("that device is an input — it can't be driven");
            } else {
              bool on = line.startsWith("on ");
              setPower(d, on);
              Serial.printf("[standalone] %s power -> %s\n",
                            d->id.c_str(), on ? "ON" : "OFF");
            }
          }
        } else if (line == "reboot") {
          Serial.println("rebooting…");
          delay(100);
          ESP.restart();
        } else {
          Serial.println("unknown command — type help");
        }
      }
      line = "";
    } else if (c != '\r' && line.length() < 80) {
      line += c;
    }
  }
}

// ---------------------------------------------------------------------------
// Setup / loop
// ---------------------------------------------------------------------------

void setup() {
  Serial.begin(115200);
  delay(300);

  Serial.println();
  Serial.println("=== Smart Room ESP32 node ===");
  Serial.printf("firmware v%s — %s\n", FIRMWARE_VERSION, FIRMWARE_BY);
  Serial.printf("node: %s   backend: %s\n", NODE_ID, BACKEND_HOST);
  Serial.printf("sensor model: DHT%d (edit config.h to switch)\n", DHT_MODEL == DHT11 ? 11 : 22);
  Serial.println("devices: fetched from backend (not hard-coded)");
  if (FALLBACK_AFTER_MS > 0) {
    Serial.printf("fallback: standalone device map after %lus (works without Wi-Fi)\n",
                  FALLBACK_AFTER_MS / 1000);
  }
  Serial.println("serial console: type help for commands");
  g_bootMs = millis();

  ensureWiFi();
  // Registration and the device map are fetched from loop(), so a briefly
  // down backend doesn't stall boot.
}

void loop() {
  static bool registered = false;
  static unsigned long registerRetryMs = REGISTER_RETRY_MS;
  static unsigned long lastWifi = 0;
  static unsigned long lastRegister = 0;
  static unsigned long lastReport = 0;
  static unsigned long lastPoll = 0;
  static unsigned long lastDevices = 0;
  static unsigned long lastSensors = 0;
  static unsigned long lastStatus = 0;

  handleSerial();

  // Hard watchdog: we had contact once but lost it for too long — restart.
  if (g_lastSuccess != 0 && millis() - g_lastSuccess > HARD_RESTART_AFTER_MS) {
    Serial.printf("[watchdog] no backend contact for %lus — restarting\n",
                  HARD_RESTART_AFTER_MS / 1000);
    delay(200);
    ESP.restart();
  }

  if (WiFi.status() != WL_CONNECTED) {
    // No Wi-Fi at all: fall back to standalone anyway, so the model runs
    // with just the ESP32 (school demo / bench). It keeps trying to join
    // the network in the background and upgrades when it can.
    if (!g_standalone && FALLBACK_AFTER_MS > 0 &&
        millis() - g_bootMs >= FALLBACK_AFTER_MS) {
      enableStandalone();
    }
    if (millis() - lastWifi >= WIFI_RETRY_MS) {
      lastWifi = millis();
      ensureWiFi();
    }
    if (g_standalone) {
      if (millis() - lastSensors >= SENSOR_READ_MS) {
        lastSensors = millis();
        readSensors();
      }
    }
    return;
  }

  // The backend stopped answering while Wi-Fi claims to be fine: the stack
  // has gone stale — cycle it and re-register.
  if (g_failStreak >= 5) {
    Serial.println("[wifi] backend unreachable — cycling Wi-Fi stack");
    WiFi.disconnect(true);
    WiFi.reconnect();
    g_failStreak = 0;
    registered = false;
    registerRetryMs = REGISTER_RETRY_MS;
    return;
  }

  if (!registered) {
    // Register retries back off (10 s -> 30 s) so a down backend doesn't
    // hammer the network; any success resets the cadence. If the backend
    // never answers, switch to the standalone built-in device map so the
    // model still works with just the ESP32 (see config.h).
    if (!g_standalone && FALLBACK_AFTER_MS > 0 &&
        millis() - g_bootMs >= FALLBACK_AFTER_MS) {
      enableStandalone();
    }
    if (millis() - lastRegister >= registerRetryMs) {
      lastRegister = millis();
      registered = registerWithBackend();
      if (registered) {
        registerRetryMs = REGISTER_RETRY_MS;
        if (g_standalone) {
          Serial.println("[net] backend reachable — leaving standalone mode");
          g_standalone = false;
        }
        lastDevices = 0;   // fetch the real device map right away
      } else {
        // Slower, quieter retries once standalone — no point hammering a
        // network that isn't answering, and no false Wi-Fi cycling.
        const unsigned long cap = g_standalone ? 60000UL : REGISTER_RETRY_MAX_MS;
        registerRetryMs = min(registerRetryMs * 2, cap);
      }
    }
    if (!g_standalone) return;
    // Standalone: keep sampling the model's sensors while waiting.
    if (millis() - lastSensors >= SENSOR_READ_MS) {
      lastSensors = millis();
      readSensors();
    }
    return;
  }

  // Keep the device map fresh so devices added from the dashboard are picked
  // up without a reboot.
  if (millis() - lastDevices >= DEVICE_REFRESH_MS) {
    lastDevices = millis();
    fetchDevices();
  }

  bool executed = false;
  if (millis() - lastPoll >= POLL_INTERVAL_MS) {
    lastPoll = millis();
    executed = pollAndExecuteCommands();
  }

  // Sample climate + motion sensors (inputs never block the command loop for
  // more than a few tens of ms).
  if (millis() - lastSensors >= SENSOR_READ_MS) {
    lastSensors = millis();
    readSensors();
  }

  // Report on schedule, or right after executing a command so the dashboard
  // reflects the new state without waiting for the next tick.
  if (executed || millis() - lastReport >= REPORT_INTERVAL_MS) {
    lastReport = millis();
    reportState();
  }

  // Periodic health line, so a future failure is diagnosable from serial.
  if (millis() - lastStatus >= 30000UL) {
    lastStatus = millis();
    Serial.printf("[status] rssi=%d dBm heap=%u failStreak=%d uptime=%lus devices=%u\n",
                  WiFi.RSSI(), ESP.getFreeHeap(), g_failStreak, millis() / 1000,
                  g_numDevices);
  }
}
