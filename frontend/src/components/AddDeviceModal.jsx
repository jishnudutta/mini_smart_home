import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSmartRoom } from '../hooks/useSmartRoom'

// Types the dashboard can provision. The backend derives each type's
// capabilities; anything else a user types is validated and stored as-is,
// so new kinds of devices never need a dashboard rebuild.
const DEVICE_TYPES = [
  { value: 'light', label: 'Light' },
  { value: 'fan', label: 'Fan' },
  { value: 'switch', label: 'Switch' },
  { value: 'rgb', label: 'RGB light' },
  { value: 'motion', label: 'Motion sensor' },
  { value: 'sensor', label: 'Climate sensor' },
]

export default function AddDeviceModal({ onClose, initial }) {
  const { addDevice } = useSmartRoom()
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState(initial?.type ?? 'light')
  const [pin1, setPin1] = useState(initial?.pin?.[0] != null ? String(initial.pin[0]) : '')
  const [pin2, setPin2] = useState(initial?.pin?.[1] != null ? String(initial.pin[1]) : '')
  const [pin3, setPin3] = useState(initial?.pin?.[2] != null ? String(initial.pin[2]) : '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const save = async () => {
    const trimmed = name.trim()
    const pins = type === 'rgb'
      ? [Number(pin1), Number(pin2), Number(pin3)]
      : [Number(pin1)]
    if (!trimmed) {
      setErr('Give the device a name.')
      return
    }
    if (pins.some((p) => !Number.isInteger(p) || p < 0 || p > 48)) {
      setErr(type === 'rgb'
        ? 'All 3 GPIO pins must be whole numbers between 0 and 48.'
        : 'GPIO pin must be a whole number between 0 and 48.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await addDevice({ name: trimmed, type, pins })
      onClose()
    } catch (e) {
      setErr(e.message || "Couldn't add the device.")
      setBusy(false)
    }
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-title">
        <h2 className="modal__title" id="add-title">Add device</h2>
        <p className="modal__sub">
          The id is generated automatically (e.g. <code>light_02</code>) and never changes — only
          the name is editable later. Wire the hardware to the pin you name here; the node picks
          it up on its next refresh and the card appears here.
        </p>

        <label className="field-label" htmlFor="add-name">Name</label>
        <input
          ref={inputRef}
          id="add-name"
          className="field"
          value={name}
          maxLength={40}
          placeholder="e.g. Desk lamp"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />

        <div className="form-row">
          <div>
            <label className="field-label" htmlFor="add-type">Type</label>
            <select
              id="add-type"
              className="field"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {DEVICE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            {type === 'rgb' ? (
              <>
                <label className="field-label" htmlFor="add-pin-r">Red GPIO pin</label>
                <input
                  id="add-pin-r"
                  className="field"
                  type="number"
                  min={0}
                  max={48}
                  value={pin1}
                  placeholder="e.g. 4"
                  onChange={(e) => setPin1(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && save()}
                  style={{ marginBottom: 8 }}
                />
                <label className="field-label" htmlFor="add-pin-g">Green GPIO pin</label>
                <input
                  id="add-pin-g"
                  className="field"
                  type="number"
                  min={0}
                  max={48}
                  value={pin2}
                  placeholder="e.g. 5"
                  onChange={(e) => setPin2(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && save()}
                  style={{ marginBottom: 8 }}
                />
                <label className="field-label" htmlFor="add-pin-b">Blue GPIO pin</label>
                <input
                  id="add-pin-b"
                  className="field"
                  type="number"
                  min={0}
                  max={48}
                  value={pin3}
                  placeholder="e.g. 6"
                  onChange={(e) => setPin3(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && save()}
                />
              </>
            ) : (
              <>
                <label className="field-label" htmlFor="add-pin">GPIO pin</label>
                <input
                  id="add-pin"
                  className="field"
                  type="number"
                  min={0}
                  max={48}
                  value={pin1}
                  placeholder="e.g. 4"
                  onChange={(e) => setPin1(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && save()}
                />
              </>
            )}
          </div>
        </div>

        {err && <p className="modal__err">{err}</p>}
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !name.trim() || !pin1 || (type === 'rgb' && (!pin2 || !pin3))}
            onClick={save}
          >
            {busy ? 'Adding…' : 'Add device'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
