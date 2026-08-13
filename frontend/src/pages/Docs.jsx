import { useState } from 'react'
import { ArrowLeft, BookOpen, Cable, CircleHelp, Terminal } from 'lucide-react'
import CircuitLab from '../components/docs/CircuitLab'
import ApiPlayground from '../components/docs/ApiPlayground'
import SetupGuide from '../components/docs/SetupGuide'
import ConnectionStatus from '../components/ConnectionStatus'
import { useSmartRoom } from '../hooks/useSmartRoom'

const TABS = [
  { id: 'circuit', label: 'Circuit lab', icon: Cable },
  { id: 'playground', label: 'API playground', icon: Terminal },
  { id: 'setup', label: 'Setup guide', icon: CircleHelp },
]

export default function Docs({ onBack }) {
  const { connected, status } = useSmartRoom()
  const [tab, setTab] = useState('circuit')

  return (
    <div className="shell">
      <header className="header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <BookOpen size={16} strokeWidth={2.25} />
          </span>
          <span className="brand__name">Smart Room — docs</span>
          <span className="brand__ver">v0.1</span>
        </div>
        <div className="header__right">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
            <ArrowLeft size={14} strokeWidth={2.25} /> Dashboard
          </button>
          <ConnectionStatus label="api" online={connected} />
          {status?.nodeId ? <ConnectionStatus label="node" online={status.online !== false} detail={status.nodeId} /> : null}
        </div>
      </header>

      <nav className="tabs" role="tablist" aria-label="Documentation sections">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`tabs__btn ${tab === t.id ? 'tabs__btn--active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <Icon size={14} strokeWidth={2.2} />
              {t.label}
            </button>
          )
        })}
      </nav>

      <main>
        {tab === 'circuit' && <CircuitLab />}
        {tab === 'playground' && <ApiPlayground />}
        {tab === 'setup' && (
          <SetupGuide
            onNavigate={(target) => {
              if (target === 'dashboard') onBack()
              else setTab(target)
            }}
          />
        )}
      </main>

      <footer className="sys">
        <span>interactive docs · talks to the same backend as the dashboard</span>
        <span>by Jishworks · Jishnu Dutta ·{' '}
          <a href="https://jishworks.in" target="_blank" rel="noreferrer">jishworks.in</a>
        </span>
        <span className="sys__right">live · {new Date().getFullYear()}</span>
      </footer>
    </div>
  )
}
