import { useEffect, useState } from 'react'
import { Check, ChevronDown, Copy, Rocket, Wrench, Zap } from 'lucide-react'

const STORAGE_KEY = 'smartroom.setup'

const STEPS = [
  {
    id: 'backend',
    icon: Zap,
    title: 'Start the backend',
    detail: 'Run it locally for development, or with Docker for a real deployment.',
    options: [
      {
        label: 'Local (development)',
        code: `cd backend\npython -m venv .venv                      # once\n.venv/Scripts/python -m pip install -r requirements.txt\n.venv/Scripts/python run.py               # http://127.0.0.1:8000`,
      },
      {
        label: 'Docker (deployment)',
        code: `# from the repo root — builds backend + dashboard, publishes :9000\ndocker compose up -d --build`,
      },
    ],
    verify: 'curl http://127.0.0.1:8000/api/health   # → {"status":"ok",…}',
  },
  {
    id: 'wire',
    icon: Wrench,
    title: 'Wire the hardware',
    detail: 'The Circuit design lab draws the exact wiring for each component. Nothing is hard-coded — the pin you choose here is what the node drives.',
    link: { label: 'Open the Circuit lab', target: 'circuit' },
  },
  {
    id: 'flash',
    icon: Rocket,
    title: 'Flash the ESP32',
    detail: 'One sketch, fully data-driven. It fetches its device map from the backend — no per-device code.',
    code: `# edit config.h in the sketch folder first:\nconst char* WIFI_SSID = "YOUR_WIFI_SSID";\nconst char* WIFI_PASS = "YOUR_WIFI_PASSWORD";\nconst char* BACKEND_HOST = "192.168.1.50";   // the backend machine's LAN IP\nconst uint16_t BACKEND_PORT = 8000;`,
    options: [
      {
        label: 'Arduino IDE',
        code: 'Tools → Board → ESP32 Dev Module → open smart_room_node.ino → Upload',
      },
      {
        label: 'PlatformIO',
        code: `cd esp32/firmware/smart_room_node\npio run --target upload\npio device monitor -b 115200`,
      },
    ],
    note: 'The backend must listen on the network: BACKEND_HOST=0.0.0.0 (see backend/README.md).',
  },
  {
    id: 'add',
    icon: Zap,
    title: 'Add your first device',
    detail: 'The dashboard is dynamic — the room starts empty and fills with whatever you add. Add a device, name a GPIO pin, and the node picks it up within ~10 s.',
    code: 'Dashboard → Add device → name + type + GPIO pin.\nThe node’s serial log should print "[devices] map refreshed" within ~10 s.',
    link: { label: 'Back to the dashboard', target: 'dashboard' },
  },
  {
    id: 'live',
    icon: Zap,
    title: 'Watch it go live',
    detail: 'Devices flip online the moment the node’s report covers them. Then control them from the dashboard — state arrives over the WebSocket, no refresh.',
    verify: 'curl http://127.0.0.1:8000/api/status   # → {"online":true,"deviceCount":N,…}',
  },
  {
    id: 'deploy',
    icon: Rocket,
    title: 'Go live',
    detail: 'The container stack serves the dashboard and the API from one origin. The ESP32 dials the same published port.',
    code: `docker compose up -d --build\n# dashboard: http://<vps-ip>:9000  ·  API: http://<vps-ip>:9000/api/status`,
    options: [
      {
        label: 'ESP32 → deployed backend',
        code: '# set BACKEND_HOST to the VPS address and reflash\nconst char* BACKEND_HOST = "http://<vps-ip>:9000";',
      },
    ],
    note: 'v0.1 has no authentication — put TLS in front (Caddy / certbot + nginx) and add auth before exposing port 9000 to the public internet.',
  },
]

function copyText(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {})
  }
}

export default function SetupGuide({ onNavigate }) {
  const go = (target) => onNavigate && onNavigate(target)
  const [done, setDone] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    } catch {
      return {}
    }
  })
  const [open, setOpen] = useState('backend')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(done))
  }, [done])

  const toggle = (id) => setDone((d) => ({ ...d, [id]: !d[id] }))
  const doneCount = STEPS.filter((s) => done[s.id]).length
  const allDone = doneCount === STEPS.length

  return (
    <div className="setup">
      <div className="setup__head">
        <div>
          <h3>Setup guide</h3>
          <p>
            From bare repo to a live room in six steps. Check steps off — progress is saved in
            this browser.
          </p>
        </div>
        <div className={`setup__meter ${allDone ? 'setup__meter--done' : ''}`}>
          {allDone ? <Check size={13} strokeWidth={3} /> : null}
          {doneCount}/{STEPS.length}
        </div>
      </div>

      <ol className="setup__list">
        {STEPS.map((step, i) => {
          const Icon = step.icon
          const isDone = !!done[step.id]
          const isOpen = open === step.id
          return (
            <li key={step.id} className={`setup__item ${isDone ? 'setup__item--done' : ''}`}>
              <div className="setup__row">
                <button
                  type="button"
                  className="setup__check"
                  onClick={() => toggle(step.id)}
                  aria-pressed={isDone}
                  aria-label={`Mark "${step.title}" ${isDone ? 'incomplete' : 'complete'}`}
                >
                  {isDone && <Check size={13} strokeWidth={3} />}
                </button>
                <button
                  type="button"
                  className="setup__toggle"
                  onClick={() => setOpen(isOpen ? null : step.id)}
                  aria-expanded={isOpen}
                >
                  <span className="setup__num">{i + 1}</span>
                  <span className="setup__title">
                    <Icon size={14} strokeWidth={2} />
                    {step.title}
                  </span>
                  <ChevronDown size={15} className={`setup__chev ${isOpen ? 'setup__chev--open' : ''}`} />
                </button>
              </div>

              {isOpen && (
                <div className="setup__body">
                  <p className="setup__detail">{step.detail}</p>

                  {step.options && (
                    <div className="setup__opts">
                      {step.options.map((opt) => (
                        <div key={opt.label} className="setup__opt">
                          <div className="setup__opt-label">{opt.label}</div>
                          <CodeBlock code={opt.code} />
                        </div>
                      ))}
                    </div>
                  )}

                  {step.code && !step.options && <CodeBlock code={step.code} />}

                  {step.verify && (
                    <div className="setup__verify">
                      <div className="setup__opt-label">verify</div>
                      <CodeBlock code={step.verify} />
                    </div>
                  )}

                  {step.link && (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => go(step.link.target)}>
                      {step.link.label} →
                    </button>
                  )}

                  {step.note && <p className="setup__note">{step.note}</p>}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function CodeBlock({ code }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    copyText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }
  return (
    <div className="code">
      <pre><code>{code}</code></pre>
      <button type="button" className="code__copy" onClick={copy} aria-label="Copy command">
        {copied ? <Check size={13} strokeWidth={2.8} /> : <Copy size={13} strokeWidth={2} />}
      </button>
    </div>
  )
}
