import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CircleDot,
  Fan,
  Gauge,
  Lightbulb,
  Palette,
  Plus,
  ToggleLeft,
} from 'lucide-react'
import { useSmartRoom } from '../../hooks/useSmartRoom'
import AddDeviceModal from '../AddDeviceModal'
import { BOARD, USABLE_PINS, REFERENCE_PINS, pinWarnings } from './esp32Pinout'
import { CIRCUITS, CIRCUIT_ORDER, RAIL_COLORS, RAIL_LABELS, TYPE_TO_CIRCUIT } from './circuits'

const TYPE_ICONS = {
  light: Lightbulb,
  fan: Fan,
  sensor: Gauge,
  switch: ToggleLeft,
  rgb: Palette,
  motion: Activity,
  onboard: CircleDot,
}

/* ------------------------------------------------------------------ */
/*  Geometry — the board on the right, the schematic on the left.      */
/*  A single dynamic "signal" wire runs from the chosen GPIO to the    */
/*  circuit; the power nets (3V3 / 5V / GND) are drawn as real wires   */
/*  from the board's power pins to the schematic rails.                */
/* ------------------------------------------------------------------ */

const BOARD_X = 730
const BOARD_Y = 40
const BOARD_W = 250
const BOARD_H = 360
const LEFT_X = 718      // left pin column (cx)
const RIGHT_X = 992     // right pin column (cx)
const PIN_STEP = 17.5
const PIN_TOP = 62
const SIGNAL_Y = 300    // y the signal wire enters the schematic
const RAIL_X0 = 250     // rails span RAIL_X0..RAIL_X1 at the top
const RAIL_X1 = 645

const RAIL_Y = { '3v3': 70, '5v': 90, gnd: 110 }
const SIGNAL_COLOR = '#3b82f6'
const DIM = 'rgba(30, 55, 110, 0.16)'

const pinY = (i) => PIN_TOP + i * PIN_STEP

function boardPin(side, index) {
  const col = BOARD.cols[side]
  const pin = col[index]
  return { ...pin, side, index, cy: pinY(index) }
}

// Resolve a GPIO number to its place on the board. The onboard LED (GPIO2)
// has no header position — its signal wire is intentionally not drawn.
function findPin(gpio) {
  for (const side of ['left', 'right']) {
    const index = BOARD.cols[side].findIndex((p) => p.gpio === gpio)
    if (index >= 0) return { gpio, side, index }
  }
  if (BOARD.onboard && BOARD.onboard.gpio === gpio) return { gpio, side: 'board', index: null }
  return null
}

// The wire from a chosen GPIO pin to the schematic's signal entry.
function signalPath(pin) {
  if (!pin || pin.index == null) return null
  const cy = pinY(pin.index)
  if (pin.side === 'left') {
    return `M ${LEFT_X} ${cy} L 692 ${cy} L 692 ${SIGNAL_Y} L 640 ${SIGNAL_Y}`
  }
  // Right side: run the jumper under the board.
  return `M ${RIGHT_X} ${cy} L 1014 ${cy} L 1014 428 L 712 428 L 712 ${SIGNAL_Y} L 640 ${SIGNAL_Y}`
}

// The power wires from the board's power pins to the schematic rails.
const POWER_WIRES = {
  '3v3': `M 992 ${pinY(0)} L 1012 ${pinY(0)} L 1012 ${RAIL_Y['3v3']} L ${RAIL_X1} ${RAIL_Y['3v3']}`,
  gnd: `M 992 ${pinY(1)} L 1012 ${pinY(1)} L 1012 430 L 706 430 L 706 ${RAIL_Y.gnd} L ${RAIL_X1} ${RAIL_Y.gnd}`,
  '5v': `M ${LEFT_X} ${pinY(17)} L 700 ${pinY(17)} L 700 ${RAIL_Y['5v']} L ${RAIL_X1} ${RAIL_Y['5v']}`,
}

