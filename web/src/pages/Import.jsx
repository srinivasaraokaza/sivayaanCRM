import { useState } from 'react'
import Papa from 'papaparse'
import readExcel from 'read-excel-file/browser'
import { api } from '../api'
import { ErrorBox } from '../ui.jsx'
import { useProduct } from '../product.jsx'
import { Link } from 'react-router-dom'

// key = field sent to API; aliases are matched against normalised header names for auto-mapping.
const FIELDS = [
  { key: 'name', label: 'Business / customer name', required: true, aliases: ['name', 'business', 'businessname', 'company', 'companyname', 'customer', 'customername', 'organisation', 'organization', 'firm', 'hospital', 'clinic', 'shop', 'hotel', 'lodge', 'store', 'agency', 'client', 'clientname', 'party', 'partyname', 'transporter', 'dealer', 'tradename', 'shopname', 'hotelname', 'property'] },
  { key: 'contactName', label: 'Contact person', aliases: ['contact', 'contactname', 'contactperson', 'owner', 'ownername', 'person', 'decisionmaker'] },
  { key: 'phone', label: 'Phone', aliases: ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'mobileno', 'contactno', 'contactnumber', 'whatsapp', 'tel', 'telephone'] },
  { key: 'email', label: 'Email', aliases: ['email', 'emailid', 'emailaddress', 'mail'] },
  { key: 'city', label: 'City', aliases: ['city', 'town', 'location', 'district'] },
  { key: 'industry', label: 'Industry', aliases: ['industry', 'sector', 'vertical'] },
  { key: 'category', label: 'Category / type', aliases: ['category', 'type', 'businesstype', 'segment'] },
  { key: 'latitude', label: 'Latitude (for Google Maps)', aliases: ['latitude', 'lat', 'gpslat', 'googlelatitude'] },
  { key: 'longitude', label: 'Longitude (for Google Maps)', aliases: ['longitude', 'lng', 'lon', 'long', 'gpslong', 'googlelongitude'] },
  { key: 'website', label: 'Website', aliases: ['website', 'web', 'url', 'site'] },
  { key: 'source', label: 'Lead source', aliases: ['source', 'leadsource', 'channel', 'origin'] },
  { key: 'priority', label: 'Priority', aliases: ['priority', 'rating', 'temperature'] },
  { key: 'nextAction', label: 'Next action', aliases: ['nextaction', 'action', 'nextstep'] },
  { key: 'followUpDate', label: 'Follow-up date', aliases: ['followup', 'followupdate', 'nextfollowup', 'duedate', 'due'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'remarks', 'comments', 'comment', 'description'] },
]

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

function cellText(v) {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'number') return Number.isInteger(v) ? v.toFixed(0) : String(v) // keep long phone numbers out of exponent form
  return String(v).trim()
}

function autoMap(headers) {
  const used = new Set()
  const map = {}
  for (const f of FIELDS) {
    const i = headers.findIndex((h, idx) => !used.has(idx) && f.aliases.includes(norm(h)))
    if (i >= 0) { map[f.key] = i; used.add(i) }
  }
  if (map.name == null) {
    // Fallback: any unused column whose header mentions "name" (e.g. "Practice Name").
    const i = headers.findIndex((h, idx) => !used.has(idx) && norm(h).includes('name'))
    if (i >= 0) map.name = i
  }
  return map
}

async function readFile(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  if (ext === 'csv' || ext === 'txt') {
    const text = await file.text()
    const res = Papa.parse(text, { skipEmptyLines: 'greedy' })
    return [{ sheet: 'CSV', data: res.data }]
  }
  if (ext === 'xlsx') return readExcel(file)
  throw new Error('Unsupported file type. Use .xlsx or .csv (save .xls files as .xlsx first).')
}

