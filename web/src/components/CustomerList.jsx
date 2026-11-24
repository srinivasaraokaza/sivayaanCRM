import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, dateStr, money } from '../api'
import { Badge, ErrorBox, Pager, useDebounced, useLoad } from '../ui.jsx'
import { useProduct } from '../product.jsx'

const TABS = [['', 'All', 'all'], ['Active', 'Active', 'active'], ['At Risk', 'At Risk', 'atRisk'], ['Lost', 'Lost', 'lost']]

/** Customers (accounts with orders) by recency: Active 0-30 days, At Risk 31-75, Lost 76+. */
export default function CustomerList({ pageSize = 25, searchable = false, refreshKey = 0 }) {
  const { productId } = useProduct()
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const search = useDebounced(q)
  const { data, error, loading } = useLoad(() => api.customers({ productId, status, search, page, pageSize }), [productId, status, search, page, pageSize, refreshKey])

  return (
    <>
      <div className="filters" style={{ alignItems: 'center' }}>
        <div className="tabs" style={{ margin: 0 }}>
          {TABS.map(([value, label, key]) => (
            <button key={label} className={status === value ? 'primary sm' : 'sm'} onClick={() => { setStatus(value); setPage(1) }}>
              {label}{data ? ` (${data.counts[key]})` : ''}
            </button>
          ))}
        </div>
        {searchable && <input placeholder="Search customer…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />}
      </div>
      <p className="muted" style={{ marginTop: 0 }}>Active: ordered in the last 30 days · At Risk: no order in 31–75 days · Lost: no order for 76+ days.</p>
      <ErrorBox error={error} />
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Customer</th><th>Status</th><th>Last order</th><th>Days since</th><th>Orders</th><th>Total spent</th></tr></thead>
          <tbody>
            {data?.items.map((c) => (
              <tr key={c.accountId}>
                <td><Link to={`/accounts/${c.accountId}`}>{c.name}</Link><div className="muted">{[c.industry, c.city, c.phone].filter(Boolean).join(' · ')}</div></td>
                <td><Badge v={c.status} /></td>
                <td>{dateStr(c.lastOrder)}</td>
                <td className="num">{c.daysSince}</td>
                <td className="num">{c.orders}</td>
                <td className="num">{money(c.total)}</td>
              </tr>
            ))}
            {!loading && data?.items.length === 0 && <tr><td colSpan="6" className="muted">No customers here yet. Customers appear once an order is recorded on their account.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && data.total > pageSize && <Pager page={page} pageSize={pageSize} total={data.total} onPage={setPage} />}
    </>
  )
}
