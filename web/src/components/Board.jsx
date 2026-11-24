import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, money } from '../api'
import { ErrorBox, ProductTag, useLoad } from '../ui.jsx'
import { useProduct } from '../product.jsx'
import { DealModal } from '../pages/AccountDetail.jsx'
import { plural, segmentsOf } from '../util.js'

/** Drag-and-drop deal board. Filter by customer segment (e.g. Clinic / Pharmacy / Lab for HMS) and bulk deals (2+ units). */
export default function Board({ refreshKey = 0, onChanged }) {
  const { meta, productId, product } = useProduct()
  const { data: deals, error, reload } = useLoad(() => api.deals({ productId }), [productId, refreshKey])
  const [segment, setSegment] = useState('')
  const [bulkOnly, setBulkOnly] = useState(false)
  const [over, setOver] = useState(null)
  const [edit, setEdit] = useState(null)
  const [err, setErr] = useState(null)

  if (!deals) return <><ErrorBox error={error} /><p className="muted">Loading…</p></>

  // Segments to offer: the selected product's, or all products' when viewing everything, plus any already used by a deal.
  const configured = (product ? [product] : meta.products).flatMap(segmentsOf)
  const segments = [...new Set([...configured, ...deals.map((d) => d.segment).filter(Boolean)])]
  const shown = deals.filter((d) => (!segment || d.segment === segment) && (!bulkOnly || d.units >= 2))
  const open = shown.filter((d) => d.stage !== 'Won' && d.stage !== 'Lost')
  const units = open.reduce((s, d) => s + d.units, 0)

  const changed = () => { reload(); onChanged?.() }
  const drop = async (stage, e) => {
    e.preventDefault()
    setOver(null)
    const id = Number(e.dataTransfer.getData('text/plain'))
    const deal = deals.find((d) => d.id === id)
    if (!deal || deal.stage === stage) return
    try { await api.moveDeal(id, stage); setErr(null) } catch (x) { setErr(x.message) }
    changed()
  }

  return (
    <>
      <div className="filters" style={{ alignItems: 'center' }}>
        <div className="tabs" style={{ margin: 0 }}>
          <button className={segment === '' ? 'primary sm' : 'sm'} onClick={() => setSegment('')}>All segments</button>
          {segments.map((s) => <button key={s} className={segment === s ? 'primary sm' : 'sm'} onClick={() => setSegment(s)}>{s}</button>)}
        </div>
        <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={bulkOnly} onChange={(e) => setBulkOnly(e.target.checked)} /> Bulk deals only (2+ units)
        </label>
        <span className="muted" style={{ marginLeft: 'auto' }}>
          {open.length} open · {units} units · {money(open.reduce((s, d) => s + d.value, 0))} · weighted {money(open.reduce((s, d) => s + (d.value * d.closeProbability) / 100, 0))}
        </span>
      </div>
      <ErrorBox error={err || error} />
      <div className="kanban">
        {meta.stages.map((stage) => {
          const col = shown.filter((d) => d.stage === stage)
          return (
            <div key={stage} className={`col ${over === stage ? 'over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOver(stage) }} onDragLeave={() => setOver(null)} onDrop={(e) => drop(stage, e)}>
              <h4>{stage} <span>{col.length} · {money(col.reduce((s, d) => s + d.value, 0))}</span></h4>
              {col.map((d) => (
                <div key={d.id} className="deal" draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', String(d.id))} onClick={() => setEdit(d)}>
                  <b>{d.title}</b>
                  <div className="m"><Link to={`/accounts/${d.accountId}`} onClick={(e) => e.stopPropagation()}>{d.account}</Link></div>
                  <div className="m">{money(d.value)} · {d.closeProbability}%</div>
                  <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {d.units >= 2 && <span className="badge Medium">{d.units} {d.segment ? plural(d.segment) : 'units'}</span>}
                    {d.units < 2 && d.segment && <span className="badge">{d.segment}</span>}
                    {!productId && <ProductTag name={d.product} color={d.productColor} />}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
      {edit && <DealModal accountId={edit.accountId} deal={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); changed() }} />}
    </>
  )
}
