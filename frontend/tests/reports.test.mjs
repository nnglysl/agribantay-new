import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let server, period, layout, Fields, Chart, csv, Views, exports, CleanoutCompliance, fillMonthlyReportBuckets, MonthlyChart, TypeChart, SensorChart, sensorCounts
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  period = await server.ssrLoadModule('/src/utils/reportPeriod.js')
  layout = await server.ssrLoadModule('/src/components/ReportsLayout.jsx')
  Fields = (await server.ssrLoadModule('/src/components/ReportPeriodFields.jsx')).default
  Chart = (await server.ssrLoadModule('/src/components/AlertIncidentChart.jsx')).default
  csv = await server.ssrLoadModule('/src/utils/generatedReportCsv.js')
  Views = await Promise.all(['GeneratedReportView', 'AdminGeneratedReportView', 'VetGeneratedReportView'].map(async name =>
    (await server.ssrLoadModule(`/src/components/${name}.jsx`)).default))
  exports = await server.ssrLoadModule('/src/utils/exportUtils.js')
  CleanoutCompliance = (await server.ssrLoadModule('/src/components/CleanoutCompliance.jsx')).default
  fillMonthlyReportBuckets = (await server.ssrLoadModule('/src/utils/fillMonthlyReportBuckets.js')).fillMonthlyReportBuckets
  MonthlyChart = (await server.ssrLoadModule('/src/components/MonthlyReportBarChart.jsx')).default
  TypeChart = (await server.ssrLoadModule('/src/components/InspectionTypeBarChart.jsx')).default
  SensorChart = (await server.ssrLoadModule('/src/components/AlertSensorMonthlyChart.jsx')).default
  sensorCounts = (await server.ssrLoadModule('/src/utils/monthlyAlertSensorCounts.js')).monthlyAlertSensorCounts
})
after(async () => { await server?.close() })

test('monthly sensor counts preserve incident rows, Manila boundaries, zero months and severity/resolution independence', () => {
  const records = [
    { id: 1, sensor_type: 'moisture', triggered_at_raw: '2026-12-31T15:59:59Z', status: 'Critical', is_ongoing: false },
    { id: 2, sensor_type: 'ammonia', triggered_at_raw: '2026-12-31T16:00:00Z', status: 'Warning', is_ongoing: true },
    { id: 3, sensor_type: 'ammonia', triggered_at_raw: '2026-10-31T16:00:00Z', status: 'Critical', is_ongoing: false },
    { id: 4, sensor_type: 'moisture', triggered_at_raw: '2026-10-10T00:00:00Z', status: 'Warning', is_ongoing: true },
    { id: 5, sensor_type: 'ammonia', triggered_at_raw: '2026-10-31T16:00:00Z', status: 'Warning', is_ongoing: true },
    { id: 6, sensor_type: 'temperature', triggered_at_raw: '2026-11-10T00:00:00Z' },
  ]
  const original = JSON.stringify(records)
  const result = sensorCounts(records, '2026-09-01', '2027-01-31')
  assert.deepEqual(result.buckets.map(bucket => bucket.label), ['Sep 2026', 'Oct 2026', 'Nov 2026', 'Dec 2026', 'Jan 2027'])
  assert.deepEqual(result.buckets.map(bucket => [bucket.ammonia, bucket.moisture]), [[0, 0], [0, 1], [2, 0], [0, 1], [1, 0]])
  assert.deepEqual(result.totals, { ammonia: 3, moisture: 2 })
  assert.equal(JSON.stringify(records), original)
  assert.deepEqual(sensorCounts(records, '2026-11-01', '2026-12-31').totals, { ammonia: 2, moisture: 1 })
})

test('undated incidents never become epoch bars and partial month filters keep the same incident scope', () => {
  const rows = [
    { sensor_type: 'ammonia', triggered_at_raw: null },
    { sensor_type: 'moisture', triggered_at_raw: 'invalid' },
    { sensor_type: 'ammonia', triggered_at_raw: '2026-10-09T16:00:00Z' },
    { sensor_type: 'moisture', triggered_at_raw: '2026-10-20T16:00:00Z' },
  ]
  const result = sensorCounts(rows, '2026-10-10', '2026-10-20')
  assert.deepEqual(result.buckets.map(bucket => [bucket.ammonia, bucket.moisture]), [[1, 0]])
  assert.deepEqual(sensorCounts(rows.slice(0, 2)).buckets, [])
  assert.equal(sensorCounts([], '2026-01-01', '2026-12-31').buckets.length, 12)
})

