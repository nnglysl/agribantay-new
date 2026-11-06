// Presentation of API records only: no measurement classification or farm severity calculation.
export function houseDisplayCondition(row) {
  if (row.house_status === 'Inactive') return 'Inactive'
  if (row.connectivity === 'Offline') return 'Offline'
  if (['Safe', 'Warning', 'Critical'].includes(row.state) && (!row.current_reading || row.connectivity !== 'Online')) return 'Unavailable'
  return row.state || 'Unavailable'
}
export function houseMainIssue(row) {
  const state = houseDisplayCondition(row)
  const messages = { Offline: 'Device is offline; current condition unknown', 'Not Monitored': 'No eligible active monitoring device', 'No Readings Yet': 'No readings yet.', Unavailable: 'Current readings unavailable' }
  if (state === 'Inactive') return row.house_status === 'Inactive' ? 'House is inactive' : 'Monitoring device is inactive'
  if (messages[state]) return messages[state]
  const available = row.primary_assessment?.available_primary_metrics || row.current_reading?.primary_assessment?.available_primary_metrics || []
  const issues = [['ammonia', 'Ammonia'], ['moisture', 'Manure moisture']]
    .filter(([metric]) => available.includes(metric) && row.current_reading?.[metric] != null && ['Warning', 'Critical'].includes(row.current_reading?.[metric + '_status']))
    .sort((a, b) => (row.current_reading[b[0] + '_status'] === 'Critical') - (row.current_reading[a[0] + '_status'] === 'Critical'))
    .map(([, label]) => label + ' is high')
  return issues.length ? issues.join('; ') : state === 'Incomplete Data' ? 'Some primary readings are missing' : state === 'Safe' ? 'Primary readings within the safe range' : 'No valid primary readings'
}
export function dashboardSummary(data) {
  const snapshot = data?.house_monitoring
  const matching = snapshot && String(snapshot.farm_id) === String(data.farm_id)
  const rows = matching && Array.isArray(snapshot.rows) ? snapshot.rows : []
  const houses = rows.filter(row => row.poultry_house_id != null)
  const active = houses.filter(row => row.house_status === 'Active')
  const known = !!matching && Array.isArray(snapshot.rows) && snapshot.inventory_status !== 'unavailable'
  const assessment = (matching ? snapshot.house_assessment : null) || data?.monitoring_assessment || (matching ? snapshot.farm_assessment : null)
  const condition = assessment?.condition || 'Unavailable'
  const gaps = active.filter(row => row.device_status === 'Active' && row.assignment_verified === true && (!['Safe', 'Critical', 'Warning'].includes(houseDisplayCondition(row)) || row.primary_assessment?.incomplete_data === true))
  const offline = active.filter(row => houseDisplayCondition(row) === 'Offline')
  // Unequipped houses are Not Monitored, not incomplete sensor measurements.
  const incomplete = assessment?.incomplete_data === true || gaps.length > 0
  const affected = active.filter(row => ['Critical', 'Warning'].includes(houseDisplayCondition(row)))
    .sort((a, b) => (houseDisplayCondition(b) === 'Critical') - (houseDisplayCondition(a) === 'Critical') || a.house_name.localeCompare(b.house_name, undefined, { numeric: true }))
  const dates = rows.filter(row => row.connectivity === 'Online' && row.current_reading?.recorded_at).map(row => row.current_reading.recorded_at).filter(date => Number.isFinite(Date.parse(date)))
  return { condition, assessment, houses, active, affected, offline, gaps, incomplete, lastUpdated: dates.sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null,
    inventoryKnown: matching && snapshot.coverage?.known === true, inactive: houses.length - active.length, legacy: rows.filter(row => row.poultry_house_id == null),
    counts: { total: known ? houses.length : null, Critical: known ? active.filter(row => houseDisplayCondition(row) === 'Critical').length : null,
      Warning: known ? active.filter(row => houseDisplayCondition(row) === 'Warning').length : null,
      unmonitored: known ? active.filter(row => houseDisplayCondition(row) === 'Not Monitored').length : null } }
}