/* ------------------------------------------------------------------ */
/*  Small SVG symbols                                                  */
/* ------------------------------------------------------------------ */

function Resistor({ x, y, color = 'currentColor', w = 70 }) {
  const hw = w / 2
  const seg = w / 6
  const d = [
    `M ${x - hw} ${y}`,
    `h ${seg * 0.6}`,
    `l ${seg * 0.2} -7 l ${seg * 0.4} 14 l ${seg * 0.4} -14 l ${seg * 0.4} 14 l ${seg * 0.4} -14 l ${seg * 0.4} 14 l ${seg * 0.2} -7`,
    `h ${seg * 0.6}`,
  ].join(' ')
  return <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
}

function Motor({ cx, cy, color = 'currentColor' }) {
  return (
    <g stroke={color} fill="none" strokeWidth="1.8">
      <circle cx={cx} cy={cy} r="21" />
      <path d={`M ${cx - 21} ${cy} h 42 M ${cx} ${cy - 21} v 42`} strokeWidth="1.2" opacity="0.7" />
      <text x={cx} y={cy + 4.5} textAnchor="middle" fontSize="13" fill={color} stroke="none" fontWeight="600">
        M
      </text>
    </g>
  )
}

function Diode({ x, y1, y2, color = 'currentColor' }) {
  // Vertical diode, cathode bar toward y1 (the +5V side in the fan circuit).
  const my = (y1 + y2) / 2
  return (
    <g stroke={color} fill="none" strokeWidth="1.8">
      <path d={`M ${x} ${y1} L ${x} ${my - 8}`} />
      <path d={`M ${x - 7} ${my - 8} L ${x + 7} ${my - 8}`} strokeWidth="2.6" />
      <path d={`M ${x} ${my - 8} L ${x - 7} ${my + 10} L ${x + 7} ${my + 10} Z`} fill={color} stroke="none" />
      <path d={`M ${x} ${my + 10} L ${x} ${y2}`} />
    </g>
  )
}

// A semicircle that lifts the wire drawn by `path` over a rail it crosses
// (classic schematic "no connection" jump).
function Jump({ x, y, color = 'currentColor' }) {
  return <path d={`M ${x} ${y - 6} a 6 6 0 0 1 0 12`} fill="none" stroke={color} strokeWidth="1.8" />
}

/* ------------------------------------------------------------------ */
/*  The board                                                          */
/* ------------------------------------------------------------------ */

