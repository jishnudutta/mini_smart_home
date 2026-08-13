import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('smartroom.theme')
    if (saved) return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('smartroom.theme', theme)
  }, [theme])

  const toggle = () => {
    setTheme((prev) => (prev === 'night' ? 'day' : 'night'))
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      title={`Switch to ${theme === 'night' ? 'Day' : 'Night'} Mode`}
      aria-label={`Switch to ${theme === 'night' ? 'Day' : 'Night'} Mode`}
    >
      <span className={`theme-toggle__icon ${theme === 'day' ? 'is-active' : ''}`}>
        <Sun size={14} strokeWidth={2.25} />
      </span>
      <span className={`theme-toggle__icon ${theme === 'night' ? 'is-active' : ''}`}>
        <Moon size={14} strokeWidth={2.25} />
      </span>
      <span className="theme-toggle__label">{theme === 'night' ? 'Night' : 'Day'}</span>
    </button>
  )
}