test('grouped sensor chart uses exact reconciled series, integer dynamic axes, accessible counts and sensor-specific tooltips', () => {
  const series = { buckets: [{ key: '2026-8', label: 'Sep 2026', ammonia: 1, moisture: 500 }, { key: '2026-9', label: 'Oct 2026', ammonia: 0, moisture: 0 }], totals: { ammonia: 1, moisture: 500 } }
  const tree = SensorChart({ series, ammoniaTotal: 1, moistureTotal: 500 })
  const findChart = node => {
    if (!React.isValidElement(node)) return null
    if (node.props.data?.datasets) return node
    return React.Children.toArray(node.props.children).map(findChart).find(Boolean)
  }
  const bar = findChart(tree)
  assert.deepEqual(bar.props.data.datasets.map(dataset => dataset.data), [[1, 0], [500, 0]])
  assert.deepEqual(bar.props.data.datasets.map(dataset => dataset.label), ['Ammonia Alerts', 'Moisture Alerts'])
  assert.notEqual(bar.props.data.datasets[0].backgroundColor, bar.props.data.datasets[1].backgroundColor)
  assert.ok(bar.props.data.datasets.every(dataset => dataset.grouped))
  assert.equal(bar.props.options.scales.y.beginAtZero, true)
  assert.equal(bar.props.options.scales.y.ticks.precision, 0)
  assert.equal(bar.props.options.scales.y.stacked, false)
  assert.equal(bar.props.options.scales.y.max, undefined)
  assert.ok(bar.props.options.scales.y.suggestedMax >= 500)
  assert.equal(bar.props.options.plugins.tooltip.callbacks.title([{ dataIndex: 0 }]), 'Sep 2026')
  assert.equal(bar.props.options.plugins.tooltip.callbacks.label({ dataset: { label: 'Ammonia Alerts' }, parsed: { y: 1 } }), 'Ammonia Alerts: 1 incident')
  assert.match(bar.props['aria-label'], /Sep 2026: Ammonia 1, Moisture 500; Oct 2026: Ammonia 0, Moisture 0/)
})

test('sensor chart has a real empty state and never represents unreconciled counts as complete', () => {
  const series = sensorCounts([], '2026-01-01', '2026-12-31')
  const empty = renderToStaticMarkup(React.createElement(SensorChart, { series, ammoniaTotal: 0, moistureTotal: 0 }))
  assert.ok(empty.includes('No ammonia or moisture incidents') && !empty.includes('<canvas'))
  const mismatch = renderToStaticMarkup(React.createElement(SensorChart, { series, ammoniaTotal: 1, moistureTotal: 0 }))
  assert.ok(mismatch.includes('role="alert"') && mismatch.includes('do not match') && !mismatch.includes('<canvas'))
})

test('inspection type chart keeps exact API counts, a dynamic integer scale and accessible zero/low/high values', () => {
  for (const [general, followUp] of [[0, 1], [6, 1], [257, 0]]) {
    const chart = TypeChart({ general, followUp }).props.children
    assert.deepEqual(chart.props.data.labels, ['General', 'Follow-up'])
    assert.deepEqual(chart.props.data.datasets[0].data, [general, followUp])
    assert.equal(chart.props.options.scales.y.beginAtZero, true)
    assert.equal(chart.props.options.scales.y.ticks.precision, 0)
    assert.ok(chart.props.options.scales.y.suggestedMax >= Math.max(general, followUp))
    assert.equal(chart.props.options.scales.y.max, undefined)
    assert.equal(chart.props.options.plugins.tooltip.callbacks.label({ parsed: { y: 1 } }), '1 inspection')
    assert.equal(chart.props.options.plugins.tooltip.callbacks.label({ parsed: { y: 257 } }), '257 inspections')
    assert.match(chart.props['aria-label'], new RegExp(`General: ${general}; Follow-up: ${followUp}`))
  }
})

test('inspection type chart has a truthful empty state without fabricating counts', () => {
  for (const counts of [{ general: 0, followUp: 0 }, {}]) {
    const html = renderToStaticMarkup(React.createElement(TypeChart, counts))
    assert.ok(html.includes('No General or Follow-up inspections in this reporting period.'))
    assert.ok(!html.includes('<canvas'))
  }
})

