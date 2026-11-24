import { useState } from 'react'
import { api } from '../api'
import { ErrorBox, Modal } from '../ui.jsx'
import { useProduct } from '../product.jsx'

// yyyy-mm-dd for "today + n days" in the user's local calendar (not UTC, which can be a day off around midnight).
function localDate(addDays) {
  const d = new Date()
  d.setDate(d.getDate() + addDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Record what happened at a field visit. Picking an outcome fills in the lead's new status, next action and follow-up
 * date (all editable), then saves the visit, updates the lead, and remembers who was met.
 *  leads: the open leads (products) at this facility; with more than one, the user chooses which the visit was about.
 */
export default function VisitModal({ accountId, accountName, leads, leadId, onClose, onSaved }) {
  const { meta } = useProduct()
  const [f, setF] = useState({
    leadId: leadId ?? leads[0]?.id ?? '', outcome: '', notes: '', contactName: '', contactPhone: '', contactEmail: '', decisionMaker: false,
    followUpDate: '', nextAction: '', currentSoftware: '',
  })
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const chosen = meta.visitOutcomes.find((o) => o.code === f.outcome)

  const pick = (o) => setF({ ...f, outcome: o.code, followUpDate: o.days > 0 ? localDate(o.days) : '', nextAction: o.nextAction ?? '' })

  const submit = async (e) => {
    e.preventDefault()
    if (!chosen) { setErr('Choose what happened at the visit.'); return }
    setBusy(true)
    try {
      await api.recordVisit({
        accountId, leadId: f.leadId ? Number(f.leadId) : null, outcome: f.outcome, notes: f.notes || null,
        contactName: f.contactName || null, contactPhone: f.contactPhone || null, contactEmail: f.contactEmail || null, decisionMaker: f.decisionMaker,
        followUpDate: f.followUpDate || null, nextAction: f.nextAction || null, currentSoftware: f.currentSoftware || null,
      })
      onSaved(chosen)
    } catch (x) { setErr(x.message); setBusy(false) }
  }

  return (
    <Modal title={`Record visit — ${accountName}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ErrorBox error={err} />
        {leads.length > 1 && (
          <label>Visit was about
            <select value={f.leadId} onChange={set('leadId')}>{leads.map((l) => <option key={l.id} value={l.id}>{l.product}</option>)}</select>
          </label>
        )}

        <div className="muted" style={{ marginBottom: 6 }}>What happened? *</div>
        <div className="outcomes" role="radiogroup" aria-label="Visit outcome">
          {meta.visitOutcomes.map((o) => (
            <button type="button" key={o.code} role="radio" aria-checked={f.outcome === o.code}
              className={`outcome tone-${o.tone} ${f.outcome === o.code ? 'on' : ''}`} onClick={() => pick(o)}>{o.label}</button>
          ))}
        </div>
        {chosen && (
          <p className="muted" style={{ margin: '8px 0 12px' }}>
            {chosen.status === 'Unqualified' ? 'Closes this lead (no more follow-ups).'
              : `${chosen.status ? `Lead moves to ${chosen.status} (never backwards). ` : 'Lead status stays as it is. '}${chosen.days ? `Follow-up suggested in ${chosen.days} day${chosen.days === 1 ? '' : 's'}.` : ''}`}
          </p>
        )}

        {chosen && (
          <>
            <div className="row">
              <label>Next follow-up {chosen.days === 0 && '(optional — blank closes the lead)'}
                <input type="date" value={f.followUpDate} onChange={set('followUpDate')} min={localDate(0)} />
              </label>
              <label>Next action<input value={f.nextAction} onChange={set('nextAction')} /></label>
            </div>
            {chosen.code === 'HAS_SOFTWARE' && <label>Software they use<input value={f.currentSoftware} onChange={set('currentSoftware')} placeholder="e.g. Practo, in-house" /></label>}
            <label>Notes — what they said{chosen.code === 'NOT_INTERESTED' ? ' (reason)' : ''}
              <textarea value={f.notes} onChange={set('notes')} placeholder="Questions asked, objections, who to call back…" />
            </label>
            <div className="row">
              <label>Person you met<input value={f.contactName} onChange={set('contactName')} placeholder="Name" /></label>
              <label>Their phone<input value={f.contactPhone} onChange={set('contactPhone')} /></label>
            </div>
            <label>Their email<input type="email" value={f.contactEmail} onChange={set('contactEmail')} placeholder="So we can follow up by email" /></label>
            {f.contactName && <label className="check"><input type="checkbox" checked={f.decisionMaker} onChange={(e) => setF({ ...f, decisionMaker: e.target.checked })} /> Decision maker</label>}
          </>
        )}
        <div className="actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy || !chosen}>{busy ? 'Saving…' : 'Save visit'}</button>
        </div>
      </form>
    </Modal>
  )
}
