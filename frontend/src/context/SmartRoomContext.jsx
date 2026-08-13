import { createContext, useCallback, useEffect, useRef, useState } from 'react'
import { smartRoomApi } from '../api/smartRoomApi'

export const SmartRoomContext = createContext(null)

export function SmartRoomProvider({ children }) {
  const [devices, setDevices] = useState([])
  const [status, setStatus] = useState(null)
  const [mode, setModeState] = useState('manual')
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const devicesRef = useRef([])

  const updateDevices = useCallback((fn) => {
    setDevices((prev) => {
      const next = fn(prev)
      devicesRef.current = next
      return next
    })
  }, [])

  const upsertDevice = useCallback((updated) => {
    updateDevices((prev) =>
      prev.some((d) => d.id === updated.id)
        ? prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d))
        : [...prev, updated],
    )
  }, [updateDevices])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [deviceRes, statusRes] = await Promise.all([
        smartRoomApi.getDevices(),
        smartRoomApi.getStatus(),
      ])
      updateDevices(() => deviceRes.devices)
      setStatus(statusRes)
      setModeState(statusRes.mode ?? 'manual')
      setConnected(true)
    } catch (e) {
      setError(`Can't reach the room${e.message ? ` — ${e.message}` : ''}.`)
      setConnected(false)
    } finally {
      setLoading(false)
    }
  }, [updateDevices])

  useEffect(() => {
    load()
  }, [load])

  // Real-time path: live updates arrive over the WebSocket.
  useEffect(() => {
    let ws
    let closed = false
    let retry

    const connect = () => {
      ws = new WebSocket(smartRoomApi.websocketUrl)
      ws.onopen = () => setConnected(true)
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.event === 'node_status') {
            setStatus((prev) => ({
              ...prev,
              online: msg.online,
              nodeId: msg.nodeId,
            }))
          }
          if (msg.event === 'device_update' && msg.device) upsertDevice(msg.device)
          if (msg.event === 'device_renamed' && msg.device) upsertDevice(msg.device)
          if (msg.event === 'device_removed' && msg.deviceId) {
            updateDevices((prev) => prev.filter((d) => d.id !== msg.deviceId))
          }
          if (msg.event === 'device_offline' && msg.deviceId) {
            updateDevices((prev) =>
              prev.map((d) =>
                d.id === msg.deviceId ? { ...d, online: false, lastSeen: 'just now' } : d,
              ),
            )
          }
        } catch {
          /* ignore malformed frames */
        }
      }
      ws.onclose = () => {
        setConnected(false)
        if (!closed) retry = setTimeout(connect, 3000)
      }
      ws.onerror = () => ws.close()
    }

    connect()
    return () => {
      closed = true
      clearTimeout(retry)
      ws?.close()
    }
  }, [upsertDevice, updateDevices])

  // --- actions -----------------------------------------------------------

  // No optimistic flips: the plan says a command only counts once the
  // backend confirms it. The card shows a pending state meanwhile.
  const sendCommand = useCallback(
    async (deviceId, command, value) => {
      updateDevices((prev) =>
        prev.map((d) => (d.id === deviceId ? { ...d, pending: { command } } : d)),
      )
      try {
        const res = await smartRoomApi.sendDeviceCommand(deviceId, command, value)
        upsertDevice({ ...res.device, pending: undefined })
        return res
      } catch (e) {
        updateDevices((prev) =>
          prev.map((d) => (d.id === deviceId ? { ...d, pending: undefined } : d)),
        )
        throw e
      }
    },
    [updateDevices, upsertDevice],
  )

  const renameDevice = useCallback(
    async (deviceId, name) => {
      const res = await smartRoomApi.updateDevice(deviceId, { name })
      upsertDevice({ ...res.device })
      return res
    },
    [upsertDevice],
  )

  const addDevice = useCallback(
    async (payload) => {
      const res = await smartRoomApi.addDevice(payload)
      upsertDevice({ ...res.device })
      return res
    },
    [upsertDevice],
  )

  const removeDevice = useCallback(
    async (deviceId) => {
      const res = await smartRoomApi.removeDevice(deviceId)
      updateDevices((prev) => prev.filter((d) => d.id !== deviceId))
      return res
    },
    [updateDevices],
  )

  const setMode = useCallback(async (next) => {
    setModeState(next)
    try {
      await smartRoomApi.setMode(next)
    } catch (e) {
      setError(`Couldn't switch modes — ${e.message}`)
    }
  }, [])

  const value = {
    devices,
    status,
    mode,
    connected,
    loading,
    error,
    sendCommand,
    renameDevice,
    addDevice,
    removeDevice,
    setMode,
    refresh: load,
    api: smartRoomApi,
  }

  return <SmartRoomContext.Provider value={value}>{children}</SmartRoomContext.Provider>
}
