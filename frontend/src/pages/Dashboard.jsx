import { BookOpen, Home, Plus } from 'lucide-react'
import { useState } from 'react'
import { useSmartRoom } from '../hooks/useSmartRoom'
import AddDeviceModal from '../components/AddDeviceModal'
import ConnectionStatus from '../components/ConnectionStatus'
import DeviceCard from '../components/DeviceCard'
import EnvironmentCard from '../components/EnvironmentCard'
import ModeSwitch from '../components/ModeSwitch'
import SensorChart from '../components/SensorChart'

function fmtUptime(seconds) {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m`
}

export default function Dashboard({ onOpenDocs }) {
  const { devices, status, mode, connected, loading, error, refresh, setMode } = useSmartRoom()
  const [adding, setAdding] = useState(false)

  const sensor = devices.find((d) => d.type === 'sensor')
  const historyDevice = sensor

  return (
    <div className="shell">
      <header className="header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <Home size={16} strokeWidth={2.25} />
          </span>
          <span className="brand__name">Smart Room</span>
          <span className="brand__ver">v0.1</span>
        </div>
        <div className="header__right">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onOpenDocs}>
            <BookOpen size={14} strokeWidth={2.25} /> Docs
          </button>
          <ModeSwitch mode={mode} onChange={setMode} />
          <ConnectionStatus
            label="node"
            online={status?.online !== false}
            detail={status?.nodeId}
          />
          <ConnectionStatus label="api" online={connected} />
        </div>
      </header>

      <main>
        {error && devices.length > 0 && <div className="banner">{error}</div>}

        {loading ? (
          <div className="state-panel">
            <p className="state-panel__title">Listening for the room…</p>
            <p>The ESP32 node should check in any moment.</p>
          </div>
        ) : devices.length === 0 ? (
          <div className="state-panel">
            <p className="state-panel__title">No devices in the room yet</p>
            <p>When an ESP32 node checks in, its devices will appear here.</p>
            <p style={{ marginTop: 12 }}>
              <button type="button" className="btn btn--ghost" onClick={refresh}>
                Try again
              </button>
            </p>
          </div>
        ) : (
          <>
            {sensor && (
              <section className="zone">
                <div className="zone__head">
                  <h2 className="zone__title">Atmosphere</h2>
                  <span className="zone__meta">
                    {sensor.id} · {sensor.online ? 'live' : 'last reading'}
                  </span>
                </div>
                <EnvironmentCard sensor={sensor} mode={mode} />
              </section>
            )}

            <section className="zone">
              <div className="zone__head">
                <h2 className="zone__title">Devices</h2>
                <div className="zone__actions">
                  <span className="zone__meta">{devices.length} registered</span>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => setAdding(true)}
                  >
                    <Plus size={14} strokeWidth={2.5} /> Add device
                  </button>
                </div>
              </div>
              <div className="grid-devices">
                {devices.map((device) => (
                  <DeviceCard key={device.id} device={device} />
                ))}
              </div>
            </section>

            {historyDevice && (
              <section className="zone">
                <div className="zone__head">
                  <h2 className="zone__title">24-hour trace</h2>
                  <span className="zone__meta">{historyDevice.id} · 30-min samples</span>
                </div>
                <SensorChart deviceId={historyDevice.id} />
              </section>
            )}
          </>
        )}
      </main>

      {adding && <AddDeviceModal onClose={() => setAdding(false)} />}

      <footer className="sys">
        <span>node {status?.nodeId || 'esp32_room_01'}</span>
        <span>mode: {mode}</span>
        <span>uptime {fmtUptime(status?.uptime)}</span>
        <span>by Jishworks · Jishnu Dutta ·{' '}
          <a href="https://jishworks.in" target="_blank" rel="noreferrer">jishworks.in</a>
        </span>
        <span className="sys__right">live · {new Date().getFullYear()}</span>
      </footer>
    </div>
  )
}
