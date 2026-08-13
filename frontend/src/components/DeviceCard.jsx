import { useState } from 'react'
import { useSmartRoom } from '../hooks/useSmartRoom'
import DeviceIcon from './DeviceIcon'
import DeviceMenu from './DeviceMenu'
import RemoveConfirmModal from './RemoveConfirmModal'
import RenameModal from './RenameModal'

function typeTag(device) {
  const base = device.sensorType ? `${device.type} · ${device.sensorType}` : `type: ${device.type}`
  // Devices added from the dashboard carry the pin they're wired to.
  return device.pin != null ? `${base} · gpio ${device.pin}` : base
}

// One card renders every kind of device. What it shows is decided by the
// device's own report — its type, sensorType, capabilities, and state —
// never by hard-coding a card per device model.
export default function DeviceCard({ device }) {
  const { sendCommand, mode } = useSmartRoom()
  const [renaming, setRenaming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [cardError, setCardError] = useState(null)

  const online = device.online
  const isSensor = device.type === 'sensor'
  const powerOn = device.state?.power ?? false

  // In Smart Mode the backend rule owns the fan; the switch steps aside.
  const controlledBySmart = device.type === 'fan' && mode === 'smart'
  const powerDisabled = !online || busy || controlledBySmart

  const temp = device.data?.temperature
  const hum = device.data?.humidity

  // A per-type ambient accent — the CSS picks the color from this class.
  const accentClass = isSensor
    ? temp != null && temp >= 28
      ? ' dcard--sensor-hot'
      : ' dcard--sensor'
    : device.type === 'fan'
      ? ' dcard--fan'
      : device.type === 'light'
        ? ' dcard--light'
        : ' dcard--generic'

  const hasColor = device.capabilities?.includes('color') || device.type === 'rgb'
  const currentColor = device.state?.color || '#3b82f6'

  const togglePower = async () => {
    setCardError(null)
    setBusy(true)
    try {
      await sendCommand(device.id, 'power', !powerOn)
    } catch (e) {
      setCardError(e.message || 'The command failed.')
    } finally {
      setBusy(false)
    }
  }

  const changeColor = async (hex) => {
    setCardError(null)
    setBusy(true)
    try {
      await sendCommand(device.id, 'color', hex)
    } catch (e) {
      setCardError(e.message || 'Color command failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className={`dcard${online ? '' : ' dcard--offline'}${accentClass}`}>
      <header className="dcard__head">
        <div className={`dcard__icon${powerOn ? ' dcard__icon--on' : ''}`}>
          <DeviceIcon device={device} />
        </div>
        <div className="dcard__titles">
          <h3 className="dcard__name">{device.name}</h3>
          <p className="dcard__tag">{typeTag(device)}</p>
        </div>
        <span
          className={`dot ${online ? 'dot--on' : 'dot--off'}`}
          title={online ? 'online' : 'offline'}
          aria-label={online ? 'online' : 'offline'}
        />
        <DeviceMenu onRename={() => setRenaming(true)} onRemove={() => setRemoving(true)} />
      </header>

      <div className="dcard__body">
        {isSensor ? (
          <>
            <div className="dcard__reading">
              <span key={temp} className="dcard__reading-v num-pop">{temp != null ? temp.toFixed(1) : '--'}</span>
              <span className="dcard__reading-u">°C</span>
              <span key={hum} className="dcard__reading-v num-pop">{hum != null ? hum : '--'}</span>
              <span className="dcard__reading-u">% rh</span>
            </div>
          </>
        ) : (
          <div className="dcard__state" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>
              power <b className={powerOn ? 'is-on' : ''}>{powerOn ? 'on' : 'off'}</b>
            </span>
            {hasColor && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
                <span style={{ opacity: 0.8 }}>color</span>
                <input
                  type="color"
                  value={currentColor}
                  disabled={!online || busy}
                  onChange={(e) => changeColor(e.target.value)}
                  style={{ width: 24, height: 24, padding: 0, border: 'none', borderRadius: 4, background: 'none', cursor: 'pointer' }}
                />
              </label>
            )}
          </div>
        )}
      </div>

      <footer className="dcard__foot">
        {isSensor ? (
          <span className="dcard__ctl-label">reads every 5 s</span>
        ) : (
          <>
            <span className="dcard__ctl-label">power</span>
            <button
              type="button"
              role="switch"
              aria-checked={powerOn}
              aria-label={`${device.name} power`}
              aria-busy={busy}
              className={`switch${busy ? ' switch--busy' : ''}`}
              disabled={powerDisabled}
              onClick={togglePower}
            >
              <span className="switch__tab" />
            </button>
          </>
        )}
      </footer>

      {!online && (
        <p className="dcard__note">
          offline — showing last known state
          {device.lastSeen ? ` · last seen ${device.lastSeen}` : ''}
        </p>
      )}
      {controlledBySmart && (
        <p className="dcard__note">
          smart mode: a rule runs this fan. Switch to manual to take over.
        </p>
      )}
      {cardError && (
        <p className="dcard__err" role="alert">
          {cardError}
        </p>
      )}

      {renaming && <RenameModal device={device} onClose={() => setRenaming(false)} />}
      {removing && <RemoveConfirmModal device={device} onClose={() => setRemoving(false)} />}
    </article>
  )
}
