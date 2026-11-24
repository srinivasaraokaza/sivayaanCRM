// Route planning helpers. Everything runs in the browser; no coordinates are sent to a routing service.

const R = 6371 // Earth radius, km

export function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLng = rad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Order stops into one short path: nearest-neighbour, then 2-opt improvement.
 * `start` ({latitude, longitude}) is where the day begins; without it the path begins at the stop
 * farthest from the group's centre, so the walk sweeps across the area instead of starting in the middle.
 * Returns the stops in visiting order.
 */
export function planRoute(stops, start) {
  if (stops.length < 2) return [...stops]
  let first
  if (start) first = null
  else {
    const c = {
      latitude: stops.reduce((s, p) => s + p.latitude, 0) / stops.length,
      longitude: stops.reduce((s, p) => s + p.longitude, 0) / stops.length,
    }
    first = stops.reduce((best, p) => (haversineKm(p, c) > haversineKm(best, c) ? p : best), stops[0])
  }

  // nodes[0] is the fixed start; the rest are free to be reordered.
  const nodes = [start ?? first]
  const left = stops.filter((p) => p !== nodes[0])
  while (left.length) {
    const cur = nodes[nodes.length - 1]
    let bi = 0, bd = Infinity
    for (let i = 0; i < left.length; i++) {
      const d = haversineKm(cur, left[i])
      if (d < bd) { bd = d; bi = i }
    }
    nodes.push(left.splice(bi, 1)[0])
  }

  // 2-opt on an open path. With a start point, node 0 is fixed; without one, either end may move, so an
  // outlying facility ends up at the end of the route instead of forcing a long first hop. Capped for large areas.
  const n = nodes.length
  const maxPasses = n > 400 ? 3 : 25
  const lo = start ? 1 : 0
  for (let pass = 0, improved = true; improved && pass < maxPasses; pass++) {
    improved = false
    for (let i = lo; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const before = (i > 0 ? haversineKm(nodes[i - 1], nodes[i]) : 0) + (j < n - 1 ? haversineKm(nodes[j], nodes[j + 1]) : 0)
        const after = (i > 0 ? haversineKm(nodes[i - 1], nodes[j]) : 0) + (j < n - 1 ? haversineKm(nodes[i], nodes[j + 1]) : 0)
        if (after < before - 1e-9) {
          for (let a = i, b = j; a < b; a++, b--) [nodes[a], nodes[b]] = [nodes[b], nodes[a]]
          improved = true
        }
      }
    }
  }
  return start ? nodes.slice(1) : nodes
}

/** Split an ordered route into days of at most `perDay` stops, each with its approximate straight-line length. */
export function splitDays(ordered, perDay, start) {
  const size = Math.max(1, perDay || ordered.length || 1)
  const days = []
  for (let i = 0; i < ordered.length; i += size) {
    const stops = ordered.slice(i, i + size)
    const from = i === 0 ? start : ordered[i - 1]
    let km = 0, prev = from
    for (const s of stops) { if (prev) km += haversineKm(prev, s); prev = s }
    days.push({ day: days.length + 1, stops, km, from })
  }
  return days
}

/**
 * Plan a multi-day field route where every day starts from `base` (the office, "Location 0").
 * Stops are first swept into one path from the base to find geographic groups, cut into days of `perDay`,
 * then each day is re-ordered on its own starting at the base. Without a base this is plain splitDays.
 */
export function planDays(stops, perDay, base) {
  if (!base) return splitDays(planRoute(stops, null), perDay, null)
  const sweep = planRoute(stops, base)
  const size = Math.max(1, perDay || sweep.length || 1)
  const days = []
  for (let i = 0; i < sweep.length; i += size) {
    const ordered = planRoute(sweep.slice(i, i + size), base)
    let km = 0, prev = base
    for (const s of ordered) { km += haversineKm(prev, s); prev = s }
    days.push({ day: days.length + 1, stops: ordered, km, from: base })
  }
  return days
}

const pt = (p) => `${p.latitude},${p.longitude}`

/**
 * Google Maps directions links for a day. The Maps URL format allows at most 9 intermediate waypoints,
 * so longer days are split into consecutive legs that share an end point (leg 2 starts where leg 1 ended).
 */
export function googleLegs(stops, from) {
  const pts = from ? [from, ...stops] : [...stops]
  if (pts.length < 2) return pts.length === 1 ? [{ url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pt(pts[0]))}`, count: 1 }] : []
  const legs = []
  const MAX_POINTS = 11 // origin + 9 waypoints + destination
  for (let i = 0; i < pts.length - 1; i += MAX_POINTS - 1) {
    const seg = pts.slice(i, i + MAX_POINTS)
    if (seg.length < 2) break
    const params = new URLSearchParams({ api: '1', origin: pt(seg[0]), destination: pt(seg[seg.length - 1]), travelmode: 'driving' })
    if (seg.length > 2) params.set('waypoints', seg.slice(1, -1).map(pt).join('|'))
    legs.push({ url: `https://www.google.com/maps/dir/?${params}`, count: seg.length - 1 })
  }
  return legs
}

export const DAY_COLORS = ['#1f4fd8', '#d97706', '#0f766e', '#7c3aed', '#be185d', '#b91c1c', '#4d7c0f', '#0369a1']
