import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let server, period, layout, Fields, Chart, csv, Views, exports
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
})
after(async () => { await server?.close() })

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
