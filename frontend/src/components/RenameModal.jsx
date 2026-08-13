import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSmartRoom } from '../hooks/useSmartRoom'

export default function RenameModal({ device, onClose }) {
  const { renameDevice } = useSmartRoom()
  const [name, setName] = useState(device.name)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
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
    if (!trimmed) {
      setErr('Give it a name.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await renameDevice(device.id, trimmed)
      onClose()
    } catch (e) {
      setErr(e.message || "Couldn't save the name.")
      setBusy(false)
    }
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-title"
      >
        <h2 className="modal__title" id="rename-title">Rename device</h2>
        <p className="modal__sub">
          The ID stays <code>{device.id}</code> — only the label changes.
        </p>
        <input
          ref={inputRef}
          className={`field${err ? ' field--err' : ''}`}
          value={name}
          maxLength={40}
          aria-label="Device name"
          aria-invalid={Boolean(err)}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
          }}
        />
        {err && <p className="modal__err">{err}</p>}
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" disabled={busy || !name.trim()} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
