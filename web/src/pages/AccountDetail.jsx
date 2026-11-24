import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, dateInput, dateStr, money } from '../api'
import { Badge, ErrorBox, Modal, ProductTag, useLoad } from '../ui.jsx'
import { useProduct } from '../product.jsx'
import { segmentsOf } from '../util.js'
import MapLinks from '../components/MapLinks.jsx'
import VisitModal from '../components/VisitModal.jsx'
import OutcomeBadge from '../components/OutcomeBadge.jsx'
import { AccountModal } from './Accounts.jsx'
import { NewLeadModal } from './Leads.jsx'

export function ContactModal({ accountId, contact, onClose, onSaved }) {
  const [f, setF] = useState(contact ?? { name: '', title: '', phone: '', email: '', isDecisionMaker: false })
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    try {
      if (contact) await api.updateContact(contact.id, f)
      else await api.createContact({ ...f, accountId })
      onSaved()
    } catch (x) { setErr(x.message) }
  }
  return (
    <Modal title={contact ? 'Edit contact' : 'New contact'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ErrorBox error={err} />
        <label>Name<input required value={f.name} onChange={set('name')} /></label>
        <label>Title / role<input value={f.title ?? ''} onChange={set('title')} placeholder="Owner, Administrator…" /></label>
        <div className="row">
          <label>Phone<input value={f.phone ?? ''} onChange={set('phone')} /></label>
          <label>Email<input type="email" value={f.email ?? ''} onChange={set('email')} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={f.isDecisionMaker} onChange={(e) => setF({ ...f, isDecisionMaker: e.target.checked })} /> Decision maker</label>
        <div className="actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary">Save</button></div>
      </form>
    </Modal>
  )
}

