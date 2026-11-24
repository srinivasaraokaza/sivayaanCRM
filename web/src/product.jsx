import { createContext, useContext, useEffect, useState } from 'react'
import { api } from './api'

const Ctx = createContext(null)
export const useProduct = () => useContext(Ctx)

const read = () => {
  try { return localStorage.getItem('crm.productId') || '' } catch { return '' }
}

export function ProductProvider({ children }) {
  const [meta, setMeta] = useState(null)
  const [error, setError] = useState(null)
  const [productId, setPid] = useState(read())

  const reloadMeta = () => api.meta().then(setMeta, (e) => setError(e.message))
  useEffect(() => { reloadMeta() }, [])

  const setProductId = (id) => {
    setPid(id)
    try { localStorage.setItem('crm.productId', id) } catch { /* storage unavailable */ }
  }
  // A stored selection may point at a product that was deactivated.
  const valid = meta && productId && meta.products.some((p) => String(p.id) === String(productId))
  const effective = valid ? productId : ''
  const product = meta?.products.find((p) => String(p.id) === String(effective)) ?? null

  if (error) return <div className="main"><div className="err">{error}</div></div>
  if (!meta) return <div className="main"><p className="muted">Loading…</p></div>
  return <Ctx.Provider value={{ meta, productId: effective, product, setProductId, reloadMeta }}>{children}</Ctx.Provider>
}
