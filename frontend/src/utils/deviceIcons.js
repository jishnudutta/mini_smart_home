import {
  Fan,
  Lightbulb,
  Thermometer,
  Droplets,
  PersonStanding,
  Palette,
  Plug,
  Cpu,
} from 'lucide-react'

// The ESP32 never tells us how to draw anything — the frontend owns
// every icon, keyed by the device type (or sensor type) it reports.
export const deviceIcons = {
  fan: Fan,
  light: Lightbulb,
  sensor: Thermometer,
  temperature: Thermometer,
  humidity: Droplets,
  motion: PersonStanding,
  rgb: Palette,
  switch: Plug,
}

export const fallbackIcon = Cpu

// Unknown types fall back to a generic device glyph instead of crashing.
export function iconForDevice(device) {
  return deviceIcons[device?.type] || deviceIcons[device?.sensorType] || fallbackIcon
}
