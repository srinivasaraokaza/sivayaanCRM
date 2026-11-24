// Small dependency-free charts. Colours come from CSS variables so they follow the theme.

export function BarList({ rows, fmt = (v) => v, empty = 'No data yet.' }) {
  if (!rows.length || rows.every((r) => !r.value)) return <p className="muted">{empty}</p>
  const max = Math.max(1, ...rows.map((r) => r.value))
  return rows.map((r) => (
    <div className="bar" key={r.label} title={r.sub ? `${r.label}: ${r.sub}` : r.label}>
      <div className="lbl" style={{ width: 120 }}>{r.label}</div>
      <div className="track"><div className="fill" style={{ width: `${(r.value / max) * 100}%` }} /></div>
      <div className="v" style={{ width: 'auto', minWidth: 70 }}>{r.sub ?? fmt(r.value)}</div>
    </div>
  ))
}

export function ColumnChart({ data, labelKey, valueKey, fmt, empty = 'No data yet.' }) {
  if (!data.length || data.every((d) => !d[valueKey])) return <p className="muted">{empty}</p>
  const W = 600, H = 220, top = 22, bottom = 28, left = 6, right = 6
  const max = Math.max(1, ...data.map((d) => d[valueKey]))
  const slot = (W - left - right) / data.length
  const bw = slot * 0.62
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly revenue" style={{ width: '100%', height: 'auto' }}>
      <line x1={left} x2={W - right} y1={H - bottom} y2={H - bottom} stroke="var(--line)" />
      {data.map((d, i) => {
        const h = ((H - top - bottom) * d[valueKey]) / max
        const x = left + i * slot + (slot - bw) / 2
        const y = H - bottom - h
        return (
          <g key={d[labelKey]}>
            <rect x={x} y={y} width={bw} height={Math.max(h, d[valueKey] ? 2 : 0)} rx="3" fill="var(--brand)">
              <title>{`${d[labelKey]}: ${fmt(d[valueKey])}`}</title>
            </rect>
            {d[valueKey] > 0 && <text x={x + bw / 2} y={y - 5} textAnchor="middle" fontSize="10" fill="var(--muted)">{fmt(d[valueKey])}</text>}
            <text x={x + bw / 2} y={H - 10} textAnchor="middle" fontSize="10" fill="var(--muted)">{d[labelKey].split(' ')[0]}</text>
          </g>
        )
      })}
    </svg>
  )
}
