export default function ModeSwitch({ mode, onChange }) {
  return (
    <div className="mode" role="group" aria-label="Control mode">
      <button
        type="button"
        className="mode__btn"
        aria-pressed={mode === 'smart'}
        onClick={() => onChange('smart')}
        title="Smart — rules keep the room comfortable"
      >
        Smart
      </button>
      <button
        type="button"
        className="mode__btn"
        aria-pressed={mode === 'manual'}
        onClick={() => onChange('manual')}
        title="Manual — you're in charge"
      >
        Manual
      </button>
    </div>
  )
}