test('Staff monthly timeline preserves real counts across Manila year boundaries and adds zero months within the period', () => {
  const records = [
    { completed_at_raw: '2026-12-31T16:00:00Z' },
    { completed_at_raw: '2026-11-30T16:01:00Z' },
    { completed_at_raw: '2026-10-15T00:00:00Z' },
    { completed_at_raw: '2026-12-20T00:00:00Z' },
    { completed_at_raw: null },
  ]
  const original = JSON.stringify(records)
  const existing = layout.monthlyBucketsInRange(records, 'completed_at_raw')
  const result = fillMonthlyReportBuckets(existing, '2026-10-01', '2027-01-31')
  assert.deepEqual(result.map(bucket => bucket.label), ['Oct 2026', 'Nov 2026', 'Dec 2026', 'Jan 2027'])
  assert.deepEqual(result.map(bucket => bucket.count), [1, 0, 2, 1])
  assert.equal(result.reduce((sum, bucket) => sum + bucket.count, 0), 4)
  assert.equal(JSON.stringify(records), original)
  assert.deepEqual(existing.map(bucket => bucket.count), [1, 2, 1], 'Existing shared aggregation remains sparse for other roles')
})

test('Staff monthly timeline respects month/year and open bounds, keeps zero/one counts and exposes an empty state', () => {
  const buckets = [{ key: '2026-9', label: 'Oct 2026', count: 1 }]
  assert.deepEqual(fillMonthlyReportBuckets(buckets, '2026-10-10', '2026-10-20'), buckets)
  assert.deepEqual(fillMonthlyReportBuckets(buckets, '2026-08-01').map(bucket => bucket.count), [0, 0, 1])
  assert.deepEqual(fillMonthlyReportBuckets(buckets, '', '2026-12-31').map(bucket => bucket.count), [1, 0, 0])
  const emptyYear = fillMonthlyReportBuckets([], '2026-01-01', '2026-12-31')
  assert.equal(emptyYear.length, 12)
  assert.ok(emptyYear.every(bucket => bucket.count === 0))
  assert.deepEqual(fillMonthlyReportBuckets([]), [])
  assert.ok(renderToStaticMarkup(React.createElement(MonthlyChart, { buckets: emptyYear, label: 'Completed inspections', emptyText: 'No completed inspections in this reporting period.' })).includes('No completed inspections'))
})

test('neutral KPI styling and monthly chart additions are opt-in; shared report defaults stay unchanged', () => {
  const neutral = layout.StatCard({ value: 0, label: 'Total Farms', foot: 'Registered in period', variant: 'neutral' })
  const normal = layout.StatCard({ value: 0, label: 'Total Farms' })
  assert.equal(neutral.props.style.background, '#fff')
  assert.equal(normal.props.style.background, layout.C.card)
  assert.ok(renderToStaticMarkup(neutral).includes('Registered in period'))
  const buckets = [{ label: 'Oct 2026', count: 1 }]
  const chart = MonthlyChart({ buckets, label: 'Completed inspections' }).props.children
  assert.equal(chart.props.options, layout.chartOptions)
  assert.equal(chart.props.options.scales.y.beginAtZero, true)
  assert.equal(chart.props.options.scales.y.ticks.precision, 0)
  assert.deepEqual(chart.props.data.datasets[0].data, [1])
})

test('export filenames use Manila dates at midnight and year boundaries', () => {
  assert.equal(exports.todayStamp(new Date('2026-10-31T16:00:00Z')), '2026-11-01')
  assert.equal(exports.todayStamp(new Date('2026-12-31T16:00:00Z')), '2027-01-01')
})

test('unknown clean-out dates stay neutral and missing history is explicit in the four-field card', () => {
  const unknown = renderToStaticMarkup(React.createElement(CleanoutCompliance, { status: { status: 'Undetermined', undetermined_reason: 'Missing registration date' } }))
  assert.ok(unknown.includes('annual-compliance-badge unknown') && unknown.includes('Missing registration date'))
  const noHistory = renderToStaticMarkup(React.createElement(CleanoutCompliance, { status: { status: 'Compliant', due_date: 'Nov 01, 2027', registration_date: 'Nov 01, 2026', days_since: null, days_remaining: 365 } }))
  assert.ok(noHistory.includes('No recorded full clean-out') && noHistory.includes('Nov 01, 2027') && noHistory.includes('365') && noHistory.includes('every 12 months'))
  assert.ok(!noHistory.includes('Required Clean-out Interval') && !noHistory.includes('Days Since Last Clean-out'))
  assert.ok(!noHistory.includes('grace') && !noHistory.includes('180 days'))
})

