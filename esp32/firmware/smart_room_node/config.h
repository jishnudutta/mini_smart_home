// Smart Room ESP32 node — config.h
// =================================
// Everything you might need to edit, in one place. The sketch never
// hard-codes a device table — devices are fetched from the backend — but it
// does need to know your Wi-Fi, your backend, and this node's identity.

#pragma once

// ---------------------------------------------------------------------------
// Branding (shown in the boot banner and serial output)
// ---------------------------------------------------------------------------

#define FIRMWARE_VERSION "0.3.0"
#define FIRMWARE_BY "by Jishworks - Jishnu Dutta - jishworks.in"

// ---------------------------------------------------------------------------
// 1. EDIT THESE
// ---------------------------------------------------------------------------
// NOTE: this file is committed to the repo — keep it publishable. Never put
// real credentials here; paste your own values locally and leave the
// placeholders in the committed version.

const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// Where the backend lives — the ESP32 must be able to reach it over the
// network, and "localhost" will NOT work (the ESP32 is a different
// computer). No "http://" — the firmware adds the scheme itself.
const char* BACKEND_HOST = "api.smartroom.jishworks.in";

// Must match the node the backend expects (NODE_ID in backend/.env.example).
const char* NODE_ID = "esp32_room_01";

// ---------------------------------------------------------------------------
// 2. Climate sensor model
// ---------------------------------------------------------------------------

// DHT11 or DHT22 — whichever sensor you wired to the sensor device's pin.
// The firmware reads whatever the backend's device map calls a "sensor"
// (sensorType "temperature_humidity"), so swapping DHT11 -> DHT22 is a
// one-line change here, not a code change.
#define DHT_MODEL DHT11

// ---------------------------------------------------------------------------
// 3. Timing (ms)
// ---------------------------------------------------------------------------

const unsigned long REPORT_INTERVAL_MS = 5000;   // heartbeat + state report
const unsigned long POLL_INTERVAL_MS = 500;      // command poll — devices react
                                                 // within ~0.5 s of a click
const unsigned long DEVICE_REFRESH_MS = 10000;   // re-fetch the device/pin map,
                                                 // so dashboard-added devices
                                                 // appear within ~10 s
const unsigned long REGISTER_RETRY_MS = 10000;   // base register retry
const unsigned long REGISTER_RETRY_MAX_MS = 30000; // caps backoff while the
                                                 // backend is down
const unsigned long WIFI_RETRY_MS = 10000;       // retry Wi-Fi from loop()
const unsigned long SENSOR_READ_MS = 5000;       // DHT / motion sampling
const unsigned long HARD_RESTART_AFTER_MS = 120000; // no backend contact -> reboot

// How many devices the node may drive at once (backend device-map cap too).
#define MAX_DEVICES 16

// ---------------------------------------------------------------------------
// 4. Standalone fallback (no backend — school demo / bench testing)
// ---------------------------------------------------------------------------

// The node normally fetches its device map from the backend. If the backend
// can't be reached within this long after boot, the node switches to the
// built-in table below and drives the model directly — toggle devices from
// the serial console with `on <id>` / `off <id>` (type help). Set to 0 to
// disable the fallback and always wait for the backend.
const unsigned long FALLBACK_AFTER_MS = 30000;

struct FallbackDevice {
  const char* id;
  const char* type;
  uint8_t pin;
};

// Built-in demo map — mirrors the reference wiring (see esp32/README.md).
// Edit the pins to match YOUR model's wiring. Sensor/motion entries are read
// (not driven); everything else is driven as an output.
const FallbackDevice FALLBACK_DEVICES[] = {
  {"light_01",    "light",  2},   // onboard blue LED
  {"room_light",  "light", 16},
  {"corner_lamp", "light", 17},
  {"fan_01",      "fan",   26},
  {"dht11_01",    "sensor", 4},
};
const size_t FALLBACK_DEVICE_COUNT = sizeof(FALLBACK_DEVICES) / sizeof(FallbackDevice);
