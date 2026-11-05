import { PRINT_SECTIONS } from '../src/utils/farmPrint'

// Synthetic, complete backend contract fixture. No operational source is used.
export function makePrintFixture({ farmId = 1, sections = Object.keys(PRINT_SECTIONS), role = 'super_admin', mode = 'normal', count = 1001, range = { mode: 'all', from: null, to: null } } = {}) {
  const farm = { id: farmId, farm_name: farmId === 1 ? 'Calansayan Poultry Farm' : 'Second Owner Farm', owner_name: 'Mara Reyes', barangay: 'Calansayan' }
  const records = {
    readings: Array.from({ length: count }, (_, i) => ({ id: i + 1, recorded_at: 'Oct 31, 2026 10:00 AM', device_name: 'AGB-PRINT-01', ammonia: '18.25', moisture: '42.00', temperature: '28.50', humidity: '65.00', conditions: { ammonia: 'Warning', moisture: 'Safe', temperature: 'Safe', humidity: 'Safe' }, is_mock: false })),
    inspections: [{ id: 1, scheduled_at: 'Oct 31, 2026 9:00 AM', completed_at: 'Oct 31, 2026 9:30 AM', inspection_type: 'General Inspection', status: 'Completed', assigned_staff: 'Inspection Staff', findings: 'Original recorded findings', notes: 'No invented fields' }, { id: 2, scheduled_at: 'Oct 31, 2026 1:00 PM', inspection_type: 'Follow-up', status: 'Scheduled' }],
    cleanouts: [{ id: 1, performed_at: 'Oct 10, 2026', maintenance_type: 'Full Manure Clean-out', notes: 'Full clean-out evidence retained' }],
    disposal: [{ id: 1, disposal_date: 'Oct 10, 2026', method: 'Sold', quantity: '25 sacks', buyer_name: 'Recorded Buyer', notes: 'Disposal alone does not reset compliance' }],
    services: [{ id: 1, request_number: 'SR-HISTORY', requested_at: 'Oct 31, 2026 8:00 AM', service_type: 'Odor Control Request', status: 'Scheduled', is_retired: true }, ...(role === 'super_admin' ? [{ id: 2, request_number: 'SR-VET', requested_at: 'Oct 31, 2026 8:00 AM', service_type: 'Blood Test Request', status: 'Completed', is_retired: false }] : [])],
    documents: [{ id: 1, document_type: 'Odor Control', file_name: 'odor-plan.pdf', uploaded_at: 'Oct 31, 2026 9:00 AM', uploaded_by: 'Recorded Uploader', status: 'On File' }],
    alerts: [{ id: 1, triggered_at: 'Oct 31, 2026 10:00 AM', device_name: 'AGB-PRINT-01', metric: 'ammonia', value: 18.25, status: 'Warning' }],
  }
  if (mode === 'empty') for (const key of Object.keys(records)) records[key] = []
  if (range.mode === 'custom' && (range.from > '2026-10-31' || range.to < '2026-10-31')) for (const key of Object.keys(records)) records[key] = []
  const snapshots = {
    farm: { ...farm, address: 'Calansayan, San Jose, Batangas', farm_size: 'Medium', num_birds: 12000, registration_date: 'Jun 12, 2026', registration_status: 'Active' },
    owner: { name: 'Mara Reyes', mobile_number: '09123456789', email: 'fixture@example.test' },
    monitoring: mode === 'unassigned' ? [] : [{ device_name: 'AGB-PRINT-01', connectivity: mode === 'offline' ? 'Offline' : 'Online', reading_context: mode === 'offline' ? 'Historical last reading; not current conditions' : 'Current assignment, recent reading', current_condition: mode === 'offline' ? null : 'Warning', last_reading_at: 'Oct 31, 2026 10:00 AM', ammonia: '18.25', moisture: '42.00', temperature: '28.50', humidity: '65.00' }],
    compliance: { required_interval: '12 Calendar Months', status: mode === 'unknown' ? 'Undetermined' : 'Compliant', registration_date: mode === 'unknown' ? null : 'Jun 12, 2026', last_full_cleanout_date: mode === 'unknown' ? null : 'Oct 10, 2026', due_date: mode === 'unknown' ? null : 'Oct 10, 2027', days_remaining: mode === 'unknown' ? null : 344, undetermined_reason: mode === 'unknown' ? 'Registration date cannot be established.' : null },
    assignments: [{ device_name: 'AGB-PRINT-01', assigned_at: 'Oct 01, 2026 9:00 AM', unassigned_at: 'Oct 08, 2026 9:00 AM', status: 'Previous assignment', dates_verified: true }, { device_name: 'AGB-PRINT-01', assigned_at: 'Oct 24, 2026 9:00 AM', status: 'Currently assigned', dates_verified: true }],
  }
  if (mode === 'incomplete') {
    snapshots.monitoring_assessment = { condition: 'Warning', incomplete_data: true, complete_devices: 0, total_devices: 1 }
    Object.assign(snapshots.monitoring[0], { moisture: null, primary_assessment: { incomplete_data: true } })
    records.readings.forEach(row => Object.assign(row, { moisture: null, primary_assessment: { incomplete_data: true } }))
  }
  const streams = Object.fromEntries(Object.entries(records).filter(([key]) => sections.includes(key)).map(([key, rows]) => [key, { total: rows.length, max_id: rows.at(-1)?.id || 0 }]))
  const manifest = { farm, sections, range, generated_at: '2026-10-31T02:45:00Z', generated_at_display: 'Oct 31, 2026 10:45 AM Asia/Manila', generated_by: 'UI Fixture', snapshots: Object.fromEntries(Object.entries(snapshots).filter(([key]) => sections.includes(key))), streams, batch_size: 500,
    total_rows: Object.values(streams).reduce((sum, s) => sum + s.total, 0) + (sections.includes('assignments') ? snapshots.assignments.length : 0), ticket: 'synthetic-ticket-must-not-be-printed' }
  if (sections.includes('monitoring') && snapshots.monitoring_assessment) manifest.snapshots.monitoring_assessment = snapshots.monitoring_assessment
  return { manifest, records }
}
