import { useEffect, useMemo, useRef, useState } from 'react'
import api from '../api/axios'
import './device-assignment-dialog.css'

// Both authorized device interfaces use the same explicit selection contract.
export default function DeviceAssignmentDialog({ device, farms: suppliedFarms, onClose, onSuccess }) {
  const [farms, setFarms] = useState(suppliedFarms || [])
  const [farmId, setFarmId] = useState('')
  const [houseId, setHouseId] = useState('')
  const [inventory, setInventory] = useState(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(false)
  const [stale, setStale] = useState(false)
  const [confirmation, setConfirmation] = useState(null)
  const [farmOpen, setFarmOpen] = useState(false)
  const [farmQuery, setFarmQuery] = useState('')
  const [farmIndex, setFarmIndex] = useState(-1)
  const dialog = useRef(null)
  const submitting = useRef(false)
  useEffect(() => {
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.querySelector('input')?.focus()
    return () => { document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus() }
  }, [])
  useEffect(() => {
    if (suppliedFarms) return
    const controller = new AbortController()
    api.get('/admin/farms', { signal: controller.signal }).then(response => {
      if (!controller.signal.aborted) {
        const rows = response.data?.data?.data ?? response.data?.data ?? []
        setFarms(Array.isArray(rows) ? rows : [])
      }
    }).catch(() => { if (!controller.signal.aborted) setError('Farms could not be loaded. Close and try again.') })
    return () => controller.abort()
  }, [suppliedFarms])
  useEffect(() => {
    if (!farmId) return
    const controller = new AbortController()
    api.get(`/farms/${farmId}/poultry-houses`, { signal: controller.signal }).then(response => {
      if (controller.signal.aborted) return
      const data = response.data?.data
      if (String(data?.farm_id) !== farmId) throw Error('House records did not match this farm.')
      setInventory(data); setLoading(false)
    }).catch(failure => {
      if (!controller.signal.aborted) { setInventory(null); setLoading(false); setError(failure.response?.data?.message || failure.message || 'Houses could not be loaded.') }
    })
    return () => controller.abort()
  }, [farmId])
  const verified = inventory?.available === true && ['verified', 'dummy_approved'].includes(inventory?.inventory_status) && inventory?.can_manage === true && String(inventory?.farm_id) === farmId
  const houses = verified ? inventory.houses.filter(house => house.status === 'Active') : []
  const emptyInventory = inventory?.available === true && Array.isArray(inventory?.houses) && inventory.houses.length === 0
  const occupied = house => device.status === 'Active' && house.assigned_devices.some(other => other.status === 'Active' && String(other.id) !== String(device.id))
  const chooseFarm = value => { setFarmId(value); setHouseId(''); setInventory(null); setConfirmation(null); setLoading(Boolean(value)); setError(''); setFarmOpen(false); setFarmIndex(-1) }
  const matches = useMemo(() => {
    const query = farmQuery.trim().toLowerCase()
    if (!query) return farms
    return farms.filter(farm => [farm.farm_name, farm.barangay, farm.address].some(value => String(value || '').toLowerCase().includes(query)))
  }, [farms, farmQuery])
  const selectedFarm = farms.find(farm => String(farm.id) === farmId)
  const farmKeyDown = event => {
    if (event.key === 'Escape') { setFarmOpen(false); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); setFarmOpen(true); setFarmIndex(index => Math.min(index + 1, matches.length - 1)); return }
    if (event.key === 'ArrowUp') { event.preventDefault(); setFarmIndex(index => Math.max(index - 1, 0)); return }
    if (event.key === 'Enter' && farmOpen && matches[farmIndex]) { event.preventDefault(); chooseFarm(String(matches[farmIndex].id)) }
  }
  const dismiss = () => { if (!submitting.current) onClose() }
  const save = async event => {
    event.preventDefault()
    if (submitting.current || !verified || !houses.some(house => String(house.id) === houseId && !occupied(house)) || stale) return
    if (!confirmation) {
      setConfirmation({ deviceId: device.id, farmName: farms.find(farm => String(farm.id) === farmId)?.farm_name,
        houseName: houses.find(house => String(house.id) === houseId)?.name,
        payload: { farm_id: Number(farmId), poultry_house_id: Number(houseId), expected_assignment_version: device.assignment_version ?? 0 } })
      return
    }
    if (String(confirmation.deviceId) !== String(device.id)) { setStale(true); setError('This device changed. Close and select it again.'); return }
    submitting.current = true; setBusy(true); setError('')
    try {
      await api.patch(`/admin/sensors/${confirmation.deviceId}/assign`, confirmation.payload)
      onSuccess()
    } catch (failure) {
      const status = failure.response?.status
      setStale(status === 409)
      // Keep the exact destination and version after an uncertain outcome.
      setRetry(!status || status >= 500)
      setError(failure.response?.data?.message || 'The result could not be confirmed. Retry the same assignment to check it safely.')
    } finally { submitting.current = false; setBusy(false) }
  }
  const keyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss() }
    if (event.key !== 'Tab') return
    const controls = [...dialog.current.querySelectorAll('button:not(:disabled), select:not(:disabled)')]
    const first = controls[0], last = controls.at(-1)
    if (!controls.length) { event.preventDefault(); return }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus() }
  }
  return <div className="device-assignment-overlay" onClick={dismiss}>
    <form className="device-assignment-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="device-assignment-title" aria-busy={busy} tabIndex={-1} onSubmit={save} onClick={event => event.stopPropagation()} onKeyDown={keyDown}>
      <div className="device-assignment-heading"><h3 id="device-assignment-title">Assign {device.device_name}</h3><button type="button" aria-label="Close assignment" disabled={busy} onClick={dismiss}>&times;</button></div>
      <p>Current assignment: {device.farm_name || 'Unassigned'}{device.farm_id ? ` · ${device.house_name || 'No house selected'}` : ''}.</p>
      <p>Select a farm and house to continue.</p>
      {error && <p className="device-assignment-error" role="alert">{error}</p>}
      <label htmlFor="device-assignment-farm">Farm *</label>
      <div className="device-assignment-combobox">
        <input id="device-assignment-farm" role="combobox" aria-expanded={farmOpen} aria-controls="device-assignment-farm-list" aria-autocomplete="list" autoComplete="off" value={farmOpen ? farmQuery : (selectedFarm?.farm_name || '')} placeholder="Type to find a farm" disabled={busy || retry || stale || !!confirmation} onFocus={() => { setFarmQuery(selectedFarm?.farm_name || ''); setFarmOpen(true) }} onChange={event => { setFarmQuery(event.target.value); setFarmOpen(true); setFarmIndex(-1) }} onKeyDown={farmKeyDown} />
        {farmOpen && <div id="device-assignment-farm-list" role="listbox" className="device-assignment-farm-list">{matches.length ? matches.map((farm, index) => <button type="button" role="option" aria-selected={String(farm.id) === farmId} className={index === farmIndex ? 'is-active' : ''} key={farm.id} onMouseDown={event => event.preventDefault()} onClick={() => chooseFarm(String(farm.id))}><strong>{farm.farm_name}</strong>{(farm.barangay || farm.address) && <small>{farm.barangay || farm.address}</small>}</button>) : <p>No matching farms found</p>}</div>}
      </div>
      <label htmlFor="device-assignment-house">Poultry House *</label>
      <select id="device-assignment-house" value={houseId} disabled={!verified || loading || busy || retry || stale || !!confirmation} onChange={event => setHouseId(event.target.value)} required>
        <option value="">Select a poultry house</option>{houses.map(house => <option key={house.id} value={String(house.id)} disabled={occupied(house)}>{house.name}{occupied(house) ? ' — Active device assigned' : ''}</option>)}
      </select>
      {loading && <p role="status">Loading verified houses…</p>}
      {!loading && farmId && emptyInventory && <p>No poultry houses are registered for this farm yet.</p>}
      {!loading && farmId && !verified && <p>{inventory?.message || 'House setup must be completed before assignment. Contact system support.'}</p>}
      {!loading && verified && !emptyInventory && !houses.length && <p>No Active poultry houses are available.</p>}
      {device.status === 'Inactive' && <p>This device remains Inactive. Activation requires a free Active-device slot. Its association will still block house deactivation.</p>}
      {confirmation && <div className="device-assignment-confirmation" role="group" aria-label="Confirm device assignment">
        <h4>Confirm Assignment</h4><p>Assign <strong>{device.device_name}</strong> to <strong>{confirmation.farmName} · {confirmation.houseName}</strong>?</p>
        <p>Earlier readings and alerts keep their recorded location. Confirm the device and modem are powered off and pending requests have been reconciled before handover.</p>
      </div>}
      <div className="device-assignment-actions"><button type="button" disabled={busy} onClick={dismiss}>Cancel</button>
        {confirmation && !retry && !stale && <button type="button" disabled={busy} onClick={() => setConfirmation(null)}>Back</button>}
        <button type="submit" disabled={!houseId || !verified || busy || stale}>{busy ? 'Saving…' : retry ? 'Retry Assignment' : confirmation ? 'Confirm Assignment' : 'Review Assignment'}</button></div>
    </form>
  </div>
}
