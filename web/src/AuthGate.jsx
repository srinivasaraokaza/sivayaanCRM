import { createContext, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken, SIGNED_OUT } from './api'

const Ctx = createContext({ username: '', signOut: () => {} })
export const useAuth = () => useContext(Ctx)

const readUser = () => { try { return localStorage.getItem('crm.user') || '' } catch { return '' } }
const saveUser = (u) => { try { u ? localStorage.setItem('crm.user', u) : localStorage.removeItem('crm.user') } catch { /* storage unavailable */ } }

// Shows the sign-in page until there is a login token; the rest of the app (and its API calls) only mounts after that.
export default function AuthGate({ children }) {
  const [signedIn, setSignedIn] = useState(!!getToken())
  const [username, setUsername] = useState(readUser())
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const out = () => { setSignedIn(false); setError('Your session has expired. Please sign in again.') }
    window.addEventListener(SIGNED_OUT, out)
    return () => window.removeEventListener(SIGNED_OUT, out)
  }, [])

  const signOut = () => { setToken(''); saveUser(''); setSignedIn(false); setError('') }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const r = await api.login(form.username.trim(), form.password)
      setToken(r.token); saveUser(r.username)
      setUsername(r.username); setForm({ username: '', password: '' }); setSignedIn(true)
    } catch (err) {
      let msg = err.message
      try { msg = JSON.parse(msg).error ?? msg } catch { /* not JSON */ }
      setError(msg.includes('Failed to fetch') ? 'Cannot reach the server. Check your connection and try again.' : msg)
    } finally { setBusy(false) }
  }

  if (signedIn) return <Ctx.Provider value={{ username, signOut }}>{children}</Ctx.Provider>
  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>Sivayaan CRM</h1>
        <p className="muted">Sign in to continue</p>
        {error && <div className="err">{error}</div>}
        <label>Username
          <input autoFocus autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        </label>
        <label>Password
          <input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </label>
        <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
}