test('annual report views show unknown counts while old snapshots retain their Overdue figures', () => {
  for (const View of Views.slice(0, 2)) {
    const annual = { id: 9, report_name: 'Annual', snapshot: { maintenance_summary: { policy: 'annual_12_calendar_months_v1', undetermined: 8, non_compliant: 3, overdue: 0 }, compliance_period: { policy: 'annual_12_calendar_months_v1', compliant: 2, undetermined: 8, non_compliant: 3, total_farms: 13 } } }
    const old = { id: 10, report_name: 'Historical', snapshot: { maintenance_summary: { overdue: 7, non_compliant: 3 }, compliance_period: { compliant: 2, overdue: 7, non_compliant: 3, total_farms: 12 } } }
    const original = JSON.stringify(old)
    const html = renderToStaticMarkup(React.createElement(View, { report: annual }))
    const historical = renderToStaticMarkup(React.createElement(View, { report: old }))
    assert.ok(html.includes('Farms undetermined') && html.includes('Undetermined farms'))
    assert.ok(historical.includes('Farms overdue') && historical.includes('Overdue farms'))
    assert.equal(csv.generatedReportCsv(annual).rows.find(row => row.name === 'Undetermined farms' || row.detail === 'Undetermined farms')?.value, 8)
    assert.equal(JSON.stringify(old), original)
  }
})

test('new report snapshots expose completeness without changing old frozen snapshot interpretation', () => {
  const counts = { monitoring_assessment_policy: 'primary_completeness_v1', total_farms: 8, normal: 1, warning: 1, critical: 1, incomplete_data: 2, no_readings_yet: 1, offline: 1, pending_setup: 1, incomplete_coverage: 5 }
  for (const View of Views.slice(0, 2)) {
    const old = { snapshot: { farm_overview: { total_farms: 8, normal: 5, warning: 2, critical: 1 } } }
    const before = JSON.stringify(old)
    const report = { snapshot: { farm_overview: counts, reading_data_completeness: { complete_readings: 12, incomplete_readings: 3, no_primary_readings: 1 } } }
    const html = renderToStaticMarkup(React.createElement(View, { report }))
    assert.ok(html.includes('Monitoring coverage at generation') && html.includes('Incomplete Data') && html.includes('12 complete, 3 incomplete'))
    assert.ok(!renderToStaticMarkup(React.createElement(View, { report: old })).includes('Monitoring coverage at generation'))
    assert.ok(csv.generatedReportCsv(report).rows.some(row => Object.values(row).includes('Incomplete Data')))
    assert.equal(JSON.stringify(old), before)
  }
})

test('all records, month/year, year only, leap years and custom bounds resolve without browser timezone dependence', () => {
  const base = { mode: 'all', year: '2026', month: '10', from: '', to: '' }
  assert.deepEqual(period.resolveReportPeriod(base), { from: '', to: '', error: '' })
  assert.deepEqual(period.resolveReportPeriod({ ...base, mode: 'month' }), { from: '2026-10-01', to: '2026-10-31', error: '' })
  assert.equal(period.resolveReportPeriod({ ...base, mode: 'month', year: '2024', month: '2' }).to, '2024-02-29')
  assert.deepEqual(period.resolveReportPeriod({ ...base, mode: 'year' }), { from: '2026-01-01', to: '2026-12-31', error: '' })
  assert.deepEqual(period.resolveReportPeriod({ ...base, mode: 'custom', from: '2026-09-30', to: '2026-10-01' }), { from: '2026-09-30', to: '2026-10-01', error: '' })
})

test('invalid, impossible and reversed custom ranges are rejected before Apply', () => {
  for (const values of [
    { mode: 'custom', from: '2026-10-20', to: '2026-10-01' },
    { mode: 'custom', from: '2026-02-30', to: '' },
    { mode: 'custom', from: '2026-13-01', to: '' },
    { mode: 'custom', from: '', to: '' },
    { mode: 'year', year: 'invalid' },
  ]) assert.ok(period.resolveReportPeriod(values).error)
})

