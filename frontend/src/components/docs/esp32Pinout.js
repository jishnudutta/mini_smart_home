// The classic 30-pin ESP32 Dev Module (DOIT DevKit V1 layout) — the board
// the firmware targets. The GPIO numbers are what the firmware drives; the
// silkscreen labels vary slightly between vendors.
//
// Special pins:
//   - 34 / 35 / 36 (VP) / 39 (VN): input-only ADC pins, no output capability
//   - 0 / 2 / 5 / 12 / 15: strapping pins — read at boot to pick the boot
//     mode; holding them high/low can stop the board booting. Avoid unless
//     you know what you're doing. GPIO2 also drives the onboard blue LED.
//   - 1 (TX) / 3 (RX): the USB serial port — fine as GPIO only if you never
//     read the serial monitor.
//   - 0 / 2 are not broken out on the 30-pin header (GPIO2 is the onboard
//     LED).

export const BOARD = {
  name: 'ESP32 Dev Module · 30-pin',
  // Not on the header, but driveable and part of the reference build.
  onboard: { label: 'LED', gpio: 2, note: 'onboard blue LED (not on the header)' },
  cols: {
    left: [
      { label: 'EN', gpio: null, note: 'reset' },
      { label: 'VP', gpio: 36, note: 'ADC input only' },
      { label: 'VN', gpio: 39, note: 'ADC input only' },
      { label: '34', gpio: 34, note: 'ADC input only' },
      { label: '35', gpio: 35, note: 'ADC input only' },
      { label: '32', gpio: 32 },
      { label: '33', gpio: 33 },
      { label: '25', gpio: 25 },
      { label: '26', gpio: 26 },
      { label: '27', gpio: 27 },
      { label: '14', gpio: 14 },
      { label: '12', gpio: 12, warn: 'strapping — avoid' },
      { label: 'GND', gpio: null, kind: 'gnd' },
      { label: '13', gpio: 13 },
      { label: 'D2', gpio: 9 },
      { label: 'D3', gpio: 10 },
      { label: 'D4', gpio: 11 },
      { label: '5V', gpio: null, kind: 'power' },
      { label: 'RX', gpio: 3, note: 'UART RX' },
      { label: 'TX', gpio: 1, note: 'UART TX' },
    ],
    right: [
      { label: '3V3', gpio: null, kind: 'power' },
      { label: 'GND', gpio: null, kind: 'gnd' },
      { label: 'D15', gpio: 5, warn: 'strapping — avoid' },
      { label: 'D16', gpio: 16 },
      { label: 'D17', gpio: 17 },
      { label: 'D18', gpio: 18 },
      { label: 'D19', gpio: 19 },
      { label: 'D21', gpio: 21 },
      { label: 'D22', gpio: 22 },
      { label: 'D23', gpio: 23 },
    ],
  },
}

// Pins the project's reference build uses (see esp32/README.md).
export const REFERENCE_PINS = {
  2: 'onboard LED (light_01)',
  4: 'DHT11 data',
  16: 'room light LED',
  17: 'corner lamp LED',
  26: 'fan gate (via transistor)',
}

// All pins a user can actually drive (output-capable GPIOs), in a stable
// order, with flags the circuit lab surfaces as warnings.
export const USABLE_PINS = (() => {
  const seen = new Set()
  const out = []
  for (const col of ['left', 'right']) {
    for (const pin of BOARD.cols[col]) {
      if (pin.gpio == null || seen.has(pin.gpio)) continue
      seen.add(pin.gpio)
      out.push({ ...pin, side: col })
    }
  }
  if (BOARD.onboard && !seen.has(BOARD.onboard.gpio)) {
    out.push({ ...BOARD.onboard, side: 'board' })
  }
  return out
})()

export function pinWarnings(pin) {
  const p = USABLE_PINS.find((x) => x.gpio === pin)
  const warnings = []
  if (!p) return warnings
  if (p.warn) warnings.push(p.warn)
  if (p.note?.includes('input only')) warnings.push('input-only — cannot drive an output')
  if (p.note?.includes('UART')) warnings.push('shared with the USB serial port')
  if (p.label === 'TX' || p.label === 'RX') warnings.push('shared with the USB serial port')
  return warnings
}
