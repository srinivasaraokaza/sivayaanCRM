import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, dateInput, dateStr } from '../api'
import { Badge, ErrorBox, Modal, Pager, ProductTag, useDebounced, useLoad } from '../ui.jsx'
import { useProduct } from '../product.jsx'
import { segmentsOf } from '../util.js'
import MapLinks from '../components/MapLinks.jsx'

const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']

export function NewLeadModal({ accountId, accountName, onClose, onSaved }) {
  const { meta, productId } = useProduct()
  const [f, setF] = useState({
    productId: productId || String(meta.products[0]?.id ?? ''), name: '', contactName: '', phone: '', email: '', city: '',
    source: meta.leadSources[0], priority: 'Medium', nextAction: '', followUpDate: '', notes: '',
  })
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    try {
      await api.createLead({ ...f, accountId, productId: Number(f.productId), followUpDate: f.followUpDate || null })
      onSaved()
    } catch (x) { setErr(x.message) }
  }
  return (
    <Modal title={accountId ? `New lead — ${accountName}` : 'New lead'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ErrorBox error={err} />
        <label>Product<select value={f.productId} onChange={set('productId')}>{meta.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        {!accountId && (
          <>
            <label>Business / customer name<input required value={f.name} onChange={set('name')} /></label>
            <div className="row">
              <label>Contact person<input value={f.contactName} onChange={set('contactName')} /></label>
              <label>City<input value={f.city} onChange={set('city')} /></label>
            </div>
            <div className="row">
              <label>Phone<input value={f.phone} onChange={set('phone')} /></label>
              <label>Email<input type="email" value={f.email} onChange={set('email')} /></label>
            </div>
          </>
        )}
        <div className="row">
          <label>Source<select value={f.source} onChange={set('source')}>{meta.leadSources.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>Priority<select value={f.priority} onChange={set('priority')}>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}</select></label>
        </div>
        <label>Next action<input value={f.nextAction} onChange={set('nextAction')} /></label>
        <label>Follow-up date<input type="date" value={f.followUpDate} onChange={set('followUpDate')} /></label>
        <label>Notes<textarea value={f.notes} onChange={set('notes')} /></label>
        <div className="actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary">Create lead</button></div>
      </form>
    </Modal>
  )
}

function EditLead({ lead, statuses, sources, onClose, onSaved }) {
  const [f, setF] = useState({ ...lead, followUpDate: dateInput(lead.followUpDate) })
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async (e) => {
    e.preventDefault()
    try {
      await api.updateLead(lead.id, { ...f, followUpDate: f.followUpDate || null })
      onSaved()
    } catch (x) { setErr(x.message) }
  }
  return (
    <Modal title={`Edit lead — ${lead.account} (${lead.product})`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <ErrorBox error={err} />
        <div className="row">
          <label>Status<select value={f.status} onChange={set('status')}>{statuses.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>Priority<select value={f.priority} onChange={set('priority')}>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}</select></label>
        </div>
        <label>Source<select value={f.source ?? ''} onChange={set('source')}><option value="" />{sources.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>Next action<input value={f.nextAction ?? ''} onChange={set('nextAction')} /></label>
        <label>Follow-up date<input type="date" value={f.followUpDate} onChange={set('followUpDate')} /></label>
        <label>Notes<textarea value={f.notes ?? ''} onChange={set('notes')} /></label>
        <div className="actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary">Save</button></div>
      </form>
    </Modal>
  )
}

function ConvertLead({ lead, product, onClose, onDone }) {
  const [f, setF] = useState({ module: '', segment: '', units: 1, value: product?.defaultDealValue ?? 0, title: '' })
  const [err, setErr] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    try {
      await api.convertLead(lead.id, { ...f, segment: f.segment || null, units: Math.max(1, Number(f.units) || 1), value: Number(f.value) })
      onDone()
    } catch (x) { setErr(x.message) }
  }
  return (
    <Modal title={`Convert to deal — ${lead.account}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ErrorBox error={err} />
        <p className="muted">Product: <b>{lead.product}</b></p>
        <label>Package / module (optional)<input value={f.module} onChange={(e) => setF({ ...f, module: e.target.value })} placeholder="e.g. Starter plan, Patient Portal" /></label>
        <div className="row">
          <label>Segment (e.g. Clinic)
            <input list="conv-segments" value={f.segment} onChange={(e) => setF({ ...f, segment: e.target.value })} />
            <datalist id="conv-segments">{segmentsOf(product).map((s) => <option key={s} value={s} />)}</datalist>
          </label>
          <label>Units (sites / seats)<input type="number" min="1" value={f.units} onChange={(e) => setF({ ...f, units: e.target.value })} /></label>
        </div>
        <label>Estimated value (INR)<input type="number" min="0" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></label>
        <label>Deal title (optional)<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <div className="actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary">Create deal</button></div>
      </form>
    </Modal>
  )
}

export default function Leads() {
  const { meta, productId } = useProduct()
  const [f, setF] = useState({ search: '', status: '', priority: '', overdue: '' })
  const [page, setPage] = useState(1)
  const search = useDebounced(f.search)
  const { data, error, loading, reload } = useLoad(
    () => api.leads({ ...f, search, productId, page, pageSize: 25 }),
    [search, f.status, f.priority, f.overdue, productId, page],
  )
  const [edit, setEdit] = useState(null)
  const [conv, setConv] = useState(null)
  const [adding, setAdding] = useState(false)
  const upd = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1) }
  const today = new Date()

  return (
    <>
      <div className="head"><h2>Leads</h2><button className="primary" onClick={() => setAdding(true)}>+ New lead</button></div>
      <div className="filters">
        <input placeholder="Search business…" value={f.search} onChange={upd('search')} />
        <select value={f.status} onChange={upd('status')}><option value="">All statuses</option>{meta.leadStatuses.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={f.priority} onChange={upd('priority')}><option value="">All priorities</option>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={f.overdue} onChange={upd('overdue')}><option value="">Any follow-up</option><option value="true">Overdue only</option></select>
      </div>
      <ErrorBox error={error} />
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Business</th><th>Product</th><th>Source</th><th>Priority</th><th>Status</th><th>Follow-up</th><th>Next action</th><th /></tr></thead>
          <tbody>
            {data?.items.map((l) => (
              <tr key={l.id}>
                <td><Link to={`/accounts/${l.accountId}`}>{l.account}</Link><div className="muted">{[l.category, l.landmark, l.phone].filter(Boolean).join(' · ')}</div>
                  <MapLinks latitude={l.latitude} longitude={l.longitude} name={l.account} area={l.landmark} /></td>
                <td><ProductTag name={l.product} color={l.productColor} /></td>
                <td>{l.source ?? <span className="muted">—</span>}</td>
                <td><Badge v={l.priority} /></td>
                <td><Badge v={l.status} /></td>
                <td style={{ color: l.followUpDate && new Date(l.followUpDate) < today ? 'var(--bad)' : undefined }}>{dateStr(l.followUpDate)}</td>
                <td style={{ maxWidth: 260 }}>{l.nextAction}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="sm" onClick={() => setEdit(l)}>Edit</button>{' '}
                  <button className="sm primary" onClick={() => setConv(l)}>Convert</button>
                </td>
              </tr>
            ))}
            {!loading && data?.items.length === 0 && <tr><td colSpan="8" className="muted">No leads match.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && <Pager page={page} pageSize={25} total={data.total} onPage={setPage} />}
      {adding && <NewLeadModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload() }} />}
      {edit && <EditLead lead={edit} statuses={meta.leadStatuses} sources={meta.leadSources} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
      {conv && <ConvertLead lead={conv} product={meta.products.find((p) => p.id === conv.productId)} onClose={() => setConv(null)} onDone={() => { setConv(null); reload() }} />}
    </>
  )
}