export default function Import() {
  const { meta, productId, reloadMeta } = useProduct()
  const [pid, setPid] = useState(productId || String(meta.products[0]?.id ?? ''))
  const [source, setSource] = useState('')
  const [sheets, setSheets] = useState(null)
  const [sheetIdx, setSheetIdx] = useState(0)
  const [fileName, setFileName] = useState('')
  const [map, setMap] = useState({})
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const data = sheets?.[sheetIdx]?.data ?? []
  const headers = (data[0] ?? []).map((h, i) => cellText(h) || `Column ${i + 1}`)
  const bodyRows = data.slice(1).filter((r) => r.some((c) => cellText(c) !== ''))

  const load = async (file) => {
    setErr(null); setPreview(null); setResult(null); setSheets(null)
    if (!file) return
    try {
      const s = (await readFile(file)).filter((x) => x.data.length > 1)
      if (s.length === 0) throw new Error('No data rows found in this file.')
      setSheets(s); setSheetIdx(0); setFileName(file.name)
      setMap(autoMap(s[0].data[0].map(cellText)))
    } catch (x) { setErr(x.message) }
  }

  const pickSheet = (i) => {
    setSheetIdx(i); setPreview(null); setResult(null)
    setMap(autoMap(sheets[i].data[0].map(cellText)))
  }

  const buildRows = () => bodyRows.map((r) => {
    const o = {}
    for (const f of FIELDS) o[f.key] = map[f.key] != null ? cellText(r[map[f.key]]) : null
    return o
  })

  const run = async (dryRun) => {
    setBusy(true); setErr(null)
    try {
      const res = await api.importLeads({ productId: Number(pid), defaultSource: source || null, dryRun, rows: buildRows() })
      if (dryRun) setPreview(res)
      else { setResult(res); setPreview(null); reloadMeta() }
    } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }

  const ready = sheets && map.name != null && pid
  const product = meta.products.find((p) => String(p.id) === String(pid))
  const issues = (res) => (res.skipped > 0 || res.errors > 0) && (
    <details style={{ marginTop: 8 }}>
      <summary>{res.skipped} skipped · {res.errors} with errors</summary>
      {[...res.errorRows.map((r) => ({ ...r, kind: 'Error' })), ...res.skippedRows.map((r) => ({ ...r, kind: 'Skipped' }))].map((r, i) => (
        <div className="rec" key={i}><b>Row {r.row}</b> {r.name} <span className="muted">— {r.kind}: {r.reason}</span></div>
      ))}
      {(res.skipped > 200 || res.errors > 200) && <p className="muted">Showing the first 200 of each.</p>}
    </details>
  )

  return (
    <>
      <div className="head"><h2>Import leads</h2></div>
      <p className="muted">Upload an .xlsx or .csv file. Rows become leads for the chosen product. Customers already in the CRM (same phone, email, or name + city) are reused, not duplicated.</p>
      <ErrorBox error={err} />

      <div className="panel" style={{ marginBottom: 14 }}>
        <h3>1. Product and file</h3>
        <div className="filters">
          <select value={pid} onChange={(e) => { setPid(e.target.value); setPreview(null); setResult(null) }}>
            {meta.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input placeholder="Lead source for all rows (optional)" list="sources" value={source} onChange={(e) => setSource(e.target.value)} />
          <datalist id="sources">{meta.leadSources.map((s) => <option key={s} value={s} />)}</datalist>
          <input type="file" accept=".xlsx,.csv,.txt" onChange={(e) => load(e.target.files[0])} />
        </div>
        {sheets && <p className="muted">{fileName} · {bodyRows.length} data rows</p>}
        {sheets && sheets.length > 1 && (
          <label className="muted">Sheet{' '}
            <select value={sheetIdx} onChange={(e) => pickSheet(Number(e.target.value))}>{sheets.map((s, i) => <option key={i} value={i}>{s.sheet} ({s.data.length - 1} rows)</option>)}</select>
          </label>
        )}
      </div>

      {sheets && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <h3>2. Match columns</h3>
          <div className="grid2" style={{ marginBottom: 0 }}>
            {FIELDS.map((f) => (
              <label key={f.key} className="muted" style={{ display: 'block' }}>
                {f.label}{f.required && ' *'}
                <select style={{ width: '100%' }} value={map[f.key] ?? ''} onChange={(e) => { setMap({ ...map, [f.key]: e.target.value === '' ? undefined : Number(e.target.value) }); setPreview(null) }}>
                  <option value="">— not in file —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          {map.name == null && <p className="err" style={{ marginTop: 10 }}>Map the business / customer name column to continue.</p>}
          <h3 style={{ marginTop: 16 }}>First rows</h3>
          <div className="tbl-wrap">
            <table>
              <thead><tr>{FIELDS.filter((f) => map[f.key] != null).map((f) => <th key={f.key}>{f.label}</th>)}</tr></thead>
              <tbody>
                {bodyRows.slice(0, 5).map((r, i) => (
                  <tr key={i}>{FIELDS.filter((f) => map[f.key] != null).map((f) => <td key={f.key}>{cellText(r[map[f.key]])}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions"><button disabled={!ready || busy} onClick={() => run(true)}>{busy ? 'Checking…' : 'Check file'}</button></div>
        </div>
      )}

      {preview && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <h3>3. Confirm import into {product?.name}</h3>
          <p><b>{preview.created}</b> leads will be created ({preview.newAccounts} new customers, {preview.linkedToExisting} linked to existing customers).</p>
          {issues(preview)}
          <div className="actions">
            <button className="primary" disabled={busy || preview.created === 0} onClick={() => run(false)}>{busy ? 'Importing…' : `Import ${preview.created} leads`}</button>
          </div>
        </div>
      )}

      {result && (
        <div className="panel">
          <h3>Import complete</h3>
          <p><b>{result.created}</b> leads added to {result.product} ({result.newAccounts} new customers, {result.linkedToExisting} linked to existing).</p>
          {issues(result)}
          <p><Link to="/leads">View leads →</Link></p>
        </div>
      )}
    </>
  )
}
