import { useState } from 'react'
import { CheckCircle2, Loader, Send, Terminal, XCircle } from 'lucide-react'
import { useSmartRoom } from '../../hooks/useSmartRoom'
import { apiBaseUrl } from '../../api/smartRoomApi'

const ENDPOINTS = [
  {
    id: 'status',
    method: 'GET',
    path: '/api/status',
    summary: 'Room status — nodes online, device count, mode, uptime',
  },
  {
    id: 'devices',
    method: 'GET',
    path: '/api/devices',
    summary: 'Every device, full shape — the dashboard’s primary feed',
  },
  {
    id: 'mode',
    method: 'GET',
    path: '/api/mode',
    summary: 'Current automation mode (smart / manual)',
  },
  {
    id: 'setMode',
    method: 'POST',
    path: '/api/mode',
    summary: 'Switch automation mode',
    body: { mode: 'smart' },
    mutates: true,
  },
  {
    id: 'history',
    method: 'GET',
    path: '/api/devices/{id}/history',
    summary: '24 h of sensor readings for one device',
    needsDevice: true,
  },
  {
    id: 'command',
    method: 'POST',
    path: '/api/devices/{id}/command',
    summary: 'Validate + queue a command for one device (the node executes it)',
    body: { command: 'power', value: true },
    needsDevice: true,
    mutates: true,
  },
  {
    id: 'add',
    method: 'POST',
    path: '/api/devices',
    summary: 'Add a device — the backend generates the permanent id',
    body: { name: 'Desk lamp', type: 'light', pin: 16 },
    mutates: true,
  },
]

const METHOD_TONE = {
  GET: 'm--get',
  POST: 'm--post',
  PATCH: 'm--patch',
  DELETE: 'm--delete',
}

function pretty(body) {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

export default function ApiPlayground() {
  const { devices } = useSmartRoom()
  const [endpoint, setEndpoint] = useState(ENDPOINTS[0])
  const [deviceId, setDeviceId] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const pick = (ep) => {
    setEndpoint(ep)
    setResult(null)
    setBody(ep.body ? JSON.stringify(ep.body, null, 2) : '')
    if (ep.needsDevice) {
      const sensor = devices.find((d) => d.type === 'sensor')
      const first = devices[0]
      setDeviceId((sensor || first)?.id || '')
    }
  }

  const send = async () => {
    const path = endpoint.needsDevice
      ? endpoint.path.replace('{id}', deviceId.trim() || '{id}')
      : endpoint.path
    const t0 = performance.now()
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch(`${apiBaseUrl}${path}`, {
        method: endpoint.method,
        headers: { 'Content-Type': 'application/json' },
        body: endpoint.method !== 'GET' ? body : undefined,
      })
      const text = await res.text()
      const ms = Math.round(performance.now() - t0)
      let parsed
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = text
      }
      setResult({ ok: res.ok, status: res.status, ms, body: typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2) })
    } catch (e) {
      setResult({
        ok: false,
        status: 0,
        ms: Math.round(performance.now() - t0),
        body: `Network error: ${e.message}\n\nIs the backend running? This page talks to ${apiBaseUrl || 'the same origin (nginx → backend)'}.`,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="play">
      <div className="play__intro">
        <h3>API playground</h3>
        <p>
          Every endpoint the backend exposes, tryable against the live room. Requests go straight
          to <code>{apiBaseUrl || 'this origin'}</code> — a write actually changes state.
        </p>
      </div>

      <div className="play__cols">
        <div className="play__list">
          {ENDPOINTS.map((ep) => (
            <button
              key={ep.id}
              type="button"
              className={`play__ep ${endpoint.id === ep.id ? 'play__ep--active' : ''}`}
              onClick={() => pick(ep)}
            >
              <span className={`m ${METHOD_TONE[ep.method]}`}>{ep.method}</span>
              <span className="play__path">{ep.path}</span>
              {ep.mutates && <span className="play__mut" title="This call writes to the room">write</span>}
            </button>
          ))}
        </div>

        <div className="play__work">
          <div className="play__req">
            <div className="play__reqline">
              <span className={`m ${METHOD_TONE[endpoint.method]}`}>{endpoint.method}</span>
              <code className="play__pathbig">{endpoint.path}</code>
            </div>
            <p className="play__summary">{endpoint.summary}</p>

            {endpoint.needsDevice && (
              <div>
                <label className="field-label" htmlFor="play-device">Device id</label>
                <input
                  id="play-device"
                  className="field"
                  value={deviceId}
                  list="play-devices"
                  placeholder="e.g. light_01"
                  onChange={(e) => setDeviceId(e.target.value)}
                />
                <datalist id="play-devices">
                  {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </datalist>
              </div>
            )}

            {endpoint.body && (
              <div>
                <label className="field-label" htmlFor="play-body">Request body</label>
                <textarea
                  id="play-body"
                  className="field play__body"
                  rows={5}
                  spellCheck="false"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>
            )}

            <button type="button" className="btn btn--primary play__send" onClick={send} disabled={busy}>
              {busy ? <Loader size={14} className="spin" /> : <Send size={14} strokeWidth={2.4} />}
              {busy ? 'Sending…' : 'Send request'}
            </button>
          </div>

          <div className="play__res">
            <div className="play__reshead">
              <span className="play__reslabel"><Terminal size={13} strokeWidth={2} /> response</span>
              {result && (
                <span className="play__meta">
                  <span className={`play__code ${result.ok ? 'play__code--ok' : 'play__code--bad'}`}>
                    {result.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {result.status || 'ERR'}
                  </span>
                  <span>{result.ms} ms</span>
                </span>
              )}
            </div>
            {result ? (
              <pre className="play__json">{result.body}</pre>
            ) : (
              <p className="play__empty">Pick an endpoint and hit Send — the response lands here.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
