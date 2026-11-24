// Where the API lives. Empty in development (Vite proxies /api to localhost:5100); in production set VITE_API_URL at
// build time, e.g. https://crmapi.sivayaantechnologies.com (no trailing slash). See web/.env.production.
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

// Login token, kept in this browser only. Cleared on sign-out or when the API says it is no longer valid.
const TOKEN_KEY = 'crm.token'
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' } }
export const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch { /* storage unavailable */ } }
export const SIGNED_OUT = 'crm:signed-out'

async function request(method, url, body) {
  const token = getToken()
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(API_BASE + url, { method, headers, body: body ? JSON.stringify(body) : undefined })
  if (res.status === 401 && url !== '/api/auth/login') {
    setToken('')
    window.dispatchEvent(new Event(SIGNED_OUT))
    throw new Error('Your session has expired. Please sign in again.')
  }
  if (!res.ok) throw new Error((await res.text()) || `${method} ${url} failed (${res.status})`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

const qs = (params) => {
  const p = new URLSearchParams()
  Object.entries(params || {}).forEach(([k, v]) => v !== '' && v != null && p.set(k, v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const api = {
  login: (username, password) => request('POST', '/api/auth/login', { username, password }),
  meta: () => request('GET', '/api/meta'),
  dashboard: (productId) => request('GET', `/api/dashboard${qs({ productId })}`),
  accounts: (p) => request('GET', `/api/accounts${qs(p)}`),
  account: (id) => request('GET', `/api/accounts/${id}`),
  createAccount: (a) => request('POST', '/api/accounts', a),
  deleteAccount: (id) => request('DELETE', `/api/accounts/${id}`),
  reach: (p) => request('GET', `/api/reach${qs(p)}`),
  recordVisit: (b) => request('POST', '/api/visits', b),
  routeStops: (p) => request('GET', `/api/route/stops${qs(p)}`),
  customers: (p) => request('GET', `/api/customers${qs(p)}`),
  followups: (p) => request('GET', `/api/followups${qs(p)}`),
  followedUp: (id, b) => request('POST', `/api/leads/${id}/followed-up`, b ?? {}),
  orders: (p) => request('GET', `/api/orders${qs(p)}`),
  createOrder: (o) => request('POST', '/api/orders', o),
  deleteOrder: (id) => request('DELETE', `/api/orders/${id}`),
  importLeads: (b) => request('POST', '/api/import/leads', b),
  products: () => request('GET', '/api/products'),
  createProduct: (p) => request('POST', '/api/products', p),
  updateProduct: (id, p) => request('PUT', `/api/products/${id}`, p),
  deleteProduct: (id) => request('DELETE', `/api/products/${id}`),
  updateAccount: (id, a) => request('PUT', `/api/accounts/${id}`, a),
  createLead: (l) => request('POST', '/api/leads', l),
  deleteLead: (id) => request('DELETE', `/api/leads/${id}`),
  leads: (p) => request('GET', `/api/leads${qs(p)}`),
  updateLead: (id, l) => request('PUT', `/api/leads/${id}`, l),
  convertLead: (id, b) => request('POST', `/api/leads/${id}/convert`, b),
  contacts: (p) => request('GET', `/api/contacts${qs(p)}`),
  createContact: (c) => request('POST', '/api/contacts', c),
  updateContact: (id, c) => request('PUT', `/api/contacts/${id}`, c),
  deleteContact: (id) => request('DELETE', `/api/contacts/${id}`),
  deals: (p) => request('GET', `/api/deals${qs(p)}`),
  createDeal: (d) => request('POST', '/api/deals', d),
  updateDeal: (id, d) => request('PUT', `/api/deals/${id}`, d),
  moveDeal: (id, stage) => request('PATCH', `/api/deals/${id}/stage`, { stage }),
  deleteDeal: (id) => request('DELETE', `/api/deals/${id}`),
  createActivity: (a) => request('POST', '/api/activities', a),
  deleteActivity: (id) => request('DELETE', `/api/activities/${id}`),
}

export const money = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0)
export const dateStr = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
export const dateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '')
