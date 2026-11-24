import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, dateStr } from '../api'
import { ErrorBox, ProductTag, Badge, useLoad } from '../ui.jsx'
import { useProduct } from '../product.jsx'
import { waLink } from '../util.js'
import MapLinks from './MapLinks.jsx'

const message = (f) =>
  `Hello ${f.contactName || f.account}, this is Sivayaan Technologies following up about ${f.product}. ` +
  'Is this a good time to talk?'

/** Leads due for follow-up today (and overdue), each with a WhatsApp deep link. */
export default function FollowUps({ refreshKey = 0, onChanged, limit = 100 }) {
  const { productId } = useProduct()
  const { data, error, reload } = useLoad(() => api.followups({ productId, limit }), [productId, refreshKey, limit])
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(null)

  const done = async (f) => {
    setBusy(f.id)
    try { await api.followedUp(f.id, { days: 3 }); setErr(null); reload(); onChanged?.() } catch (x) { setErr(x.message) } finally { setBusy(null) }
  }

  if (!data) return <><ErrorBox error={error} /><p className="muted">Loading…</p></>
  return (
    <>
      <ErrorBox error={err || error} />
      {data.items.length === 0 && <p className="muted">Nothing due today. Follow-ups you schedule on leads show up here on their due date.</p>}
      {data.items.map((f) => {
        const link = waLink(f.phone, message(f))
        return (
          <div className="rec followup" key={f.id}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link to={`/accounts/${f.accountId}`}><b>{f.account}</b></Link> <ProductTag name={f.product} color={f.productColor} /> <Badge v={f.priority} />
              <div className="muted">
                {f.contactName ? `${f.contactName} · ` : ''}{f.phone ?? 'no phone on file'} · {f.overdue ? <span style={{ color: 'var(--bad)' }}>overdue since {dateStr(f.followUpDate)}</span> : 'due today'}
              </div>
              {f.nextAction && <div className="muted" style={{ marginTop: 2 }}>{f.nextAction}</div>}
              <MapLinks latitude={f.latitude} longitude={f.longitude} name={f.account} area={f.landmark} />
            </div>
            <div style={{ whiteSpace: 'nowrap', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              {link
                ? <a className="btn wa" href={link} target="_blank" rel="noopener noreferrer">Message on WhatsApp</a>
                : <button className="sm" disabled title="No valid phone number on file">Message on WhatsApp</button>}
              <button className="sm" disabled={busy === f.id} onClick={() => done(f)} title="Log the follow-up and schedule the next one in 3 days">Done</button>
            </div>
          </div>
        )
      })}
      {data.total > data.items.length && <p className="muted">Showing {data.items.length} of {data.total}.</p>}
    </>
  )
}
