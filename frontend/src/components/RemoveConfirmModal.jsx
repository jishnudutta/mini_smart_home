import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSmartRoom } from '../hooks/useSmartRoom'

export default function RemoveConfirmModal({ device, onClose }) {
  const { removeDevice } = useSmartRoom()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const remove = async () => {
    setBusy(true)
    setErr(null)
    try {
      await removeDevice(device.id)
      onClose()
    } catch (e) {
      setErr(e.message || "Couldn't remove the device.")
      setBusy(false)
    }
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="remove-title">
        <h2 className="modal__title" id="remove-title">Remove {device.name}?</h2>
        <p className="modal__sub">
          <code>{device.id}</code> and its history will be deleted from the room. The id is never
          reused. This can't be undone.
        </p>
        {err && <p className="modal__err">{err}</p>}
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--danger" disabled={busy} onClick={remove}>
            {busy ? 'Removing…' : 'Remove device'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
