// Smart Room ESP32 node — config.h
// =================================
// Everything you might need to edit, in one place. The sketch never
// hard-codes a device table — devices are fetched from the backend — but it
// does need to know your Wi-Fi, your backend, and this node's identity.

#pragma once

// ---------------------------------------------------------------------------
// Branding (shown in the boot banner and serial output)
// ---------------------------------------------------------------------------

#define FIRMWARE_VERSION "0.2.0"
#define FIRMWARE_BY "by Jishworks - Jishnu Dutta - jishworks.in"

// ---------------------------------------------------------------------------
// 1. EDIT THESE
// ---------------------------------------------------------------------------
// NOTE: this file is committed to the repo — keep it publishable. Never put
// real credentials here; paste your own values locally and leave the
// placeholders in the committed version.

const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// The machine running backend/run.py, by LAN address. "localhost" will NOT
// work — the ESP32 is a different computer. This is the address `ipconfig`
// shows on the machine that runs the backend. Run the backend with
// BACKEND_HOST=0.0.0.0 so it listens on the network (see ../README.md).
const char* BACKEND_HOST = "192.168.1.50";   // LAN IP of the backend machine
const uint16_t BACKEND_PORT = 8000;

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
