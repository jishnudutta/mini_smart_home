// Driver circuits for every device type the dashboard can provision.
//
// `rails` names the power nets the circuit needs on the ESP32 header:
//   3v3  — the 3V3 pin (sensors, logic)
//   5v   — the 5V / VIN pin (motors, relay coils — never through a GPIO)
//   gnd  — the GND pin (always)
//
// The signal always comes from the device's assigned GPIO pin; the wiring
// diagram in the Circuit lab draws the rest.

export const CIRCUITS = {
  light: {
    title: 'Light · LED',
    signal: 'LED anode',
    blurb: 'The classic first circuit. A GPIO sources a few milliamps — enough for an LED, never for a motor.',
    parts: [
      'LED (any color)',
      '220 Ω – 1 kΩ series resistor',
      '2 jumper wires',
    ],
    notes: [
      'Anode (long leg) toward the resistor / GPIO; cathode (short leg, flat edge) to GND.',
      'Higher resistor = dimmer LED. Start at 330 Ω.',
      'A bare GPIO can never drive a motor or relay coil — see Fan and Switch.',
    ],
    rails: ['gnd'],
  },
  fan: {
    title: 'Fan · transistor gate',
    signal: 'transistor base',
    blurb: 'A fan pulls far more current than a GPIO can source, so a small NPN transistor (or MOSFET / relay) switches it from 5 V.',
    parts: [
      'Mini 5 V fan (or 12 V fan + external supply)',
      'NPN transistor — 2N2222 / BC547 / S8050',
      '1 kΩ base resistor',
      '1N4001 diode (flyback)',
      'jumper wires',
    ],
    notes: [
      'GPIO → 1 kΩ → transistor base; emitter → GND.',
      'Fan + → 5 V; fan − → transistor collector.',
      'Diode across the motor, band toward 5 V — it absorbs the motor’s inductive kick when you switch off.',
      'Never connect the fan directly to a GPIO pin.',
    ],
    rails: ['5v', 'gnd'],
  },
  sensor: {
    title: 'Sensor · DHT11 / DHT22',
    signal: 'DHT11 DATA',
    blurb: 'Digital temperature + humidity on one wire. Needs a pull-up resistor between DATA and 3V3 (most modules solder one on).',
    parts: [
      'DHT11 (or DHT22) module',
      '4.7 kΩ – 10 kΩ pull-up resistor (skip if the module has one)',
      '3 jumper wires',
    ],
    notes: [
      'VCC → 3V3 · GND → GND · DATA → GPIO.',
      'Reads happen once per 5 s — well within the DHT11’s 1 s minimum spacing.',
      'Reads fail (log: “[dht] read failed”) if the pull-up is missing or VCC is 5 V on a 3V3-logic board.',
    ],
    rails: ['3v3', 'gnd'],
  },
  switch: {
    title: 'Switch · relay module',
    signal: 'relay IN',
    blurb: 'A relay lets the ESP32 switch mains-or-12 V loads in complete isolation. The module’s coil is driven by the GPIO; the load never touches the board.',
    parts: [
      'Relay module (SRD-05VDC / similar)',
      '3 jumper wires (module side)',
      'load wiring on the COM / NO screw terminals',
    ],
    notes: [
      'IN → GPIO · VCC → 5 V · GND → GND (module logic is 5 V-tolerant on most boards).',
      'Load: mains live → COM, load → NO; neutral bypasses the relay.',
      'Keep the load wiring away from the ESP32’s low-voltage side.',
    ],
    rails: ['5v', 'gnd'],
  },
  rgb: {
    title: 'RGB LED · common cathode',
    signal: 'R / G / B channels',
    blurb: 'Three color channels, three GPIOs, three resistors. The firmware treats RGB as a power device in this build — wiring it out makes it future-proof.',
    parts: [
      'Common-cathode RGB LED',
      '3 × 220 Ω – 330 Ω resistors',
      '4 jumper wires',
    ],
    notes: [
      'Each anode (R / G / B) → its own resistor → its own GPIO.',
      'Common cathode (longest leg) → GND.',
      'Not yet exposed in the UI — the backend already stores the type.',
    ],
    rails: ['gnd'],
  },
  motion: {
    title: 'Motion · PIR sensor',
    signal: 'PIR OUT',
    blurb: 'A PIR (HC-SR501) detects motion and raises its OUT line. Wire it as an input; the backend reads it via the report loop.',
    parts: [
      'HC-SR501 PIR module',
      '3 jumper wires',
    ],
    notes: [
      'VCC → 3V3 (or 5 V) · GND → GND · OUT → GPIO.',
      'On most modules the sensitivity and hold-time pots are on the back.',
      'Give it ~30 s to settle after power-up before trusting readings.',
    ],
    rails: ['3v3', 'gnd'],
  },
  onboard: {
    title: 'Onboard LED · GPIO2',
    signal: 'onboard LED',
    blurb: 'The blue LED already soldered to the Dev Module, driven by GPIO2. The zero-wiring bring-up device (light_01 in the reference build).',
    parts: ['nothing — it is on the board'],
    notes: [
      'GPIO2 is a strapping pin: it floats at boot, but driving it as an output is safe after boot.',
      'Not broken out on the 30-pin header — useful for testing, not for real loads.',
    ],
    rails: [],
  },
}

export const CIRCUIT_ORDER = [
  'light',
  'fan',
  'sensor',
  'switch',
  'rgb',
  'motion',
  'onboard',
]

// Type → circuit key for devices reported by the backend.
export const TYPE_TO_CIRCUIT = {
  light: 'light',
  fan: 'fan',
  sensor: 'sensor',
  switch: 'switch',
  rgb: 'rgb',
  motion: 'motion',
}

export const RAIL_COLORS = {
  '3v3': '#e5484d',
  '5v': '#ff9f0a',
  gnd: '#1d2733',
}

export const RAIL_LABELS = {
  '3v3': '3V3',
  '5v': '5V',
  gnd: 'GND',
}
