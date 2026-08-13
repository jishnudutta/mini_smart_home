// Single home for every backend call. Components never build URLs.
// The backend is the only source of truth: the dashboard renders exactly
// what real nodes register — there is no test data in this app.

// Empty VITE_API_URL means same-origin (the nginx gateway proxies /api and
// /ws to the backend). Dev builds set VITE_API_URL in .env.
export const apiBaseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

const API_URL = apiBaseUrl

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body.detail) detail = body.detail
      if (body.error) detail = body.error
    } catch {
      /* keep the default message */
    }
    throw new Error(detail)
  }
  return res.json()
}

export const smartRoomApi = {
  getDevices() {
    return request('/api/devices')
  },

  getStatus() {
    return request('/api/status')
  },

  sendDeviceCommand(deviceId, command, value) {
    return request(`/api/devices/${deviceId}/command`, {
      method: 'POST',
      body: JSON.stringify({ command, value }),
    })
  },

  updateDevice(deviceId, patch) {
    return request(`/api/devices/${deviceId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },

  getDeviceHistory(deviceId) {
    return request(`/api/devices/${deviceId}/history`)
  },

  // Add a device from the dashboard. The backend generates the id; we only
  // say what it is (name, type) and which GPIO pin the hardware is wired to.
  addDevice(payload) {
    return request('/api/devices', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  removeDevice(deviceId) {
    return request(`/api/devices/${deviceId}`, { method: 'DELETE' })
  },

  setMode(mode) {
    return request('/api/mode', { method: 'POST', body: JSON.stringify({ mode }) })
  },

  get websocketUrl() {
    return `${API_URL.replace(/^http/, 'ws')}/ws`
  },
}
