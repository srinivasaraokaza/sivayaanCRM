import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Badge, ErrorBox, Modal, Pager, ProductTag, useDebounced, useLoad } from '../ui.jsx'
import { useProduct } from '../product.jsx'
import { parseCoords } from '../util.js'
import MapLinks from '../components/MapLinks.jsx'

export function AccountModal({ account, onClose, onSaved }) {
  const { meta } = useProduct()
  const nav = useNavigate()
  const [f, setF] = useState(account ?? { name: '', industry: '', category: '', city: '', landmark: '', phone: '', email: '', website: '' })
  const [err, setErr] = useState(null)
  const [paste, setPaste] = useState('')
  const [pasteMsg, setPasteMsg] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const coord = (k) => (e) => setF({ ...f, [k]: e.target.value === '' ? null : Number(e.target.value) })
  const pastedLocation = (text) => {
    setPaste(text)
    if (!text.trim()) { setPasteMsg(null); return }
    const c = parseCoords(text)
    if (c) { setF((cur) => ({ ...cur, ...c })); setPasteMsg({ ok: true, text: `Location set: ${c.latitude}, ${c.longitude}` }) }
    else setPasteMsg({ ok: false, text: 'No coordinates found. Short links (maps.app.goo.gl) don’t contain them — open the link and copy the full address-bar URL, or type latitude and longitude.' })
  }
  const submit = async (e) => {
    e.preventDefault()
    if ((f.latitude == null) !== (f.longitude == null)) { setErr('Enter both latitude and longitude, or neither.'); return }
    const body = { ...f, website: f.website || null, industry: f.industry || null, category: f.category || null }
    try {
      if (account) { await api.updateAccount(account.id, body); onSaved() }
      else { const { id } = await api.createAccount(body); nav(`/accounts/${id}`) }
    } catch (x) { setErr(x.message) }
  }
  return (
    <Modal title={account ? 'Edit account' : 'New account'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ErrorBox error={err} />
        <label>Name<input required value={f.name} onChange={set('name')} /></label>
        <div className="row">
          <label>Industry<input list="industries" value={f.industry ?? ''} onChange={set('industry')} /></label>
          <label>Category / type<input value={f.category ?? ''} onChange={set('category')} /></label>
        </div>
        <datalist id="industries">{meta.industries.map((i) => <option key={i} value={i} />)}</datalist>
        <div className="row">
          <label>City<input value={f.city ?? ''} onChange={set('city')} /></label>
          <label>Area / landmark<input value={f.landmark ?? ''} onChange={set('landmark')} /></label>
        </div>
        <div className="row">
          <label>Phone<input value={f.phone ?? ''} onChange={set('phone')} /></label>
          <label>Email<input type="email" value={f.email ?? ''} onChange={set('email')} /></label>
        </div>
        <label>Website<input value={f.website ?? ''} onChange={set('website')} placeholder="https://" /></label>
        <label>Paste a Google Maps link or “lat, lng” to fill the location
          <input value={paste} onChange={(e) => pastedLocation(e.target.value)} placeholder="https://www.google.com/maps/…@17.51,78.30…" />
        </label>
        {pasteMsg && <p className={pasteMsg.ok ? 'muted' : 'err'} style={{ marginTop: -4 }}>{pasteMsg.text}</p>}
        <div className="row">
          <label>Latitude<input type="number" step="any" min="-90" max="90" value={f.latitude ?? ''} onChange={coord('latitude')} /></label>
          <label>Longitude<input type="number" step="any" min="-180" max="180" value={f.longitude ?? ''} onChange={coord('longitude')} /></label>
        </div>
        <div className="actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary">Save</button></div>
      </form>
    </Modal>
  )
}

export default function Accounts() {
  const { meta, productId } = useProduct()
  const [f, setF] = useState({ search: '', industry: '', band: '', website: '', sort: '' })
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)
  const search = useDebounced(f.search)
  const { data, error, loading } = useLoad(
    () => api.accounts({ ...f, search, productId, page, pageSize: 25 }),
    [search, f.industry, f.band, f.website, f.sort, productId, page],
  )
  const upd = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1) }
  const byId = Object.fromEntries(meta.products.map((p) => [p.id, p]))
  const anyIntel = data?.items.some((a) => a.tier)
  return (
    <>
      <div className="head"><h2>Accounts</h2><button className="primary" onClick={() => setAdding(true)}>+ New account</button></div>
      <div className="filters">
        <input placeholder="Search name, area or city…" value={f.search} onChange={upd('search')} />
        <select value={f.industry} onChange={upd('industry')}><option value="">All industries</option>{meta.industries.map((c) => <option key={c}>{c}</option>)}</select>
        <select value={f.band} onChange={upd('band')}><option value="">Any opportunity score</option>{['Priority', 'High', 'Moderate', 'Low'].map((c) => <option key={c}>{c}</option>)}</select>
        <select value={f.website} onChange={upd('website')}><option value="">Website: any</option><option value="none">No website</option><option value="has">Has website</option></select>
        <select value={f.sort} onChange={upd('sort')}><option value="">Sort: opportunity</option><option value="name">Name</option><option value="maturity">Lowest maturity</option><option value="distance">Nearest</option></select>
      </div>
      <ErrorBox error={error} />
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Business</th><th>Industry</th><th>Products</th>{anyIntel && <><th>Opportunity</th><th>Maturity</th><th>Top recommendation</th></>}<th>Deals</th></tr></thead>
          <tbody>
            {data?.items.map((a) => (
              <tr key={a.id}>
                <td><Link to={`/accounts/${a.id}`}>{a.name}</Link><div className="muted">{[a.category, a.landmark ?? a.city].filter(Boolean).join(' · ')}</div>
                  <MapLinks latitude={a.latitude} longitude={a.longitude} name={a.name} area={a.landmark ?? a.city} /></td>
                <td>{a.industry}</td>
                <td>{a.productIds.map((id) => byId[id] && <span key={id}><ProductTag name={byId[id].name} color={byId[id].color} />{' '}</span>)}</td>
                {anyIntel && <>
                  <td>{a.tier ? <><Badge v={a.opportunityBand} /> <span className="muted">{a.opportunity}</span></> : '—'}</td>
                  <td>{a.tier ? <><Badge v={a.maturityBand} /> <span className="muted">{a.digitalMaturity}</span></> : '—'}</td>
                  <td style={{ maxWidth: 240 }}>{a.topRecommendation ?? <span className="muted">—</span>}</td>
                </>}
                <td className="num">{a.deals}</td>
              </tr>
            ))}
            {!loading && data?.items.length === 0 && <tr><td colSpan="7" className="muted">No accounts match.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && <Pager page={page} pageSize={25} total={data.total} onPage={setPage} />}
      {adding && <AccountModal onClose={() => setAdding(false)} />}
    </>
  )
}