test('cards and charts wait for the response matching the newly applied reporting period', () => {
  const september = { report_period: { from: '2026-09-01', to: '2026-09-30' } }
  const october = { report_period: { from: '2026-10-01', to: '2026-10-31' } }
  assert.equal(period.matchesReportPeriod(september, '2026-10-01', '2026-10-31'), false)
  assert.equal(period.matchesReportPeriod(october, '2026-10-01', '2026-10-31'), true)
  assert.equal(period.matchesReportPeriod(null), false)
  assert.equal(period.matchesReportPeriod({ report_period: { from: null, to: null } }), true)
})

test('timestamps at Manila midnight and year boundaries belong to the correct local date', () => {
  assert.equal(period.manilaDay('2026-09-30T15:59:59Z'), '2026-09-30')
  assert.equal(period.manilaDay('2026-09-30T16:00:00Z'), '2026-10-01')
  assert.equal(period.manilaDay('2026-12-31T16:00:00Z'), '2027-01-01')
  assert.equal(layout.makeInRange('2026-10-01', '2026-10-31')('2026-09-30T16:00:00Z'), true)
  assert.equal(layout.makeInRange('2026-09-01', '2026-09-30')('2026-09-30T16:00:00Z'), false)
  assert.equal(layout.makeInRange('', '')(null), true, 'All Records retains records with unknown dates')
  assert.equal(layout.makeInRange('2026-10-01', '')(null), false)
})

test('shared filter displays exactly the four requested options and valid field controls', () => {
  for (const mode of ['all', 'month', 'year', 'custom']) {
    const html = renderToStaticMarkup(React.createElement(Fields, { value: { mode, month: '10', year: '2026', from: '', to: '' }, onChange() {}, error: '' }))
    for (const label of ['All Records', 'Month and Year', 'Year Only', 'Custom Date Range']) assert.ok(html.includes(label))
    assert.equal(html.includes('Reporting year'), ['month', 'year'].includes(mode))
    assert.equal(html.includes('Reporting start date'), mode === 'custom')
    assert.ok(!html.includes('Barangay'))
  }
})

test('bar chart uses exact server incident buckets, integer scale, readable tooltips and a real empty state', () => {
  const series = { aggregation: 'day', buckets: [{ key: '2026-10-01', label: 'Oct 1, 2026', count: 33 }, { key: '2026-10-02', label: 'Oct 2, 2026', count: 0 }] }
  const frame = Chart({ series })
  const bar = frame.props.children
  assert.deepEqual(bar.props.data.datasets[0].data, [33, 0])
  assert.deepEqual(bar.props.data.labels, ['Oct 1, 2026', 'Oct 2, 2026'])
  assert.equal(bar.props.options.scales.y.beginAtZero, true)
  assert.equal(bar.props.options.scales.y.ticks.precision, 0)
  assert.equal(bar.props.options.plugins.tooltip.callbacks.title([{ dataIndex: 0 }]), 'Oct 1, 2026')
  assert.equal(bar.props.options.plugins.tooltip.callbacks.label({ parsed: { y: 33 } }), '33 incidents')
  assert.ok(renderToStaticMarkup(React.createElement(Chart, { series: { buckets: [] } })).includes('No alert incidents'))
})

test('Files filters use report-period overlap and keep reports with identical names individually addressable', () => {
  const files = [{ id: 1, report_name: 'Same', period_start: '2026-09-01', period_end: '2026-09-30' },
    { id: 2, report_name: 'Same', period_start: '2026-10-01', period_end: '2026-10-20' },
    { id: 3, report_name: 'Custom', period_start: '2026-07-01', period_end: '2026-10-05' }]
  assert.deepEqual(period.filterReportFiles(files, '2026-10-01', '2026-10-31').map(file => file.id), [2, 3])
  assert.deepEqual(period.filterReportFiles(files, '2026-01-01', '2026-12-31').map(file => file.id), [1, 2, 3])
  assert.notEqual(csv.reportExportFilename(files[0], 'pdf'), csv.reportExportFilename(files[1], 'pdf'))
})

