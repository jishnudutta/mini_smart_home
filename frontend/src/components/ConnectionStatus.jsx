export default function ConnectionStatus({ label, online, detail }) {
  const tone = online ? '' : ' pill--off'
  return (
    <span className={`pill${tone}`}>
      <span className="pill__dot" aria-hidden="true" />
      {label}
      {detail ? <span className="pill__detail">{detail}</span> : null}
    </span>
  )
}
