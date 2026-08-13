import { Activity, Droplets, Thermometer } from 'lucide-react'

function roomStatus(temp) {
  if (temp == null) return { label: 'no reading', tone: 'muted' }
  if (temp >= 28) return { label: 'Hot', tone: 'clay' }
  if (temp >= 26) return { label: 'Warm', tone: 'amber' }
  return { label: 'Comfortable', tone: 'teal' }
}

export default function EnvironmentCard({ sensor, mode }) {
  const temp = sensor?.data?.temperature
  const hum = sensor?.data?.humidity
  const status = roomStatus(temp)
  const toneClass = status.tone === 'muted' ? '' : ` stat__value--${status.tone}`

  return (
    <div className="stats">
      <div className="stat">
        <div className="stat__label">
          <Thermometer size={13} strokeWidth={1.75} /> air temp
        </div>
        <div key={temp} className="stat__value num-pop">{temp != null ? `${temp.toFixed(1)}°C` : '—'}</div>
        <div className="stat__sub">{sensor ? sensor.id : 'no sensor reporting'}</div>
      </div>

      <div className="stat">
        <div className="stat__label">
          <Droplets size={13} strokeWidth={1.75} /> humidity
        </div>
        <div key={hum} className="stat__value num-pop">{hum != null ? `${hum}%` : '—'}</div>
        <div className="stat__sub">{sensor ? 'in the room' : 'no sensor reporting'}</div>
      </div>

      <div className="stat">
        <div className="stat__label">
          <Activity size={13} strokeWidth={1.75} /> room status
        </div>
        <div className={`stat__value${toneClass}`}>{status.label}</div>
        <div className="stat__sub">
          {mode === 'smart'
            ? 'rule: ≥28°C runs the fan'
            : 'manual — nothing moves on its own'}
        </div>
      </div>
    </div>
  )
}
