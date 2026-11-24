// Compact INR for chart labels and cards: 4,500 -> ₹4.5K, 150000 -> ₹1.5L, 25000000 -> ₹2.5Cr
export function moneyShort(n) {
  const v = Number(n) || 0
  const a = Math.abs(v)
  const s = (x) => String(Math.round(x * 10) / 10)
  if (a >= 1e7) return `₹${s(v / 1e7)}Cr`
  if (a >= 1e5) return `₹${s(v / 1e5)}L`
  if (a >= 1e3) return `₹${s(v / 1e3)}K`
  return `₹${Math.round(v)}`
}

// Indian numbers: a bare 10-digit number gets the 91 country code; a leading 0 is dropped.
// Only mobiles can use WhatsApp: Indian mobiles are 10 digits starting 6-9, so landlines (e.g. +91 40 4015 6656) are
// refused. A number written with a non-Indian "+" country code is accepted as given.
export function waNumber(phone) {
  const raw = String(phone ?? '').trim()
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  else if (raw.startsWith('+') && !raw.startsWith('+91') && d.length >= 11 && d.length <= 15) return d
  return d.length === 10 && '6789'.includes(d[0]) ? `91${d}` : null
}

export function waLink(phone, text) {
  const n = waNumber(phone)
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null
}

const hasCoords = (lat, lng) => Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat != null && lng != null

// Google Maps URLs. With coordinates they open the exact pin; without, they fall back to a text search on name + area.
export function mapsLink({ latitude, longitude, name, area }) {
  const q = hasCoords(latitude, longitude) ? `${latitude},${longitude}` : [name, area].filter(Boolean).join(' ')
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null
}

export function directionsLink({ latitude, longitude, name, area }) {
  const q = hasCoords(latitude, longitude) ? `${latitude},${longitude}` : [name, area].filter(Boolean).join(' ')
  return q ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}` : null
}

export const exactLocation = (a) => hasCoords(a.latitude, a.longitude)

// Pull "lat,lng" out of a pasted Google Maps URL (…/@17.51,78.30,17z, !3d..!4d.., ?q=lat,lng) or plain "17.51, 78.30".
export function parseCoords(text) {
  const t = decodeURIComponent(String(text ?? '')).trim()
  const num = '(-?\\d{1,3}(?:\\.\\d+)?)'
  const patterns = [`@${num},${num}`, `!3d${num}!4d${num}`, `[?&](?:q|query|ll|destination)=${num},\\s*${num}`, `^${num}\\s*[, ]\\s*${num}$`]
  for (const p of patterns) {
    const m = t.match(new RegExp(p))
    if (m) {
      const lat = Number(m[1]), lng = Number(m[2])
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { latitude: lat, longitude: lng }
    }
  }
  return null
}

export const plural = (w) => (/[^aeiou]y$/i.test(w) ? `${w.slice(0, -1)}ies` : /s$/i.test(w) ? w : `${w}s`)

export const segmentsOf = (product) =>
  (product?.segments ?? '').split(',').map((s) => s.trim()).filter(Boolean)