function Board({ selectedPin, onSelect }) {
  const sides = ['left', 'right']
  return (
    <g>
      {/* PCB */}
      <rect x={BOARD_X} y={BOARD_Y} width={BOARD_W} height={BOARD_H} rx={16} fill="#0f2247" />
      <rect x={BOARD_X + 6} y={BOARD_Y + 6} width={BOARD_W - 12} height={BOARD_H - 12} rx={12} fill="none" stroke="rgba(255,255,255,0.09)" />
      {/* USB */}
      <rect x={795} y={BOARD_Y - 8} width={120} height={16} rx={4} fill="#1c3058" />
      <rect x={800} y={BOARD_Y - 5} width={110} height={10} rx={3} fill="#0b1934" stroke="rgba(255,255,255,0.14)" />

      <text x={(BOARD_X + BOARD_W) / 2} y={150} textAnchor="middle" fontSize="30" fontWeight="700" fill="rgba(255,255,255,0.92)" fontFamily="'Space Grotesk', sans-serif">
        ESP32
      </text>
      <text x={(BOARD_X + BOARD_W) / 2} y={174} textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.55)" fontFamily="'IBM Plex Mono', monospace" letterSpacing="0.14em">
        DEV MODULE
      </text>

      {sides.map((side) => {
        const col = BOARD.cols[side]
        return col.map((pin, i) => {
          const cy = pinY(i)
          const isSel = selectedPin && selectedPin.gpio === pin.gpio && pin.gpio != null
          const power = pin.kind === 'power' || pin.kind === 'gnd'
          const label = pin.gpio != null && pin.label !== String(pin.gpio)
            ? `${pin.label}·${pin.gpio}`
            : pin.label
          return (
            <g
              key={`${side}-${i}`}
              onClick={() => pin.gpio != null && onSelect(boardPin(side, i))}
              style={{ cursor: pin.gpio != null ? 'pointer' : 'default' }}
            >
              <title>{pin.gpio != null ? `GPIO ${pin.gpio}${pin.note ? ` — ${pin.note}` : ''}` : `${pin.label}${pin.note ? ` — ${pin.note}` : ''}`}</title>
              {isSel && (
                <circle cx={side === 'left' ? LEFT_X : RIGHT_X} cy={cy} r={11} fill="none" stroke={SIGNAL_COLOR} strokeWidth="2.2" opacity="0.9" />
              )}
              <circle
                cx={side === 'left' ? LEFT_X : RIGHT_X}
                cy={cy}
                r={isSel ? 6 : 4.4}
                fill={isSel ? SIGNAL_COLOR : power ? (pin.kind === 'gnd' ? '#202a3a' : '#d97706') : '#ffffff'}
                stroke={isSel ? '#fff' : 'rgba(255,255,255,0.25)'}
                strokeWidth={isSel ? 1.6 : 1}
              />
              {isSel && (
                <circle cx={side === 'left' ? LEFT_X : RIGHT_X} cy={cy} r={9} fill="none" stroke={SIGNAL_COLOR} strokeWidth="1" opacity="0.5" />
              )}
              <text
                x={side === 'left' ? BOARD_X + 8 : RIGHT_X - 8}
                y={cy + 4}
                textAnchor={side === 'left' ? 'start' : 'end'}
                fontSize="11"
                fontFamily="'IBM Plex Mono', monospace"
                fill={isSel ? '#93c5fd' : power ? (pin.kind === 'gnd' ? 'rgba(255,255,255,0.7)' : '#fdba74') : 'rgba(255,255,255,0.82)'}
                fontWeight={isSel ? 700 : 400}
              >
                {label}
              </text>
            </g>
          )
        })
      })}
    </g>
  )
}

/* ------------------------------------------------------------------ */
/*  Static schematic for each circuit (the part that never moves).     */
/*  `rails` = power nets this circuit uses, drawn as rails + wires.    */
/* ------------------------------------------------------------------ */