export function DealModal({ accountId, deal, onClose, onSaved }) {
  const { meta, productId } = useProduct()
  const firstProduct = meta.products.find((p) => String(p.id) === String(productId)) ?? meta.products[0]
  const [f, setF] = useState(deal
    ? { ...deal, expectedCloseDate: dateInput(deal.expectedCloseDate) }
    : { title: '', productId: firstProduct.id, module: '', segment: '', units: 1, value: firstProduct.defaultDealValue, stage: 'Prospecting', closeProbability: 10, expectedCloseDate: '', notes: '' })
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    const body = { ...f, segment: f.segment || null, units: Math.max(1, Number(f.units) || 1), productId: Number(f.productId), value: Number(f.value), closeProbability: Number(f.closeProbability), expectedCloseDate: f.expectedCloseDate || null }
    try {
      if (deal) await api.updateDeal(deal.id, body)
      else await api.createDeal({ ...body, accountId })
      onSaved()
    } catch (x) { setErr(x.message) }
  }
  return (
    <Modal title={deal ? 'Edit deal' : 'New deal'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ErrorBox error={err} />
        <label>Title<input required value={f.title} onChange={set('title')} /></label>
        <div className="row">
          <label>Product<select value={f.productId} onChange={set('productId')}>{meta.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>Stage<select value={f.stage} onChange={set('stage')}>{meta.stages.map((p) => <option key={p}>{p}</option>)}</select></label>
        </div>
        <label>Package / module<input value={f.module ?? ''} onChange={set('module')} /></label>
        <div className="row">
          <label>Segment (e.g. Clinic, Pharmacy, Lab)
            <input list="deal-segments" value={f.segment ?? ''} onChange={set('segment')} />
            <datalist id="deal-segments">{segmentsOf(meta.products.find((p) => String(p.id) === String(f.productId))).map((s) => <option key={s} value={s} />)}</datalist>
          </label>
          <label>Units (sites / seats)<input type="number" min="1" value={f.units} onChange={set('units')} /></label>
        </div>
        <div className="row">
          <label>Value (INR)<input type="number" min="0" value={f.value} onChange={set('value')} /></label>
          <label>Probability %<input type="number" min="0" max="100" value={f.closeProbability} onChange={set('closeProbability')} /></label>
        </div>
        <label>Expected close<input type="date" value={f.expectedCloseDate} onChange={set('expectedCloseDate')} /></label>
        <label>Notes<textarea value={f.notes ?? ''} onChange={set('notes')} /></label>
        <div className="actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary">Save</button></div>
      </form>
    </Modal>
  )
}

function OrderModal({ accountId, onClose, onSaved }) {
  const { meta, productId } = useProduct()
  const first = meta.products.find((p) => String(p.id) === String(productId)) ?? meta.products[0]
  const [f, setF] = useState({ productId: first.id, item: '', quantity: 1, amount: '', orderDate: dateInput(new Date()), notes: '' })
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    try {
      await api.createOrder({ ...f, accountId, productId: Number(f.productId), quantity: Number(f.quantity) || 1, amount: Number(f.amount), item: f.item || null })
      onSaved()
    } catch (x) { setErr(x.message) }
  }
  return (
    <Modal title="Record order" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ErrorBox error={err} />
        <label>Product<select value={f.productId} onChange={set('productId')}>{meta.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Item sold (optional — used in top-selling)<input value={f.item} onChange={set('item')} placeholder="e.g. Kanchipuram saree, Annual HMS licence" /></label>
        <div className="row">
          <label>Quantity<input type="number" min="1" value={f.quantity} onChange={set('quantity')} /></label>
          <label>Amount (INR)<input type="number" min="0" step="any" required value={f.amount} onChange={set('amount')} /></label>
        </div>
        <label>Order date<input type="date" required value={f.orderDate} onChange={set('orderDate')} /></label>
        <label>Notes<textarea value={f.notes} onChange={set('notes')} /></label>
        <div className="actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary">Save order</button></div>
      </form>
    </Modal>
  )
}

function ActivityModal({ accountId, onClose, onSaved }) {
  const [f, setF] = useState({ type: 'Call', subject: '', notes: '' })
  const [err, setErr] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    try { await api.createActivity({ ...f, accountId }); onSaved() } catch (x) { setErr(x.message) }
  }
  return (
    <Modal title="Log activity" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ErrorBox error={err} />
        <label>Type<select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{['Call', 'Email', 'Meeting', 'WhatsApp', 'Note'].map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>Subject<input required value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></label>
        <label>Notes<textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
        <div className="actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary">Log</button></div>
      </form>
    </Modal>
  )
}

export default function AccountDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { data: a, error, loading, reload } = useLoad(() => api.account(id), [id])
  const [modal, setModal] = useState(null)
  const done = () => { setModal(null); reload() }

  if (loading && !a) return <p className="muted">Loading…</p>
  if (error) return <><ErrorBox error={error} /><Link to="/accounts">← Accounts</Link></>
  if (!a) return null

  const del = async (fn, label) => { if (confirm(`Delete ${label}?`)) { await fn(); reload() } }
  const removeAccount = async () => {
    if (!confirm(`Delete ${a.name} and all its contacts, leads, deals and activity?`)) return
    await api.deleteAccount(a.id)
    nav('/accounts')
  }
  const hasIntel = a.tier != null

  return (
    <>
      <p><Link to="/accounts">← Accounts</Link></p>
      <div className="head">
        <div>
          <h2>{a.name}</h2>
          <span className="muted">{[a.industry, a.category, a.landmark, a.city, a.phone, a.email].filter(Boolean).join(' · ')}</span>
          <div style={{ marginTop: 6 }}>
            <MapLinks latitude={a.latitude} longitude={a.longitude} name={a.name} area={a.landmark ?? a.city} />
            {a.latitude != null && a.longitude != null && <span className="muted"> {Number(a.latitude).toFixed(6)}, {Number(a.longitude).toFixed(6)}</span>}
            {a.latitude == null && <span className="muted"> No coordinates saved — Map searches by name. Use Edit to add them.</span>}
          </div>
        </div>
        <div>
          <button onClick={() => setModal({ t: 'account' })}>Edit</button>{' '}
          <button className="primary" onClick={() => setModal({ t: 'visit' })} disabled={a.leads.every((l) => l.converted) && a.leads.length > 0} title="Record what happened at a field visit">Record visit</button>{' '}
          <button onClick={() => setModal({ t: 'activity' })}>Log call / note</button>{' '}
          <button onClick={() => setModal({ t: 'contact' })}>+ Contact</button>{' '}
          <button onClick={() => setModal({ t: 'lead' })}>+ Lead</button>{' '}
          <button onClick={() => setModal({ t: 'order' })}>+ Order</button>{' '}
          <button className="primary" onClick={() => setModal({ t: 'deal' })}>+ Deal</button>
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <h3>Leads ({a.leads.length})</h3>
          {a.leads.length === 0 && <p className="muted">No leads for this account yet.</p>}
          {a.leads.map((l) => (
            <div className="rec" key={l.id}>
              <ProductTag name={l.product.name} color={l.product.color} /> <Badge v={l.converted ? 'Converted' : l.status} /> <Badge v={l.priority} />
              <div className="muted">Follow-up {dateStr(l.followUpDate)}{l.source ? ` · ${l.source}` : ''}{l.visits ? ` · ${l.visits} visits` : ''}</div>
              {l.nextAction && <div>{l.nextAction}</div>}
              {!l.converted && <button className="sm danger" onClick={() => del(() => api.deleteLead(l.id), 'this lead')}>Delete</button>}
            </div>
          ))}
        </div>
        <div className="panel">
          <h3>Deals ({a.deals.length})</h3>
          {a.deals.length === 0 && <p className="muted">No deals yet.</p>}
          {a.deals.map((d) => (
            <div className="rec" key={d.id}>
              <b>{d.title}</b> <Badge v={d.stage} />
              <div className="muted"><ProductTag name={d.product.name} color={d.product.color} /> {d.module ? `${d.module} · ` : ''}{money(d.value)} · {d.closeProbability}%</div>
              <button className="sm" onClick={() => setModal({ t: 'deal', d })}>Edit</button>{' '}
              <button className="sm danger" onClick={() => del(() => api.deleteDeal(d.id), d.title)}>Delete</button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <h3>Orders ({a.orders.length}){a.orders.length > 0 && <span className="muted"> · {money(a.orders.reduce((s, o) => s + o.amount, 0))} total</span>}</h3>
        {a.orders.length === 0 && <p className="muted">No orders yet. Recording an order makes this account a customer.</p>}
        {a.orders.map((o) => (
          <div className="rec" key={o.id}>
            <ProductTag name={o.product.name} color={o.product.color} /> <b>{o.item ?? o.product.name}</b> × {o.quantity} · {money(o.amount)}
            <span className="muted"> · {dateStr(o.orderDate)}</span>
            {o.notes && <div className="muted">{o.notes}</div>}
            {' '}<button className="sm danger" onClick={() => del(() => api.deleteOrder(o.id), 'this order')}>Delete</button>
          </div>
        ))}
      </div>

      {hasIntel && (
        <div className="grid2">
          <div className="panel">
            <h3>Market intelligence</h3>
            <dl className="kv">
              <dt>Opportunity</dt><dd><Badge v={a.opportunityBand} /> {a.opportunity}/100</dd>
              <dt>Digital maturity</dt><dd><Badge v={a.maturityBand} /> {a.digitalMaturity}/100</dd>
              <dt>Competitive position</dt><dd><Badge v={a.competitivePosition} /></dd>
              <dt>Website</dt><dd>{a.website ? <a href={a.website} target="_blank" rel="noreferrer">{a.website.slice(0, 50)}</a> : 'None'}{a.website && a.websiteWorks === 'no' ? ' (not working)' : ''}</dd>
            </dl>
            {a.summary && <p className="muted">{a.summary}</p>}
          </div>
          <div className="panel">
            <h3>Recommended solutions</h3>
            {a.recommendations.length === 0 && <p className="muted">No recommendations on record.</p>}
            {a.recommendations.map((r) => (
              <div className="rec" key={r.id}>
                <Badge v={r.priority} /> <b>{r.title}</b>
                <div className="muted">{r.suggestedAction}</div>
                {r.modules && <div className="muted">Modules: {r.modules} · Effort: {r.effort}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid2">
        <div className="panel">
          <h3>Contacts ({a.contacts.length})</h3>
          {a.contacts.length === 0 && <p className="muted">No contacts yet.</p>}
          {a.contacts.map((c) => (
            <div className="rec" key={c.id}>
              <b>{c.name}</b> {c.isDecisionMaker && <span className="badge Medium">Decision maker</span>}
              <div className="muted">{[c.title, c.phone, c.email].filter(Boolean).join(' · ')}</div>
              <button className="sm" onClick={() => setModal({ t: 'contact', c })}>Edit</button>{' '}
              <button className="sm danger" onClick={() => del(() => api.deleteContact(c.id), c.name)}>Delete</button>
            </div>
          ))}
        </div>
        <div className="panel">
          <h3>Activity</h3>
          {a.activities.length === 0 && <p className="muted">Nothing logged yet.</p>}
          {a.activities.map((x) => (
            <div className="rec" key={x.id}>
              <b>{x.type}</b> {x.outcome && <OutcomeBadge code={x.outcome} />} · {x.subject} <span className="muted">· {dateStr(x.date)}</span>
              {x.notes && <div className="muted">{x.notes}</div>}
              {x.type === 'Visit' && <> <button className="sm danger" onClick={() => del(() => api.deleteActivity(x.id), 'this visit (the lead status and follow-up are not rewound)')}>Delete</button></>}
            </div>
          ))}
        </div>
      </div>
      <p><button className="danger sm" onClick={removeAccount}>Delete account</button></p>

      {modal?.t === 'account' && <AccountModal account={a} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.t === 'lead' && <NewLeadModal accountId={a.id} accountName={a.name} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.t === 'contact' && <ContactModal accountId={a.id} contact={modal.c} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.t === 'deal' && <DealModal accountId={a.id} deal={modal.d} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.t === 'order' && <OrderModal accountId={a.id} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.t === 'visit' && (
        <VisitModal accountId={a.id} accountName={a.name} leads={a.leads.filter((l) => !l.converted).map((l) => ({ id: l.id, product: l.product.name }))}
          onClose={() => setModal(null)} onSaved={done} />
      )}
      {modal?.t === 'activity' && <ActivityModal accountId={a.id} onClose={() => setModal(null)} onSaved={done} />}
    </>
  )
}
