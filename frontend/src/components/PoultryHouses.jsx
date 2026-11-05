import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../api/axios'
import './poultry-houses.css'

export default function PoultryHouses({ farmId, readOnly = false }) {
  return <HouseInventory key={farmId} farmId={farmId} readOnly={readOnly} />
}

function HouseInventory({ farmId, readOnly }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmation, setConfirmation] = useState(null)
  const [addDialog, setAddDialog] = useState(false)
  const [houseCount, setHouseCount] = useState(1)
  const [retryAdd, setRetryAdd] = useState(false)
  const creationRequest = useRef(null)
  const creationCount = useRef(1)
  const version = useRef(0)
  const lifetime = useRef(null)
  const path = `/farms/${farmId}/poultry-houses`
  const load = useCallback(async signal => {
    const current = ++version.current
    setLoading(true)
    try {
      const response = await api.get(`/farms/${farmId}/poultry-houses`, { signal })
      if (current !== version.current || signal?.aborted || !lifetime.current?.active) return
      if (String(response.data?.data?.farm_id) !== String(farmId)) throw Error('The house records did not match this farm. Please refresh.')
      setData(response.data.data)
      setError('')
    } catch (failure) {
      if (current === version.current && !signal?.aborted && lifetime.current?.active) {
        setData(null)
        setError(failure.response?.data?.message || 'House records could not be loaded. Please refresh.')
      }
    } finally {
      if (current === version.current && !signal?.aborted && lifetime.current?.active) setLoading(false)
    }
  }, [farmId])
  useEffect(() => {
    const context = { active: true }
    const controller = new AbortController()
    lifetime.current = context
    Promise.resolve().then(() => { if (context.active) load(controller.signal) })
    return () => { context.active = false; controller.abort() }
  }, [load])
  const current = String(data?.farm_id) === String(farmId) ? data : null
  const canManage = !readOnly && current?.can_manage === true

  const add = async () => {
    if (busy) return
    const context = version.current
    setBusy(true); setError(''); setNotice('')
    try {
      creationRequest.current ||= crypto.randomUUID()
      const response = await api.post(path, { request_id: creationRequest.current, count: creationCount.current })
      if (context !== version.current || !lifetime.current?.active) return
      const created = response.data.data.houses || [response.data.data.house]
      creationRequest.current = null; creationCount.current = 1; setRetryAdd(false); setAddDialog(false)
      setNotice(`${created.length} ${created.length === 1 ? 'house was' : 'houses were'} added.`)
      await load()
    } catch (failure) {
      if (context === version.current && lifetime.current?.active) {
        setRetryAdd(true)
        setError(failure.response?.data?.message || 'The result could not be confirmed. Retry Add House to check this request safely.')
      }
    } finally {
      // load() advances the fetch version; the component key scopes writes to this farm.
      if (lifetime.current?.active) setBusy(false)
    }
  }

  const confirmAdd = () => {
    const count = Number(houseCount)
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      setError('Enter a whole number from 1 to 100.')
      return
    }
    creationCount.current = count
    add()
  }

  const transition = async () => {
    if (busy || !confirmation) return
    const context = version.current
    const { house, action } = confirmation
    setBusy(true); setError(''); setNotice('')
    try {
      await api.patch(`${path}/${house.id}/${action}`)
      if (context !== version.current || !lifetime.current?.active) return
      setConfirmation(null)
      setNotice(`${house.name} ${action === 'deactivate' ? 'deactivated' : 'reactivated'}. Device assignments were not changed.`)
      await load()
    } catch (failure) {
      if (context === version.current && lifetime.current?.active) setError(failure.response?.data?.message || 'The house status could not be changed. Please refresh and try again.')
    } finally {
      if (lifetime.current?.active) setBusy(false)
    }
  }

  return <section className="ph-section" aria-label="Poultry Houses">
    <div className="ph-heading"><h2>Poultry Houses</h2><div className="ph-actions">
      {canManage && <button className="ph-primary" type="button" onClick={() => retryAdd ? add() : (setError(''), setHouseCount(1), setAddDialog(true))} disabled={busy || loading}>{busy && !confirmation ? 'Saving…' : retryAdd ? 'Retry add houses' : 'Add houses'}</button>}
    </div></div>
    {error && <p className="ph-error" role="alert">{error}</p>}
    {notice && <p className="ph-notice" role="status">{notice}</p>}
    {loading && <p className="ph-note" role="status">Loading houses…</p>}
    {!loading && current && <>
      {current.available === true && <p className="ph-count"><strong>{current.houses.length}</strong> registered {current.houses.length === 1 ? 'house' : 'houses'}</p>}
      {current.houses.length > 0 ? <div className="ph-scroll"><table>
        <thead><tr><th>House</th><th>Assigned Device</th><th>Status</th><th>Monitoring</th>{canManage && <th>Actions</th>}</tr></thead>
        <tbody>{current.houses.map(house => <tr key={house.id}>
          <td data-label="House">{house.name}</td>
          <td data-label="Assigned Device"><div>{house.assigned_devices.length ? house.assigned_devices.map(device => <div key={device.id}>{device.device_name} <span className="ph-device-status">({device.status})</span></div>) : 'No assigned device'}</div></td>
          <td data-label="Lifecycle Status"><span className={`ph-status ph-status--${house.status.toLowerCase()}`}>{house.status}</span></td>
          <td data-label="Monitoring">{house.status === 'Inactive' ? 'Inactive' : ['verified', 'dummy_approved'].includes(current.inventory_status) && house.assigned_devices.some(device => device.status === 'Active') ? 'View monitoring for current condition' : 'Not Monitored'}</td>
          {canManage && <td data-label="Actions"><button type="button" disabled={busy} onClick={() => setConfirmation({ house, action: house.status === 'Active' ? 'deactivate' : 'reactivate' })}>
            {house.status === 'Active' ? 'Deactivate House' : 'Reactivate House'}
          </button></td>}
        </tr>)}</tbody>
      </table></div> : current.inventory_status === 'verified' && <p className="ph-note">No poultry houses are recorded.</p>}
      {canManage && confirmation && <div className="ph-confirmation" role="group" aria-label="Confirm house status change">
        <p>{confirmation.action === 'deactivate' ? `Deactivate ${confirmation.house.name}? Every Active and Inactive device must be explicitly unassigned first.`
          : `Reactivate ${confirmation.house.name}? Previous device assignments will not be restored.`}</p>
        <div className="ph-actions"><button type="button" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</button>
          <button type="button" disabled={busy} onClick={transition}>{busy ? 'Saving…' : confirmation.action === 'deactivate' ? 'Confirm Deactivate' : 'Confirm Reactivate'}</button></div>
      </div>}
      {canManage && addDialog && <div className="ph-modal-backdrop" role="presentation" onMouseDown={() => !busy && setAddDialog(false)}>
        <div className="ph-modal" role="dialog" aria-modal="true" aria-labelledby="ph-add-title" onMouseDown={event => event.stopPropagation()}>
          <h3 id="ph-add-title">Add poultry houses</h3>
          <p>Choose how many new houses to add. Names are assigned in sequence and saved together.</p>
          <label>Number of houses<input type="number" min="1" max="100" step="1" value={houseCount} onChange={event => setHouseCount(event.target.value)} autoFocus disabled={busy} /></label>
          <div className="ph-actions"><button type="button" onClick={() => setAddDialog(false)} disabled={busy}>Cancel</button><button className="ph-primary" type="button" onClick={confirmAdd} disabled={busy}>{busy ? 'Saving…' : 'Confirm and save'}</button></div>
        </div>
      </div>}
    </>}
  </section>
}
