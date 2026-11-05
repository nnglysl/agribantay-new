// Export only frozen snapshot content; never query or recompute source records.
export function generatedReportCsv(report) {
  const s = report.snapshot ?? {}

  // The summary figures, straight out of the stored snapshot — the same
  // numbers the printed report shows, never recomputed from today's
  // database. A September export opened in December must still say what
  // September said.
  //
  // Each block is skipped when the snapshot does not carry it, so an
  // archive made before these keys existed exports exactly as it used to.
  const kv = (group, pairs) => Object.entries(pairs)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([label, v]) => ({ section: 'Summary', name: group, detail: label, date: '', status: '', value: v }))

  const a = s.new_accounts
  const alertP = s.alert_period
  const inspP = s.inspection_period
  const svcP = s.service_request_period
  const compP = s.compliance_period

  const summaryRows = [
    ...(s.farm_overview?.monitoring_assessment_policy ? kv('Monitoring coverage at generation', {
      'Fully assessed Safe': s.farm_overview.normal, 'Warning': s.farm_overview.warning, 'Critical': s.farm_overview.critical,
      'Incomplete Data': s.farm_overview.incomplete_data, 'No Readings Yet': s.farm_overview.no_readings_yet,
      'Offline': s.farm_overview.offline, 'Pending Setup': s.farm_overview.pending_setup,
      'Incomplete primary coverage (overlaps severity)': s.farm_overview.incomplete_coverage,
    }) : []),
    ...(s.reading_data_completeness ? kv('Historical primary data completeness', {
      'Complete readings': s.reading_data_completeness.complete_readings,
      'Incomplete readings': s.reading_data_completeness.incomplete_readings,
      'Both primary measurements unavailable': s.reading_data_completeness.no_primary_readings,
    }) : []),
    ...(s.reporting_version >= 2 && s.vet_summary ? kv('Veterinary services', {
      'Total completed': s.vet_summary.total_completed,
      'Farms covered': s.vet_summary.farms_covered,
    }) : []),
    ...(a ? kv('System activity', {
      'New Farm Owner accounts': a.farm_owners,
      'New Staff accounts': a.staff,
      'New Veterinarian accounts': a.vets,
      // No Super Admin row, matching the printed report: the system has
      // one and cannot create another, so the line could only read zero.
      // Still counted in the snapshot and still inside the total below.
      'Total new accounts': a.total,
    }) : []),
    ...(s.new_farms ? kv('System activity', { 'New farms registered': s.new_farms.count }) : []),
    ...(s.new_devices ? kv('System activity', { 'New devices registered': s.new_devices.count }) : []),
    ...(alertP ? kv('Alerts', {
      'Total alert incidents': alertP.total,
      'Critical': alertP.critical,
      'Warning': alertP.warning,
      'Resolved by period end': alertP.resolved,
      'Ongoing at period end': alertP.ongoing,
    }) : []),
    ...(inspP ? kv('Inspections', {
      'Total inspections': inspP.total,
      'Scheduled': inspP.scheduled,
      'Completed': inspP.completed,
      'Cancelled': inspP.cancelled,
      'Overdue (of the scheduled)': inspP.overdue,
    }) : []),
    ...(svcP ? kv('Service requests', {
      'Total requests': svcP.total,
      'Pending': svcP.pending,
      'Scheduled': svcP.scheduled,
      'Completed': svcP.completed,
      'Cancelled': svcP.cancelled,
    }) : []),
    ...(compP ? kv('Compliance', {
      'Compliant farms': compP.compliant,
      ...(compP.policy ? { 'Undetermined farms': compP.undetermined } : { 'Overdue farms': compP.overdue }),
      'Non-compliant farms': compP.non_compliant,
      'Active farms assessed': compP.total_farms,
    }) : []),
  ]

  const rows = [
    ...summaryRows,
    ...(s.completed_inspections ?? []).map(i => ({ section: 'Inspection', name: i.farm_name, detail: i.inspection_type, date: i.completed_at, status: i.status || 'Completed' })),
    ...(s.alert_records ?? []).map(a => ({ section: 'Alert', name: a.farm_name, detail: a.sensor_type, date: a.triggered_at, status: a.status })),
    ...(s.maintenance_overdue ?? []).map(f => ({ section: 'Non-Compliant', name: f.farm_name, detail: `Due ${f.due_date || 'date unavailable'}; ${f.days_overdue} days overdue`, date: f.last_performed_at, status: f.status })),
    ...(s.maintenance_completed ?? []).map(m => ({ section: 'Clean-out', name: m.farm_name, detail: m.method, date: m.performed_at, status: 'Completed' })),
    ...(s.completed_services ?? []).map(r => ({ section: 'Service Request', name: r.farm_name, detail: r.service_type, date: r.completed_at, status: 'Completed' })),
    ...(s.vet_services ?? []).map(v => ({ section: 'Vet Service', name: v.farm_name, detail: `${v.service_type} (${v.vet_name})`, date: v.completed_at, status: 'Completed' })),
  ]
  const cols = [
    { key: 'section', label: 'Section' }, { key: 'name', label: 'Farm' }, { key: 'detail', label: 'Detail' },
    { key: 'date', label: 'Date' }, { key: 'status', label: 'Status' },
    // Carries the summary numbers, and is added ONLY when there are
    // summary rows to put in it. A report archived before the period
    // sections existed has none, and exporting it must produce the
    // same file it always did — not the same file plus an empty
    // column. A frozen report is frozen in its export too.
    ...(summaryRows.length ? [{ key: 'value', label: 'Value' }] : []),
  ]

  if (s.coverage) {
    rows.unshift({ section: 'Report', name: report.report_name, detail: 'Data coverage end (UTC)', date: s.coverage.end, status: '', value: '' })
  }
  return { rows, columns: cols }
}

export function reportExportFilename(report, extension) {
  const safe = Array.from(report.report_name, character => character.charCodeAt(0) < 32 ? '_' : character).join('')
  const name = safe.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_')
  return `AgriBantay_${name}_Ref${report.id}.${extension}`
}
