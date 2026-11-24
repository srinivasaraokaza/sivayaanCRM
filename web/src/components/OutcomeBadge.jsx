import { useProduct } from '../product.jsx'

/** Coloured label for a visit outcome code (Interested, Requested a demo, Not interested, ...). */
export default function OutcomeBadge({ code }) {
  const { meta } = useProduct()
  if (!code) return <span className="badge tone-neutral">Visited</span>
  const o = meta.visitOutcomes.find((x) => x.code === code)
  return <span className={`badge tone-${o?.tone ?? 'neutral'}`}>{o?.label ?? code}</span>
}
