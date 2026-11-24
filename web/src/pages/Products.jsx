import { useState } from 'react'
import { api, money } from '../api'
import { ErrorBox, Modal, ProductTag, useLoad } from '../ui.jsx'
import { useProduct } from '../product.jsx'

function ProductModal({ product, onClose, onSaved }) {
  const [f, setF] = useState(product ?? { code: '', name: '', industry: '', description: '', website: '', defaultDealValue: 0, color: '#1f4fd8', isActive: true })
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    const body = { ...f, defaultDealValue: Number(f.defaultDealValue), segments: f.segments?.trim() || null }
    try {
      if (product) await api.updateProduct(product.id, body)
      else await api.createProduct(body)
      onSaved()
    } catch (x) { setErr(x.message) }
  }
  return (
    <Modal title={product ? `Edit ${product.name}` : 'New product'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ErrorBox error={err} />
        <div className="row">
          <label>Code<input required disabled={!!product} value={f.code} onChange={set('code')} placeholder="e.g. LORRY" /></label>
          <label>Name<input required value={f.name} onChange={set('name')} /></label>
        </div>
        <div className="row">
          <label>Target industry<input value={f.industry ?? ''} onChange={set('industry')} /></label>
          <label>Website<input value={f.website ?? ''} onChange={set('website')} /></label>
        </div>
        <label>Bulk-deal segments (comma-separated)<input value={f.segments ?? ''} onChange={set('segments')} placeholder="e.g. Clinic, Pharmacy, Lab" /></label>
        <label>Description<textarea value={f.description ?? ''} onChange={set('description')} /></label>
        <div className="row">
          <label>Default deal value (INR)<input type="number" min="0" value={f.defaultDealValue} onChange={set('defaultDealValue')} /></label>
          <label>Colour<input type="color" value={f.color} onChange={set('color')} style={{ height: 34, padding: 2 }} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Active (shown in product switcher)</label>
        <div className="actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary">Save</button></div>
      </form>
    </Modal>
  )
}

export default function Products() {
  const { reloadMeta } = useProduct()
  const { data, error, reload } = useLoad(() => api.products(), [])
  const [modal, setModal] = useState(null)
  const [err, setErr] = useState(null)
  const refresh = () => { setModal(null); reload(); reloadMeta() }
  const remove = async (p) => {
    if (!confirm(`Delete product ${p.name}?`)) return
    try { await api.deleteProduct(p.id); setErr(null); refresh() } catch (x) { setErr(x.message) }
  }
  return (
    <>
      <div className="head"><h2>Products</h2><button className="primary" onClick={() => setModal({})}>+ New product</button></div>
      <p className="muted">Every lead and deal belongs to a product. The sidebar switcher filters the whole CRM by product.</p>
      <ErrorBox error={err || error} />
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Product</th><th>Industry</th><th>Default deal</th><th>Leads</th><th>Deals</th><th>Status</th><th /></tr></thead>
          <tbody>
            {data?.map((p) => (
              <tr key={p.id}>
                <td><ProductTag name={p.name} color={p.color} /> <span className="muted">{p.code}</span><div className="muted">{p.description}</div></td>
                <td>{p.industry}</td><td className="num">{money(p.defaultDealValue)}</td>
                <td className="num">{p.leads}</td><td className="num">{p.deals}</td>
                <td>{p.isActive ? 'Active' : <span className="muted">Inactive</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="sm" onClick={() => setModal({ p })}>Edit</button>{' '}
                  <button className="sm danger" onClick={() => remove(p)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && <ProductModal product={modal.p} onClose={() => setModal(null)} onSaved={refresh} />}
    </>
  )
}