function fixture() {
  return { id: 77, report_name: 'October 2026 Report (Oct 1\u201320)', period_label: 'Oct 1\u201320, 2026', date_generated: 'Oct 20, 2026 at 12:00 PM PHT', snapshot: {
    reporting_version: 2, coverage: { end: '2026-10-20T04:00:00Z' },
    alert_period: { total: 103, critical: 81, warning: 22, resolved: 101, ongoing: 2 },
    inspection_period: { total: 3, scheduled: 1, completed: 2, cancelled: 0, overdue: 1 },
    vet_summary: { total_completed: 12, farms_covered: 7 },
    period_activity: { inspections_completed: 2, alerts_recorded: 103, vet_services_completed: 12, vet_farms_covered: 7 },
    alert_records: [{ farm_name: 'Farm, "A"', sensor_type: 'moisture', status: 'Critical', triggered_at: 'Oct 1, 2026' }],
    vet_services: [{ service_type: 'Blood Test', farm_name: 'Farm A', vet_name: 'Vet Test', completed_at: 'Oct 2, 2026' }],
    signatures: { prepared_by: null, noted_by: null },
  } }
}

test('View/Print/PDF renderer and CSV use the same frozen totals and precise coverage timestamp', () => {
  const report = fixture()
  const original = JSON.stringify(report)
  const rows = csv.generatedReportCsv(report).rows
  assert.equal(rows.find(row => row.name === 'Alerts' && row.detail === 'Total alert incidents').value, 103)
  assert.equal(rows.find(row => row.name === 'Alerts' && row.detail === 'Critical').value, 81)
  assert.equal(rows.find(row => row.name === 'Veterinary services' && row.detail === 'Total completed').value, 12)
  assert.equal(rows.find(row => row.detail === 'Data coverage end (UTC)').date, report.snapshot.coverage.end)
  for (const View of Views) {
    const html = renderToStaticMarkup(React.createElement(View, { report }))
    assert.ok(html.includes('Data through October 20, 2026'))
    assert.ok(html.includes('selected period, all veterinarians') || !html.includes('Veterinary summary'))
    assert.equal(html, renderToStaticMarkup(React.createElement(View, { report })))
  }
  assert.equal(JSON.stringify(report), original)
})

test('legacy report snapshots keep their original figures and CSV shape without manufactured metadata', () => {
  const report = { id: 2, report_name: 'Legacy', snapshot: { inspection_summary: { total: 987 }, completed_inspections: [] } }
  const output = csv.generatedReportCsv(report)
  assert.equal(output.columns.some(column => column.key === 'value'), false)
  assert.equal(output.rows.length, 0)
  const html = renderToStaticMarkup(React.createElement(Views[0], { report }))
  assert.ok(html.includes('987'))
  assert.ok(!html.includes('Data through'))
})

test('CSV neutralizes formula text and control prefixes while retaining numeric cells and CR quoting', async () => {
  const originalDocument = globalThis.document
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL
  let captured
  globalThis.document = { createElement: () => ({ setAttribute() {}, click() {} }), body: { appendChild() {}, removeChild() {} } }
  URL.createObjectURL = blob => { captured = blob; return 'blob:test' }
  URL.revokeObjectURL = () => {}
  try {
    exports.exportToCSV([{ a: '=1+2', b: '  @SUM(1)', c: '+123', d: '-5', e: -5, f: '\r=1', g: 'line\rbreak', h: '＝1+2', i: '\t=1' }],
      'abcdefghi'.split('').map(key => ({ key, label: key })), 'safe.csv')
    const text = await captured.text()
    assert.equal(text, 'a,b,c,d,e,f,g,h,i\r\n"\t=1+2","\t  @SUM(1)","\t+123","\t-5",-5,"\t\r=1","line\rbreak","\t＝1+2","\t\t=1"')
  } finally {
    globalThis.document = originalDocument
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
  }
})

test('actual CSV serialization preserves snapshot counts, quoting, Unicode and the selected report reference', async () => {
  const report = fixture()
  const { rows, columns } = csv.generatedReportCsv(report)
  const originalDocument = globalThis.document
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL
  let captured, filename, clicked = false
  globalThis.document = { createElement: () => ({ setAttribute: (key, value) => { if (key === 'download') filename = value }, click: () => { clicked = true } }), body: { appendChild() {}, removeChild() {} } }
  URL.createObjectURL = blob => { captured = blob; return 'blob:test' }
  URL.revokeObjectURL = () => {}
  try {
    exports.exportToCSV(rows, columns, csv.reportExportFilename(report, 'csv'))
    const text = await captured.text()
    assert.ok(text.includes('Total alert incidents,,,103'))
    assert.ok(text.includes('"Farm, ""A"""'))
    assert.ok(text.includes('2026-10-20T04:00:00Z'))
    assert.ok(filename.endsWith('_Ref77.csv'))
    assert.equal(clicked, true)
  } finally {
    globalThis.document = originalDocument
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
  }
})
