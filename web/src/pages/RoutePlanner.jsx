import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api, dateStr } from '../api'
import { Badge, ErrorBox, ProductTag, useLoad } from '../ui.jsx'
import { useProduct } from '../product.jsx'
import MapLinks from '../components/MapLinks.jsx'
import VisitModal from '../components/VisitModal.jsx'
import OutcomeBadge from '../components/OutcomeBadge.jsx'
import { DAY_COLORS, googleLegs, haversineKm, planDays } from '../route.js'
import { directionsLink } from '../util.js'

const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']
const BASE_COLOR = '#138a4b'

const pinIcon = (label, color, dim) =>
  L.divIcon({
    className: 'pin-wrap',
    html: `<div class="pin" style="background:${color};opacity:${dim ? 0.35 : 1}">${label}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })

// Popups are built with DOM nodes (not HTML strings) because facility names come from imported data.
function popupEl(stop, order) {
  const el = document.createElement('div')
  const b = document.createElement('b')
  b.textContent = `${order ? `${order}. ` : ''}${stop.name}`
  el.appendChild(b)
  const sub = document.createElement('div')
  sub.textContent = [stop.category, stop.landmark, stop.phone].filter(Boolean).join(' · ')
  el.appendChild(sub)
  const a = document.createElement('a')
  a.textContent = 'Directions'
  a.href = directionsLink(stop)
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  el.appendChild(a)
  return el
}

export default function RoutePlanner() {
  const { meta, productId } = useProduct()
  // Location 0 is the fixed base: shown on the map as pin 0, and every day's route starts from it.
  const base = useMemo(() => (meta.office ? { ...meta.office, label: meta.office.name } : null), [meta.office])

  const [f, setF] = useState({ area: '', category: '', priority: '', unvisitedOnly: true })
  const [perDay, setPerDay] = useState(15)
  const [radius, setRadius] = useState('')
  const [excluded, setExcluded] = useState(() => new Set())
  const [dayView, setDayView] = useState('all')
  const [err, setErr] = useState(null)
  const [visiting, setVisiting] = useState(null) // the stop whose visit is being recorded
  const [saved, setSaved] = useState(null)

  const { data, error, reload } = useLoad(() => api.routeStops({ productId, ...f }), [productId, f.area, f.category, f.priority, f.unvisitedOnly])

  const allItems = useMemo(() => data?.items ?? [], [data])
  // "Within X km of Location 0" narrows the area by distance, which works even when landmark names are messy.
  const inRange = useMemo(
    () => (base && radius ? allItems.filter((s) => haversineKm(s, base) <= Number(radius)) : allItems),
    [allItems, base, radius],
  )
  // Facilities visited today are done: they leave the route but stay on screen under "Visited today".
  const items = useMemo(() => inRange.filter((s) => !s.visitedToday), [inRange])
  const doneToday = useMemo(() => inRange.filter((s) => s.visitedToday), [inRange])
  const included = useMemo(() => items.filter((s) => !excluded.has(s.accountId)), [items, excluded])
  const skipped = useMemo(() => items.filter((s) => excluded.has(s.accountId)), [items, excluded])
  const days = useMemo(() => planDays(included, perDay, base), [included, perDay, base])
  // Stop numbers run 1..N across days; 0 is always the base.
  const orderOf = useMemo(() => new Map(days.flatMap((d) => d.stops).map((s, i) => [s.accountId, i + 1])), [days])
  const shownDays = dayView === 'all' ? days : days.filter((d) => d.day === dayView)

  // --- map ---
  const boxRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const fitKey = useRef('')

  useEffect(() => {
    const map = L.map(boxRef.current).setView([17.5, 78.4], 12)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const bounds = []
    for (const d of days) {
      const dim = dayView !== 'all' && dayView !== d.day
      const color = DAY_COLORS[(d.day - 1) % DAY_COLORS.length]
      const path = [...(d.from ? [d.from] : []), ...d.stops].map((p) => [p.latitude, p.longitude])
      if (path.length > 1) L.polyline(path, { color, weight: 4, opacity: dim ? 0.15 : 0.8 }).addTo(layer)
      for (const s of d.stops) {
        L.marker([s.latitude, s.longitude], { icon: pinIcon(orderOf.get(s.accountId), color, dim) }).bindPopup(popupEl(s, orderOf.get(s.accountId))).addTo(layer)
        if (!dim) bounds.push([s.latitude, s.longitude])
      }
    }
    for (const s of skipped) L.circleMarker([s.latitude, s.longitude], { radius: 5, color: '#8a94a6', fillOpacity: 0.6 }).bindPopup(popupEl(s)).addTo(layer)
    for (const s of doneToday) L.marker([s.latitude, s.longitude], { icon: pinIcon('✓', BASE_COLOR, false) }).bindPopup(popupEl(s)).addTo(layer)
    if (base) {
      const tip = `${base.name}${base.plusCode ? ` (${base.plusCode})` : ''}${base.address ? ` — ${base.address}` : ''}`
      L.marker([base.latitude, base.longitude], { icon: pinIcon('0', BASE_COLOR, false), zIndexOffset: 1000 }).bindTooltip(tip).addTo(layer)
      bounds.push([base.latitude, base.longitude])
      if (radius) {
        const circle = L.circle([base.latitude, base.longitude], { radius: Number(radius) * 1000, color: BASE_COLOR, weight: 1, fillOpacity: 0.05, interactive: false }).addTo(layer)
        const b = circle.getBounds()
        bounds.push([b.getNorth(), b.getEast()], [b.getSouth(), b.getWest()])
      }
    }
    // Re-fit only when the set of stops or the day view changes, not on every re-order.
    const key = `${items.map((s) => s.accountId).join(',')}|${dayView}|${radius}`
    if (bounds.length && key !== fitKey.current) { map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 }); fitKey.current = key }
  }, [days, skipped, doneToday, base, radius, dayView, orderOf, items])

  // Leaflet needs to know the container's real size once the page has laid out.
  useEffect(() => { const t = setTimeout(() => mapRef.current?.invalidateSize(), 200); return () => clearTimeout(t) }, [])

  const changeFilter = (patch) => { setF((cur) => ({ ...cur, ...patch })); setExcluded(new Set()); setDayView('all') }
  const toggle = (id) => setExcluded((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const visitSaved = (outcome) => {
    setSaved(`Visit to ${visiting.name} saved as “${outcome.label}”. It now shows under “Visited today”.`)
    setVisiting(null)
    reload()
  }

  const totalKm = days.reduce((s, d) => s + d.km, 0)
  const areaLabel = `${f.area || 'all areas'}${base && radius ? `, within ${radius} km of ${base.name}` : ''}`

  return (
    <>
      <div className="head"><h2>Route planner</h2></div>
      <p className="muted">Pick an area, and every facility in it is plotted on one map and joined into visiting routes. Every day starts from Location 0; long routes are split into days, and each day opens in Google Maps for road directions.</p>
      <ErrorBox error={error || err} />
      {saved && <div className="panel" style={{ marginBottom: 14, borderLeft: `4px solid ${BASE_COLOR}` }}>{saved} <button className="sm" onClick={() => setSaved(null)}>Dismiss</button></div>}
      <p className="muted" style={{ marginTop: 0 }}>
        <b>How visits work:</b> at a facility, press <b>Record visit</b> and choose what happened (interested, requested a demo, not interested…). The lead's status, next action and follow-up date update automatically, and the visit is saved on the account's activity.
      </p>

      {base ? (
        <div className="panel" style={{ marginBottom: 14, borderLeft: `4px solid ${BASE_COLOR}` }}>
          <span className="pin inline" style={{ background: BASE_COLOR }}>0</span>{' '}
          <b>{base.name}</b>{base.plusCode ? ` · ${base.plusCode}` : ''}
          <span className="muted"> — {base.address}</span>
          <div><MapLinks latitude={base.latitude} longitude={base.longitude} name={base.name} area={base.address} /></div>
        </div>
      ) : (
        <div className="err">Location 0 is not configured. Add an “Office” section (Latitude, Longitude) to api/appsettings.json; until then routes start at the edge of the area.</div>
      )}

      <div className="filters">
        <select value={f.area} onChange={(e) => changeFilter({ area: e.target.value })}>
          <option value="">All areas</option>
          {/* Landmarks are free text, so only real clusters are listed; use "Within X km" for anything finer. */}
          {data?.areas.filter((a) => a.count >= 3 || a.name === f.area).map((a) => <option key={a.name} value={a.name}>{a.name} ({a.count})</option>)}
        </select>
        <select value={f.category} onChange={(e) => changeFilter({ category: e.target.value })}>
          <option value="">All facility types</option>
          {data?.categories.map((a) => <option key={a.name} value={a.name}>{a.name} ({a.count})</option>)}
        </select>
        <select value={f.priority} onChange={(e) => changeFilter({ priority: e.target.value })}>
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={radius} disabled={!base} onChange={(e) => { setRadius(e.target.value); setExcluded(new Set()); setDayView('all') }}>
          <option value="">Any distance from Location 0</option>
          {[1, 2, 3, 5, 10, 20].map((k) => <option key={k} value={k}>Within {k} km of Location 0</option>)}
        </select>
        <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }} title="Leave out facilities you have visited before. Ones visited today stay on screen under “Visited today”.">
          <input type="checkbox" checked={f.unvisitedOnly} onChange={(e) => changeFilter({ unvisitedOnly: e.target.checked })} /> Skip facilities already visited
        </label>
        <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Stops per day
          <input type="number" min="1" max="60" value={perDay} style={{ width: 70 }} onChange={(e) => setPerDay(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} />
        </label>
      </div>

      <div className="panel" style={{ padding: 0, overflow: 'hidden', marginBottom: 14 }}>
        <div ref={boxRef} className="routemap" />
      </div>

      {data && (
        <p className="muted">
          <b>{included.length}</b> facilities in {areaLabel}{skipped.length ? ` (${skipped.length} skipped)` : ''} · {days.length} day{days.length === 1 ? '' : 's'} · about {totalKm.toFixed(1)} km in straight lines
          from Location 0 (roads will be longer){data.truncated ? ' · showing the first 1,000 only — narrow the area' : ''}
        </p>
      )}
      {data && !f.area && !radius && items.length > 60 && <p className="muted">Tip: choose an area or a distance from Location 0 for a tighter route. Without either, the days fan out across every area.</p>}

      {days.length > 1 && days.length <= 10 && (
        <div className="tabs">
          <button className={dayView === 'all' ? 'primary sm' : 'sm'} onClick={() => setDayView('all')}>All days</button>
          {days.map((d) => (
            <button key={d.day} className={dayView === d.day ? 'primary sm' : 'sm'} onClick={() => setDayView(d.day)}
              style={dayView === d.day ? undefined : { borderLeft: `4px solid ${DAY_COLORS[(d.day - 1) % DAY_COLORS.length]}` }}>Day {d.day}</button>
          ))}
        </div>
      )}
      {days.length > 10 && (
        <div className="filters">
          <select value={dayView} onChange={(e) => setDayView(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">All {days.length} days (map only — pick one day to see its stops)</option>
            {days.map((d) => <option key={d.day} value={d.day}>Day {d.day} · {d.stops.length} stops · ~{d.km.toFixed(1)} km</option>)}
          </select>
        </div>
      )}

      {data && items.length === 0 && <div className="panel"><p className="muted" style={{ margin: 0 }}>No facilities left to visit here. Only open leads with map coordinates are shown — try unticking “Skip facilities already visited” or widening the distance.</p></div>}

      {/* With dozens of days, listing every stop would be a very long page; require choosing a day. */}
      {(days.length <= 10 || dayView !== 'all' ? shownDays : []).map((d) => {
        const legs = googleLegs(d.stops, d.from)
        const color = DAY_COLORS[(d.day - 1) % DAY_COLORS.length]
        return (
          <div className="panel" key={d.day} style={{ marginBottom: 14, borderTop: `4px solid ${color}` }}>
            <div className="head" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Day {d.day} <span className="muted">· {d.stops.length} stops · ~{d.km.toFixed(1)} km</span></h3>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {legs.map((l, i) => (
                  <a key={i} className="btn wa" style={{ background: 'var(--brand)', borderColor: 'var(--brand)' }} href={l.url} target="_blank" rel="noopener noreferrer">
                    {legs.length > 1 ? `Open part ${i + 1} of ${legs.length} in Google Maps (${l.count} stops)` : 'Open route in Google Maps'}
                  </a>
                ))}
              </div>
            </div>
            {legs.length > 1 && <p className="muted" style={{ marginTop: 0 }}>Google Maps takes at most 10 stops per link, so this day is split into parts that continue from each other.</p>}
            {base && (
              <div className="rec">
                <span className="pin inline" style={{ background: BASE_COLOR }}>0</span> <b>{base.name}</b> <span className="muted">· start of day {d.day}{base.plusCode ? ` · ${base.plusCode}` : ''}</span>
              </div>
            )}
            {d.stops.map((s) => (
              <div className="rec followup" key={s.accountId}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="pin inline" style={{ background: color }}>{orderOf.get(s.accountId)}</span>{' '}
                  <Link to={`/accounts/${s.accountId}`}><b>{s.name}</b></Link> {!productId && <ProductTag name={s.product} color={s.productColor} />} <Badge v={s.priority} />
                  <div className="muted">
                    {[s.category, s.landmark, s.phone].filter(Boolean).join(' · ')} · {s.visits ? `${s.visits} earlier visit${s.visits === 1 ? '' : 's'}` : 'not visited yet'}
                  </div>
                  {s.lastVisitAt && <div className="muted">Last visit {dateStr(s.lastVisitAt)}: <OutcomeBadge code={s.lastOutcome} />{s.lastVisitNotes ? ` ${s.lastVisitNotes.slice(0, 80)}` : ''}</div>}
                  <MapLinks latitude={s.latitude} longitude={s.longitude} name={s.name} area={s.landmark} />
                </div>
                <div style={{ whiteSpace: 'nowrap', display: 'flex', gap: 6 }}>
                  <button className="sm primary" onClick={() => setVisiting(s)} title="Record what happened at this visit">Record visit</button>
                  <button className="sm" onClick={() => toggle(s.accountId)} title="Leave this facility out of the route">Skip</button>
                </div>
              </div>
            ))}
          </div>
        )
      })}

      {doneToday.length > 0 && (
        <div className="panel" style={{ marginBottom: 14, borderTop: `4px solid ${BASE_COLOR}` }}>
          <h3 style={{ marginTop: 0 }}>Visited today ({doneToday.length})</h3>
          {doneToday.map((s) => (
            <div className="rec done followup" key={s.accountId}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span className="pin inline" style={{ background: BASE_COLOR }}>✓</span>{' '}
                <Link to={`/accounts/${s.accountId}`}><b>{s.name}</b></Link> <OutcomeBadge code={s.lastOutcome} />
                <div className="muted">
                  {[s.category, s.landmark].filter(Boolean).join(' · ')}
                  {s.lastVisitNotes ? ` · “${s.lastVisitNotes.slice(0, 100)}”` : ''}
                </div>
                <div className="muted">
                  Lead: <Badge v={s.leadStatus} />{s.followUpDate ? ` · follow-up ${dateStr(s.followUpDate)}` : s.leadStatus === 'Unqualified' ? ' · closed' : ''}{s.nextAction ? ` · ${s.nextAction}` : ''}
                </div>
              </div>
              <button className="sm" onClick={() => setVisiting(s)} title="Record another visit or correct the outcome">Record again</button>
            </div>
          ))}
          <p className="muted" style={{ marginBottom: 0 }}>Wrong outcome? Record the visit again, or edit the lead on the <b>Leads</b> page. Delete the visit from the account's activity if it was a mistake.</p>
        </div>
      )}

      {skipped.length > 0 && (
        <details className="panel">
          <summary>{skipped.length} skipped facilities</summary>
          {skipped.map((s) => (
            <div className="rec" key={s.accountId}>
              {s.name} <span className="muted">· {s.landmark}</span> <button className="sm" onClick={() => toggle(s.accountId)}>Add back</button>
            </div>
          ))}
        </details>
      )}
      {visiting && (
        <VisitModal accountId={visiting.accountId} accountName={visiting.name} leads={[{ id: visiting.leadId, product: visiting.product }]} leadId={visiting.leadId}
          onClose={() => setVisiting(null)} onSaved={visitSaved} />
      )}
    </>
  )
}
