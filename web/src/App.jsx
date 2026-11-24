import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import Dashboard from './pages/Dashboard.jsx'
import Leads from './pages/Leads.jsx'
import Accounts from './pages/Accounts.jsx'
import AccountDetail from './pages/AccountDetail.jsx'
import Contacts from './pages/Contacts.jsx'
import Pipeline from './pages/Pipeline.jsx'
import Products from './pages/Products.jsx'
import Import from './pages/Import.jsx'
import RoutePlanner from './pages/RoutePlanner.jsx'
import Reach from './pages/Reach.jsx'
import Customers from './pages/Customers.jsx'
import FollowUpsPage from './pages/FollowUpsPage.jsx'
import { useProduct } from './product.jsx'
import { useAuth } from './AuthGate.jsx'

// Pages filtered by the product switcher.
const productLinks = [
  ['/', 'Dashboard'],
  ['/leads', 'Leads'],
  ['/followups', "Today's follow-ups"],
  ['/reach', 'Digital reach'],
  ['/route', 'Route planner'],
  ['/pipeline', 'Pipeline'],
  ['/customers', 'Customers'],
  ['/accounts', 'Accounts'],
  ['/contacts', 'Contacts'],
  ['/import', 'Import leads'],
]

// Pages that apply to the whole business, independent of the selected product.
const globalLinks = [
  ['/products', 'Products'],
]

const Item = ({ to, label }) => (
  <NavLink to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>
)

export default function App() {
  const { meta, productId, product, setProductId } = useProduct()
  const { username, signOut } = useAuth()
  return (
    <div className="shell">
      <nav className="side">
        <h1>Sivayaan CRM</h1>
        <small>Sales across all products</small>

        <div className="section">
          <div className="section-title">Sales</div>
          <label className="pick">
            Viewing product
            <select value={productId} onChange={(e) => setProductId(e.target.value)} style={{ borderLeft: `4px solid ${product?.color ?? 'transparent'}` }}>
              <option value="">All products</option>
              {meta.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {productLinks.map(([to, label]) => <Item key={to} to={to} label={label} />)}
        </div>

        <div className="section">
          <div className="section-title">Global</div>
          {globalLinks.map(([to, label]) => <Item key={to} to={to} label={label} />)}
        </div>

        <div className="section signout">
          <small>Signed in as <b>{username}</b></small>
          <button className="sm" onClick={signOut}>Sign out</button>
        </div>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/accounts/:id" element={<AccountDetail />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/followups" element={<FollowUpsPage />} />
          <Route path="/reach" element={<Reach />} />
          <Route path="/route" element={<RoutePlanner />} />
          <Route path="/import" element={<Import />} />
          <Route path="/products" element={<Products />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
