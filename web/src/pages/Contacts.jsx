import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { ErrorBox, Pager, useDebounced, useLoad } from '../ui.jsx'
import { useProduct } from '../product.jsx'
import { ContactModal } from './AccountDetail.jsx'

export default function Contacts() {
  const { productId } = useProduct()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const search = useDebounced(q)
  const { data, error, loading, reload } = useLoad(() => api.contacts({ search, productId, page, pageSize: 25 }), [search, productId, page])
  const [edit, setEdit] = useState(null)
  const remove = async (c) => {
    if (!confirm(`Delete contact ${c.name}?`)) return
    await api.deleteContact(c.id)
    reload()
  }
  return (
    <>
      <div className="head"><h2>Contacts</h2></div>
      <p className="muted">Contacts belong to an account. Add new ones from the account page or when creating a lead.</p>
      <div className="filters"><input placeholder="Search contact or business…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} /></div>
      <ErrorBox error={error} />
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Name</th><th>Title</th><th>Business</th><th>Phone</th><th>Email</th><th>Decision maker</th><th /></tr></thead>
          <tbody>
            {data?.items.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td><td>{c.title}</td>
                <td><Link to={`/accounts/${c.accountId}`}>{c.account}</Link></td>
                <td>{c.phone}</td><td>{c.email}</td><td>{c.isDecisionMaker ? 'Yes' : ''}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="sm" onClick={() => setEdit(c)}>Edit</button>{' '}
                  <button className="sm danger" onClick={() => remove(c)}>Delete</button>
                </td>
              </tr>
            ))}
            {!loading && data?.items.length === 0 && <tr><td colSpan="7" className="muted">No contacts yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && <Pager page={page} pageSize={25} total={data.total} onPage={setPage} />}
      {edit && <ContactModal accountId={edit.accountId} contact={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
    </>
  )
}
