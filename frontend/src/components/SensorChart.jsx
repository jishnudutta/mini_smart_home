import { useEffect, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useSmartRoom } from '../hooks/useSmartRoom'

const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tip">
      <p className="chart-tip__t">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="chart-tip__row">
          <span className={`chart-tip__swatch chart-tip__swatch--${p.dataKey}`} />
          <span>{p.dataKey}</span>
          <b>{p.dataKey === 'temperature' ? `${p.value}°C` : `${p.value}%`}</b>
        </p>
      ))}
    </div>
  )
}

export default function SensorChart({ deviceId }) {
  const { api } = useSmartRoom()
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    setData(null)
    setErr(null)
    api
      .getDeviceHistory(deviceId)
      .then((res) => {
        if (alive) setData(res.readings.map((r) => ({ ...r, time: fmtTime(r.timestamp) })))
      })
      .catch((e) => alive && setErr(e.message))
    return () => {
      alive = false
    }
  }, [api, deviceId])

  return (
    <div className="panel">
      <div className="chart__legend">
        <span className="lg lg--temp">temperature · °C</span>
        <span className="lg lg--hum">humidity · %</span>
      </div>
      {err ? (
        <p className="dcard__err">Couldn't load the history — {err}</p>
      ) : (
        <div className="chart__wrap">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="#e3e9f5" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="time"
                interval={5}
                tick={{ fill: '#7c8aa5', fontSize: 10.5, fontFamily: 'IBM Plex Mono, monospace' }}
                axisLine={{ stroke: '#d8e0ef' }}
                tickLine={false}
              />
              <YAxis
                yAxisId="temp"
                domain={[22, 30]}
                tick={{ fill: '#7c8aa5', fontSize: 10.5, fontFamily: 'IBM Plex Mono, monospace' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="hum"
                orientation="right"
                domain={[55, 80]}
                tick={{ fill: '#7c8aa5', fontSize: 10.5, fontFamily: 'IBM Plex Mono, monospace' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<ChartTip />} />
              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="temperature"
                stroke="#f5a623"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: '#f5a623', stroke: '#ffffff', strokeWidth: 2 }}
              />
              <Line
                yAxisId="hum"
                type="monotone"
                dataKey="humidity"
                stroke="#0ea5e9"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: '#0ea5e9', stroke: '#ffffff', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="panel__foot">last 24 h · sampled every 30 min</p>
    </div>
  )
}
