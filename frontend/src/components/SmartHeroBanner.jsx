import { useEffect, useState } from 'react'
import { Sun, Moon, Sunset, Sunrise, Zap, Thermometer, ShieldCheck, Sparkles, PowerOff, Power } from 'lucide-react'
import { useSmartRoom } from '../hooks/useSmartRoom'

function getGreeting(hour) {
  if (hour >= 5 && hour < 12) return { text: 'Good Morning', icon: Sunrise }
  if (hour >= 12 && hour < 17) return { text: 'Good Afternoon', icon: Sun }
  if (hour >= 17 && hour < 22) return { text: 'Good Evening', icon: Sunset }
  return { text: 'Good Night', icon: Moon }
}

export default function SmartHeroBanner() {
  const { devices, status, mode, sendCommand, setMode } = useSmartRoom()
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const hour = now.getHours()
  const greeting = getGreeting(hour)
  const GreetingIcon = greeting.icon

  const sensor = devices.find((d) => d.type === 'sensor')
  const powerDevices = devices.filter((d) => d.capabilities?.includes('power'))
  const activeCount = powerDevices.filter((d) => d.state?.power).length

  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const dateStr = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })

  const turnAllOn = async () => {
    for (const d of powerDevices) {
      try {
        await sendCommand(d.id, 'power', true)
      } catch {
        /* proceed */
      }
    }
  }

  const turnAllOff = async () => {
    for (const d of powerDevices) {
      try {
        await sendCommand(d.id, 'power', false)
      } catch {
        /* proceed */
      }
    }
  }

  const setAmbientScene = async () => {
    for (const d of powerDevices) {
      try {
        if (d.type === 'rgb') {
          await sendCommand(d.id, 'power', true)
          await sendCommand(d.id, 'color', '#8b7cf6')
        } else {
          await sendCommand(d.id, 'power', false)
        }
      } catch {
        /* proceed */
      }
    }
  }

  return (
    <div className="hero-banner">
      <div className="hero-banner__content">
        <div className="hero-banner__greetings">
          <div className="greeting-badge">
            <GreetingIcon size={18} className="greeting-icon" />
            <span>{greeting.text}</span>
          </div>
          <h1 className="hero-banner__title">Smart Room Control</h1>
          <p className="hero-banner__time">
            <span className="time-digit">{timeStr}</span>
            <span className="time-sep">•</span>
            <span className="date-text">{dateStr}</span>
          </p>
        </div>

        <div className="hero-banner__stats">
          <div className="hero-stat">
            <div className="hero-stat__icon hero-stat__icon--amber">
              <Zap size={16} />
            </div>
            <div className="hero-stat__info">
              <span className="hero-stat__label">Active Devices</span>
              <span className="hero-stat__value">
                {activeCount} <small>/ {powerDevices.length} ON</small>
              </span>
            </div>
          </div>

          <div className="hero-stat">
            <div className="hero-stat__icon hero-stat__icon--teal">
              <Thermometer size={16} />
            </div>
            <div className="hero-stat__info">
              <span className="hero-stat__label">Atmosphere</span>
              <span className="hero-stat__value">
                {sensor?.data?.temperature != null ? `${sensor.data.temperature.toFixed(1)}°C` : '--'}
                <small>{sensor?.data?.humidity != null ? ` · ${sensor.data.humidity}% RH` : ''}</small>
              </span>
            </div>
          </div>

          <div className="hero-stat">
            <div className="hero-stat__icon hero-stat__icon--blue">
              <ShieldCheck size={16} />
            </div>
            <div className="hero-stat__info">
              <span className="hero-stat__label">ESP32 Hardware</span>
              <span className="hero-stat__value">
                {status?.online ? 'Connected' : 'Offline'}
                <small> · {status?.nodeId || 'esp32_room_01'}</small>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="hero-banner__actions">
        <span className="actions-title">Quick Scenes</span>
        <div className="scene-buttons">
          <button type="button" className="scene-btn" onClick={turnAllOn} title="Turn on all lights and relays">
            <Power size={14} /> All On
          </button>
          <button type="button" className="scene-btn" onClick={turnAllOff} title="Turn off all lights and relays">
            <PowerOff size={14} /> All Off
          </button>
          <button
            type="button"
            className="scene-btn scene-btn--accent"
            onClick={setAmbientScene}
            title="Set RGB light to violet glow & turn off main lights"
          >
            <Sparkles size={14} /> Night Glow
          </button>
        </div>
      </div>
    </div>
  )
}