function Schematic({ circuitKey, active }) {
  const c = CIRCUITS[circuitKey]
  const rails = c.rails
  const color = active ? 'currentColor' : DIM

  const railLines = rails.map((r) => (
    <g key={r}>
      <line x1={RAIL_X0} y1={RAIL_Y[r]} x2={RAIL_X1} y2={RAIL_Y[r]} stroke={RAIL_COLORS[r]} strokeWidth="2" />
      <text x={RAIL_X0 - 6} y={RAIL_Y[r] + 3.5} textAnchor="end" fontSize="10.5" fontFamily="'IBM Plex Mono', monospace" fill={RAIL_COLORS[r]} fontWeight="700">
        {RAIL_LABELS[r]}
      </text>
    </g>
  ))

  const railStub = (x, pinYpos, rail) =>
    `M 204 ${pinYpos} L ${x} ${pinYpos} L ${x} ${RAIL_Y[rail]} L ${RAIL_X0} ${RAIL_Y[rail]}`

  // signal entry — dashed until a pin is chosen
  const signalIn = (
    <g>
      <line x1={640} y1={SIGNAL_Y} x2={204} y2={SIGNAL_Y} stroke={color} strokeWidth="2.2" strokeDasharray={active ? 'none' : '5 5'} />
      {active && (
        <text x={610} y={SIGNAL_Y - 10} textAnchor="end" fontSize="10.5" fontFamily="'IBM Plex Mono', monospace" fill={SIGNAL_COLOR} fontWeight="700">
          GPIO → {CIRCUITS[circuitKey].signal || 'signal'}
        </text>
      )}
    </g>
  )

  let body = null

  switch (circuitKey) {
    case 'light': {
      body = (
        <g>
          <path d={railStub(244, 230, 'gnd')} fill="none" stroke={RAIL_COLORS.gnd} strokeWidth="2" />
          {active ? <Resistor x={430} y={SIGNAL_Y} /> : <Resistor x={430} y={SIGNAL_Y} color={DIM} />}
        </g>
      )
      break
    }
    case 'fan': {
      body = (
        <g>
          {/* emitter → GND */}
          <path d={railStub(244, 230, 'gnd')} fill="none" stroke={RAIL_COLORS.gnd} strokeWidth="2" />
          {/* collector → motor → 5V, with flyback diode across the motor */}
          <path d="M 204 150 L 322 150" fill="none" stroke={color} strokeWidth="2" />
          <Motor cx={345} cy={150} color={active ? '#ff9f0a' : DIM} />
          <Diode x={352} y1={131} y2={169} color={active ? '#ff9f0a' : DIM} />
          <path d="M 368 150 L 430 150 L 430 90" fill="none" stroke={color} strokeWidth="2" />
          <Jump x={430} y={RAIL_Y.gnd} color={color} />
          {active ? <Resistor x={430} y={SIGNAL_Y} /> : <Resistor x={430} y={SIGNAL_Y} color={DIM} />}
        </g>
      )
      break
    }
    case 'sensor': {
      body = (
        <g>
          <path d={railStub(236, 150, '3v3')} fill="none" stroke={RAIL_COLORS['3v3']} strokeWidth="2" />
          <path d={railStub(244, 230, 'gnd')} fill="none" stroke={RAIL_COLORS.gnd} strokeWidth="2" />
          {/* DATA pull-up to 3V3 */}
          <path d="M 380 300 L 380 70" fill="none" stroke={RAIL_COLORS['3v3']} strokeWidth="2" />
          <Jump x={380} y={RAIL_Y.gnd} color={RAIL_COLORS['3v3']} />
          <Resistor x={380} y={205} color={RAIL_COLORS['3v3']} w={44} />
        </g>
      )
      break
    }
    case 'switch': {
      body = (
        <g>
          <path d={railStub(236, 150, '5v')} fill="none" stroke={RAIL_COLORS['5v']} strokeWidth="2" />
          <path d={railStub(244, 230, 'gnd')} fill="none" stroke={RAIL_COLORS.gnd} strokeWidth="2" />
          {/* relay coil glyph — the IN wire drives it; module carries its own driver */}
          <g stroke={color} fill="none" strokeWidth="1.8" opacity="0.9">
            <rect x={452} y={278} width={52} height={44} rx={7} />
            <path d="M 478 296 h 16 M 478 304 h 16" strokeWidth="2.4" />
          </g>
        </g>
      )
      break
    }
    case 'rgb': {
      body = (
        <g>
          <path d={railStub(236, 150, 'gnd')} fill="none" stroke={RAIL_COLORS.gnd} strokeWidth="2" />
          {[
            { y: 230, tint: '#ef4444' },
            { y: SIGNAL_Y, tint: '#22c55e' },
            { y: 370, tint: '#3b82f6' },
          ].map((ch) => (
            <g key={ch.y}>
              <line x1={204} y1={ch.y} x2={620} y2={ch.y} stroke={color} strokeWidth="2" strokeDasharray="6 5" />
              <Resistor x={400} y={ch.y} w={44} color={active ? ch.tint : DIM} />
              <circle cx={620} cy={ch.y} r={3.4} fill={active ? ch.tint : DIM} />
            </g>
          ))}
          <text x={640} y={SIGNAL_Y + 4} textAnchor="end" fontSize="10.5" fontFamily="'IBM Plex Mono', monospace" fill={active ? SIGNAL_COLOR : DIM} fontWeight="700">
            ×3 GPIOs
          </text>
        </g>
      )
      break
    }
    case 'motion': {
      body = (
        <g>
          <path d={railStub(236, 150, '3v3')} fill="none" stroke={RAIL_COLORS['3v3']} strokeWidth="2" />
          <path d={railStub(244, 230, 'gnd')} fill="none" stroke={RAIL_COLORS.gnd} strokeWidth="2" />
        </g>
      )
      break
    }
    default:
      break
  }

  return (
    <g>
      {railLines}
      {signalIn}
      {body}
    </g>
  )
}

