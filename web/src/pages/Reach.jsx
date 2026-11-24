import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, dateStr } from '../api'
import { Badge, ErrorBox, Pager, ProductTag, useDebounced, useLoad } from '../ui.jsx'
import { useProduct } from '../product.jsx'
import { waLink } from '../util.js'

const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']

const greeting = (r, who) => `Hello ${who || r.account}, this is Sivayaan Technologies. `
const whatsappText = (r) => `${greeting(r, r.whatsappContact)}We'd like to tell you how ${r.product} can help ${r.account}. Is this a good time to talk?`
const mailto = (r) => {
  const subject = `${r.product} for ${r.account} — Sivayaan Technologies`
  const body = `${greeting(r, r.emailContact)}\n\nWe'd like to tell you how ${r.product} can help ${r.account}.\n\nCould we arrange a short call or visit?\n\nRegards,\nSivayaan Technologies`
  return `mailto:${r.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/** Open leads you can reach digitally: WhatsApp (mobile numbers) in one tab, email addresses in the other. */
export default function Reach() {
  const { productId } = useProduct()
  const [channel, setChannel] = useState('whatsapp')
  const [q, setQ] = useState('')
  const [priority, setPriority] = useState('')
  const [page, setPage] = useState(1)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(null)
  const search = useDebounced(q)
  const { data, error, loading, reload } = useLoad(
    () => api.reach({ channel, productId, search, priority, page, pageSize: 25 }),
    [channel, productId, search, priority, page],
  )
  const c = data?.counts

  const sent = async (r) => {
    setBusy(r.leadId)
    try { await api.followedUp(r.leadId, { days: 3, channel: channel === 'email' ? 'Email' : 'WhatsApp' }); setErr(null); reload() } catch (x) { setErr(x.message) } finally { setBusy(null) }
  }

  const tab = (key, label, n) => (
    <button className={channel === key ? 'primary' : ''} onClick={() => { setChannel(key); setPage(1) }}>{label}{n != null ? ` (${n})` : ''}</button>
  )

  return (
    <>
      <div className="head"><h2>Digital reach</h2></div>
      <p className="muted">Open leads you can contact without visiting: by WhatsApp (needs a mobile number — landlines can't use WhatsApp) or by email.</p>
      <div className="tabs">
        {tab('whatsapp', 'WhatsApp', c?.whatsapp)}
        {tab('email', 'Email', c?.email)}
      </div>
      {c && (
        <p className="muted" style={{ marginTop: 0 }}>
          {c.total} open leads: {c.whatsapp} on WhatsApp · {c.email} by email · {c.both} on both · <b>{c.neither}</b> have neither
          {c.landlineOnly > 0 && ` (${c.landlineOnly} only have a landline)`} — those need a visit or a call.
        </p>
      )}
      <div className="filters">
        <input placeholder="Search business…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        <select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1) }}>
          <option value="">Any priority</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}
        </select>
      </div>
      <ErrorBox error={error || err} />
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr><th>Business</th><th>Product</th><th>Priority</th><th>Status</th><th>{channel === 'email' ? 'Email' : 'WhatsApp number'}</th><th>Last contact</th><th>Follow-up</th><th /></tr>
          </thead>
          <tbody>
            {data?.items.map((r) => {
              const link = channel === 'whatsapp' ? waLink(r.whatsapp, whatsappText(r)) : null
              return (
                <tr key={r.leadId}>
                  <td><Link to={`/accounts/${r.accountId}`}>{r.account}</Link><div className="muted">{[r.category, r.landmark].filter(Boolean).join(' · ')}</div></td>
                  <td><ProductTag name={r.product} color={r.productColor} /></td>
                  <td><Badge v={r.priority} /></td>
                  <td><Badge v={r.status} /></td>
                  <td>
                    {channel === 'email' ? r.email : `+91 ${r.whatsapp}`}
                    {(channel === 'email' ? r.emailContact : r.whatsappContact) && <div className="muted">{channel === 'email' ? r.emailContact : r.whatsappContact}</div>}
                  </td>
                  <td>{r.lastContactDate ? dateStr(r.lastContactDate) : <span className="muted">never</span>}</td>
                  <td>{dateStr(r.followUpDate)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {channel === 'email'
                      ? <a className="btn wa" style={{ background: 'var(--brand)', borderColor: 'var(--brand)' }} href={mailto(r)}>Send email</a>
                      : <a className="btn wa" href={link} target="_blank" rel="noopener noreferrer">Message on WhatsApp</a>}{' '}
                    <button className="sm" disabled={busy === r.leadId} onClick={() => sent(r)} title="Log that you contacted them and schedule the next follow-up in 3 days">Mark sent</button>
                  </td>
                </tr>
              )
            })}
            {!loading && data?.items.length === 0 && (
              <tr><td colSpan="8" className="muted">
                {channel === 'email'
                  ? 'No lead has an email address yet. Add one on the account page (Edit) or a contact, enter it when you record a visit, or import a spreadsheet with an Email column.'
                  : 'No leads with a WhatsApp-capable mobile number match.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {data && <Pager page={page} pageSize={25} total={data.total} onPage={setPage} />}
    </>
  )
}
