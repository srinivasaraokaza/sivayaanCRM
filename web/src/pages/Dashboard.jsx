import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, dateStr, money } from '../api'
import { Badge, ErrorBox, ProductTag, useLoad } from '../ui.jsx'
import { useProduct } from '../product.jsx'
import { moneyShort } from '../util.js'
import { BarList, ColumnChart } from '../components/Charts.jsx'
import Board from '../components/Board.jsx'
import CustomerList from '../components/CustomerList.jsx'
import FollowUps from '../components/FollowUps.jsx'
import { NewLeadModal } from './Leads.jsx'
import MapLinks from '../components/MapLinks.jsx'

const matOrder = ['Absent', 'Basic', 'Developing', 'Established', 'Advanced']

function Section({ id, title, action, children }) {
  return (
    <section id={id} className="panel" style={{ marginBottom: 14 }}>
      <div className="head" style={{ marginBottom: 10 }}><h3 style={{ margin: 0 }}>{title}</h3>{action}</div>
      {children}
    </section>
  )
}

function LeadsTable({ productId, refreshKey }) {
  const { data, error } = useLoad(() => api.leads({ productId, pageSize: 8 }), [productId, refreshKey])
  if (error) return <ErrorBox error={error} />
  if (!data) return <p className="muted">Loading…</p>
  return (
    <div className="tbl-wrap">
      <table>
        <thead><tr><th>Business</th><th>Product</th><th>Platform</th><th>Priority</th><th>Status</th><th>Follow-up</th></tr></thead>
        <tbody>
          {data.items.map((l) => (
            <tr key={l.id}>
              <td><Link to={`/accounts/${l.accountId}`}>{l.account}</Link><div className="muted">{[l.category, l.landmark].filter(Boolean).join(' · ')}</div>
                <MapLinks latitude={l.latitude} longitude={l.longitude} name={l.account} area={l.landmark} /></td>
              <td><ProductTag name={l.product} color={l.productColor} /></td>
              <td>{l.source ?? <span className="muted">—</span>}</td>
              <td><Badge v={l.priority} /></td>
              <td><Badge v={l.status} /></td>
              <td>{dateStr(l.followUpDate)}</td>
            </tr>
          ))}
          {data.items.length === 0 && <tr><td colSpan="6" className="muted">No leads yet. Use “+ Add Lead” or import a spreadsheet.</td></tr>}
        </tbody>
      </table>
      <p className="muted" style={{ marginBottom: 0 }}>Showing {data.items.length} of {data.total} open leads · <Link to="/leads">View all →</Link></p>
    </div>
  )
}

export default function Dashboard() {
  const { productId, product } = useProduct()
  const [tick, setTick] = useState(0)
  const [adding, setAdding] = useState(false)
  const refresh = () => setTick((t) => t + 1)
  const { data: d, error, loading } = useLoad(() => api.dashboard(productId), [productId, tick])

  if (loading && !d) return <p className="muted">Loading…</p>
  if (error) return <ErrorBox error={error} />

  return (
    <>
      <div className="head"><h2>Dashboard{product ? ` — ${product.name}` : ' — all products'}</h2></div>

      {/* 1. Key numbers */}
      <div className="cards">
        <div className="card"><div className="n">{moneyShort(d.revenueThisMonth)}</div><div className="l">Revenue · this month</div><div className="muted">{money(d.totalRevenue)} all time</div></div>
        <div className="card"><div className="n">{d.ordersThisMonth}</div><div className="l">Orders · this month</div></div>
        <div className="card"><div className="n">{d.customers}</div><div className="l">Customers</div></div>
        <div className="card"><div className="n">{d.newLeads30d}</div><div className="l">New leads · 30 days</div></div>
        <div className="card"><div className="n">{d.conversionRate}%</div><div className="l">Lead conversion rate</div></div>
        <a className="card" href="#followups" style={{ color: 'inherit', textDecoration: 'none' }}>
          <div className="n">{d.followUpsToday}</div><div className="l">Follow-ups due today</div>
          {d.followUpsOverdue > 0 && <div style={{ color: 'var(--bad)', fontSize: 12 }}>+ {d.followUpsOverdue} overdue</div>}
        </a>
      </div>

      {!productId && (
        <Section title="By product">
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Product</th><th>Open leads</th><th>Open deals</th><th>Pipeline</th><th>Won</th></tr></thead>
              <tbody>
                {d.byProduct.map((p) => (
                  <tr key={p.id}>
                    <td><ProductTag name={p.name} color={p.color} /> <span className="muted">{p.industry}</span></td>
                    <td className="num">{p.openLeads}</td><td className="num">{p.openDeals}</td>
                    <td className="num">{money(p.pipeline)}</td><td className="num">{money(p.wonValue)} ({p.wonCount})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* 2. Leads table */}
      <Section title="Leads" action={<button className="primary" onClick={() => setAdding(true)}>+ Add Lead</button>}>
        <LeadsTable productId={productId} refreshKey={tick} />
      </Section>

      {/* 3. Charts */}
      <div className="grid2">
        <div className="panel">
          <h3>Leads and conversion rate by platform</h3>
          <BarList empty="No leads yet."
            rows={d.bySource.map((s) => ({ label: s.key, value: s.leads, sub: `${s.leads} leads · ${s.rate}%` }))} />
        </div>
        <div className="panel">
          <h3>Top-selling products</h3>
          <BarList empty="No orders yet. Record orders on a customer account."
            rows={d.topSelling.map((s) => ({ label: s.name, value: s.revenue, sub: `${moneyShort(s.revenue)} · ${s.quantity} sold` }))} />
        </div>
      </div>
      <Section title="Monthly revenue (last 12 months)">
        <ColumnChart data={d.monthlyRevenue} labelKey="month" valueKey="revenue" fmt={moneyShort} empty="No orders yet. Record orders on a customer account." />
      </Section>

      {/* 4. Pipeline board */}
      <Section title="Pipeline — bulk deals" action={<Link to="/pipeline">Full board →</Link>}>
        <Board refreshKey={tick} onChanged={refresh} />
      </Section>

      {/* 5. Customers */}
      <Section title="Customers" action={<Link to="/customers">View all →</Link>}>
        <CustomerList pageSize={8} refreshKey={tick} />
      </Section>

      {/* 6. Today's follow-ups */}
      <Section id="followups" title="Today's follow-ups" action={<Link to="/followups">Open page →</Link>}>
        <FollowUps refreshKey={tick} onChanged={refresh} limit={20} />
      </Section>

      {d.hasIntelligence && (
        <Section title="Market intelligence (healthcare study)">
          <p className="muted">{d.highOpportunity} high/priority opportunities · {d.noWebsite} businesses with no website</p>
          <BarList rows={matOrder.map((k) => ({ label: k, value: d.maturity.find((x) => x.key === k)?.count ?? 0 }))} />
        </Section>
      )}

      {adding && <NewLeadModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); refresh() }} />}
    </>
  )
}