/* ------------------------------------------------------------------ */
/*  Card representing the component                                    */
/* ------------------------------------------------------------------ */

function DeviceCard({ circuitKey, active }) {
  const c = CIRCUITS[circuitKey]
  const Icon = TYPE_ICONS[circuitKey] || CircleDot
  const pins = {
    light: [
      { label: 'A · anode', y: SIGNAL_Y, kind: 'sig' },
      { label: 'C · cathode', y: 230, kind: 'gnd' },
    ],
    fan: [
      { label: 'C · collector', y: 150, kind: '5v' },
      { label: 'E · emitter', y: 230, kind: 'gnd' },
      { label: 'B · base', y: SIGNAL_Y, kind: 'sig' },
    ],
    sensor: [
      { label: 'VCC', y: 150, kind: '3v3' },
      { label: 'GND', y: 230, kind: 'gnd' },
      { label: 'DATA', y: SIGNAL_Y, kind: 'sig' },
    ],
    switch: [
      { label: 'VCC', y: 150, kind: '5v' },
      { label: 'GND', y: 230, kind: 'gnd' },
      { label: 'IN', y: SIGNAL_Y, kind: 'sig' },
    ],
    rgb: [
      { label: 'K · cathode', y: 150, kind: 'gnd' },
      { label: 'R', y: 230, kind: 'sig' },
      { label: 'G', y: SIGNAL_Y, kind: 'sig' },
      { label: 'B', y: 370, kind: 'sig' },
    ],
    motion: [
      { label: 'VCC', y: 150, kind: '3v3' },
      { label: 'GND', y: 230, kind: 'gnd' },
      { label: 'OUT', y: SIGNAL_Y, kind: 'sig' },
    ],
    onboard: [],
  }[circuitKey] || []

  const top = 100
  const bottom = 380

  return (
    <g>
      <rect x={40} y={top} width={164} height={bottom - top} rx={14} fill={active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)'} stroke={active ? 'rgba(59,130,246,0.5)' : 'rgba(30,55,110,0.18)'} strokeWidth="1.4" />
      <rect x={40} y={top} width={164} height={34} rx={14} fill={active ? 'rgba(59,130,246,0.08)' : 'transparent'} />
      <g transform={`translate(52, ${top + 17})`} color={active ? '#3b82f6' : '#7c8aa5'}>
        <Icon size={15} strokeWidth={2} />
      </g>
      <text x={74} y={top + 22} fontSize="13.5" fontWeight="600" fill={active ? '#12203f' : '#7c8aa5'} fontFamily="'Space Grotesk', sans-serif">
        {c.title.split(' · ')[0]}
      </text>
      {pins.map((p) => (
        <g key={p.label}>
          <line x1={204} y1={p.y} x2={218} y2={p.y} stroke={p.kind === 'sig' ? (active ? SIGNAL_COLOR : DIM) : RAIL_COLORS[p.kind]} strokeWidth="2.2" />
          <circle cx={204} cy={p.y} r={4.2} fill={p.kind === 'sig' ? (active ? SIGNAL_COLOR : DIM) : RAIL_COLORS[p.kind]} stroke="#fff" strokeWidth="1.2" />
          <text x={216} y={p.y + 3.5} fontSize="10.5" fontFamily="'IBM Plex Mono', monospace" fill={active ? '#4c5b7a' : '#9aa6bd'} fontWeight={p.kind === 'sig' ? 700 : 400}>
            {p.label}
          </text>
        </g>
      ))}
      {circuitKey === 'onboard' && (
        <text x={122} y={240} textAnchor="middle" fontSize="11.5" fill={active ? '#4c5b7a' : '#9aa6bd'}>
          soldered on the board — no external wiring
        </text>
      )}
    </g>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function CircuitLab() {
  const { devices, addDevice } = useSmartRoom()
  const [circuitKey, setCircuitKey] = useState('sensor')
  const [selected, setSelected] = useState(null) // { gpio, side, index }

  // The onboard LED has exactly one pin — select it when that circuit opens.
  useEffect(() => {
    if (circuitKey === 'onboard') setSelected(findPin(2))
  }, [circuitKey])

  const circuit = CIRCUITS[circuitKey]
  const pinsUsed = useMemo(() => {
    const map = {}
    for (const d of devices) {
      if (d.pin != null) {
        map[d.pin] = map[d.pin] || []
        map[d.pin].push(d)
      }
    }
    return map
  }, [devices])

  const [adding, setAdding] = useState(false)

  const selectedPin = selected
  const warnings = selectedPin ? pinWarnings(selectedPin.gpio) : []

  const pinOptions = USABLE_PINS
    .filter((p) => !pinWarnings(p.gpio).some((w) => w.includes('input-only')))
    .sort((a, b) => a.gpio - b.gpio)

  const pinLabel = (p) => {
    const ref = REFERENCE_PINS[p.gpio]
    const busy = pinsUsed[p.gpio]
    return [
      `GPIO ${p.gpio}`,
      ref ? `· ${ref}` : '',
      p.side === 'board' ? '· onboard' : '',
      busy ? `· in use (${busy.map((d) => d.name).join(', ')})` : '',
    ].filter(Boolean).join(' ')
  }

  const chooseDevice = (d) => {
    const key = TYPE_TO_CIRCUIT[d.type] || 'light'
    setCircuitKey(key)
    setSelected(d.pin != null ? findPin(d.pin) : null)
  }

  return (
    <div className="clab">
      <div className="clab__top">
        <div className="clab__intro">
          <h3>Circuit design lab</h3>
          <p>
            Pick a component and a GPIO pin — the wiring diagram draws itself. Click any pin on the
            board to route it, or click a device below to see exactly how it&apos;s wired.
          </p>
        </div>
        <div className="clab__legend">
          <span className="clab__lg"><i style={{ background: SIGNAL_COLOR }} /> GPIO signal</span>
          <span className="clab__lg"><i style={{ background: RAIL_COLORS['3v3'] }} /> 3V3</span>
          <span className="clab__lg"><i style={{ background: RAIL_COLORS['5v'] }} /> 5V</span>
          <span className="clab__lg"><i style={{ background: RAIL_COLORS.gnd }} /> GND</span>
        </div>
      </div>

      {devices.length > 0 && (
        <div className="clab__devices">
          <span className="clab__devices-label">wired right now</span>
          {devices.map((d) => (
            <button
              key={d.id}
              type="button"
              className="chip"
              onClick={() => chooseDevice(d)}
              title={`${d.id} · GPIO ${d.pin}`}
            >
              <span className={`chip__dot ${d.online ? 'chip__dot--on' : ''}`} />
              {d.name}
              <span className="chip__pin">GPIO {d.pin}</span>
            </button>
          ))}
        </div>
      )}

      <div className="clab__grid">
        <div className="clab__canvas">
          <svg viewBox="0 0 1040 460" className="clab__svg" role="img" aria-label={`Wiring diagram for ${circuit.title}`}>
            {/* schematic zone */}
            <g className={selectedPin ? '' : 'is-dim'}>
              <Schematic circuitKey={circuitKey} active={!!selectedPin} />
              <DeviceCard circuitKey={circuitKey} active={!!selectedPin} />
            </g>

            {/* power wires from the board */}
            {circuit.rails.map((r) => (
              <path key={r} d={POWER_WIRES[r]} fill="none" stroke={RAIL_COLORS[r]} strokeWidth="1.6" opacity="0.85" />
            ))}

            {/* the dynamic signal wire */}
            {selectedPin && signalPath(selectedPin) && (
              <path
                d={signalPath(selectedPin)}
                fill="none"
                stroke={SIGNAL_COLOR}
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="clab__wire"
              >
                <title>Signal wire — GPIO {selectedPin.gpio}</title>
              </path>
            )}

            <Board selectedPin={selectedPin} onSelect={setSelected} />
          </svg>
        </div>

        <aside className="clab__side">
          <div className="clab__block">
            <div className="clab__block-label">component</div>
            <div className="clab__chips">
              {CIRCUIT_ORDER.map((key) => {
                const Icon = TYPE_ICONS[key]
                return (
                  <button
                    key={key}
                    type="button"
                    className={`chip chip--type ${circuitKey === key ? 'chip--active' : ''}`}
                    onClick={() => setCircuitKey(key)}
                  >
                    <Icon size={13} strokeWidth={2.2} />
                    {CIRCUITS[key].title.split(' · ')[0]}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="clab__block">
            <div className="clab__block-label">GPIO pin</div>
            <select
              className="field"
              value={selectedPin ? selectedPin.gpio : ''}
              onChange={(e) => {
                setSelected(findPin(Number(e.target.value)))
              }}
            >
              <option value="" disabled>
                {circuitKey === 'onboard' ? 'GPIO 2 — onboard LED' : 'Choose a GPIO…'}
              </option>
              {pinOptions.map((p) => (
                <option key={p.gpio} value={p.gpio}>{pinLabel(p)}</option>
              ))}
            </select>
            <p className="clab__hint">
              Tip: click a pin directly on the board diagram — the wire routes live.
            </p>
            {selectedPin && (
              <div className="clab__pinsel">
                <span className="clab__pinsel-num">GPIO {selectedPin.gpio}</span>
                <span className="clab__pinsel-side">{selectedPin.side === 'board' ? 'onboard' : `${selectedPin.side} column`}</span>
                {REFERENCE_PINS[selectedPin.gpio] && (
                  <span className="clab__pinsel-ref">reference build: {REFERENCE_PINS[selectedPin.gpio]}</span>
                )}
              </div>
            )}
            {warnings.length > 0 && (
              <div className="clab__warn">
                {warnings.map((w) => (
                  <p key={w}><AlertTriangle size={12} strokeWidth={2.4} /> {w}</p>
                ))}
              </div>
            )}
          </div>

          <div className="clab__block">
            <div className="clab__block-label">bill of materials</div>
            <ul className="clab__parts">
              {circuit.parts.map((p) => <li key={p}>{p}</li>)}
            </ul>
            <div className="clab__block-label" style={{ marginTop: 14 }}>notes</div>
            <ul className="clab__notes">
              {circuit.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </div>

          {circuitKey !== 'onboard' && (
            <button
              type="button"
              className="btn btn--primary clab__add"
              onClick={() => setAdding(true)}
              disabled={!selectedPin}
            >
              <Plus size={15} strokeWidth={2.5} />
              {selectedPin ? `Add this ${circuitKey} on GPIO ${selectedPin.gpio}` : 'Choose a pin to add it'}
            </button>
          )}
        </aside>
      </div>

      {adding && (
        <AddDeviceModal
          initial={{ type: circuitKey === 'sensor' ? 'sensor' : circuitKey, pin: selectedPin?.gpio, name: '' }}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}
