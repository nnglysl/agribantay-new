import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Chart } from 'chart.js'
import Reports from '../src/pages/admin/Reports'
import api from '../src/api/axios'
import { setAuth } from '../src/utils/auth'
import { manilaDay } from '../src/utils/reportPeriod'
import { formatDateTime } from '../src/utils/formatDate'
import '../src/index.css'

// Local synthetic reporting responses only. Every API verb is intercepted.
Chart.defaults.animation = false
const completed = [
  '2026-08-10T00:00:00Z', '2026-06-05T00:00:00Z', '2026-08-31T16:00:00Z',
  '2026-08-31T15:59:59Z', '2026-06-29T16:00:00Z', '2026-08-20T00:00:00Z', '2026-08-02T00:00:00Z',
].map((date, index) => ({ id: index + 1, inspection_number: `INS-FIXTURE-${index}`, farm_name: 'Synthetic Farm', inspection_type: 'General Inspection', status: 'Completed', completed_at_raw: date, completed_at: manilaDay(date) }))
const scheduled = [{ status: 'Scheduled', scheduled_at: '2026-08-15T00:00:00Z' }, { status: 'Scheduled', scheduled_at: '2026-11-03T00:00:00Z' }]
const inspectionRows = Array.from({ length: 23 }, (_, index) => ({
  id: 2000 + index, inspection_number: `INS-${2000 + index}`, farm_name: `Sample Farm ${index + 1}`, owner_name: `Sample Owner ${index + 1}`,
  inspection_type: index % 3 === 0 ? 'Follow-up' : 'General Inspection', status: 'Completed',
  completed_at_raw: `2026-10-${String(23 - index).padStart(2, '0')}T00:00:00Z`, completed_at: `2026-10-${String(23 - index).padStart(2, '0')}`,
}))
const otherInspections = [
  ...[25, 26].map(day => ({ status: 'Scheduled', inspection_type: 'General Inspection', date: `2026-10-${day}` })),
  ...[27, 28, 29, 30].map(day => ({ status: 'Cancelled', inspection_type: 'General Inspection', date: `2026-10-${day}` })),
  { status: 'Scheduled', inspection_type: 'Follow-up', date: '2026-11-03' },
]
const farms = ['2026-06-01', '2026-08-05', '2026-10-01']
const incidents = [
  ['2026-06-01', 'Critical'], ['2026-07-15', 'Warning'], ['2026-08-03', 'Critical'],
  ['2026-09-01', 'Critical'], ['2026-08-25', 'Warning'],
].map(([date, status], index) => ({ id: index, farm_name: 'Synthetic Farm', sensor_type: 'ammonia', status, triggered_at_raw: date, triggered_at: date }))
const sensorIncidents = [
  ...Array.from({ length: 23 }, (_, index) => ({ sensor_type: 'moisture', triggered_at_raw: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00Z` })),
  ...Array.from({ length: 3 }, (_, index) => ({ sensor_type: 'ammonia', triggered_at_raw: `2026-09-0${index + 1}T00:00:00Z` })),
  ...Array.from({ length: 4 }, (_, index) => ({ sensor_type: 'moisture', triggered_at_raw: `2026-11-0${index + 1}T00:00:00Z` })),
  { sensor_type: 'ammonia', triggered_at_raw: '2026-10-31T16:00:00Z' },
].map((record, index) => ({ ...record, id: 3000 + index, farm_name: `Sensor Farm ${index + 1}`, owner_name: `Sensor Owner ${index + 1}`,
  status: index % 3 === 0 ? 'Critical' : 'Warning', resolved_at_raw: index % 4 === 0 ? null : '2026-11-15T00:00:00Z' }))
const pendingRequests = ['2026-06-15', '2026-08-10']
const original = JSON.stringify(completed)
let scenario = 'normal', revision = 0, lastReport = null
const requests = [], unexpected = [], runtimeErrors = []
window.addEventListener('error', event => runtimeErrors.push(event.message))
window.addEventListener('unhandledrejection', event => runtimeErrors.push(String(event.reason)))
api.defaults.adapter = async config => {
  const params = config.params || {}
  requests.push({ method: config.method, url: config.url, params: { ...params } })
  if (config.method !== 'get') throw Error('Report fixture forbids mutations')
  let data
  if (config.url === '/admin/reports') {
    const inPeriod = value => (!params.from || manilaDay(value) >= params.from) && (!params.to || manilaDay(value) <= params.to)
    const inspectionScenario = scenario.startsWith('inspections')
    const source = inspectionScenario ? inspectionRows.map((row, index) => ({ ...row, ...(scenario === 'inspections-long' && index === 0 ? { farm_name: 'Long Farm ' + 'A'.repeat(140), owner_name: 'Long Owner ' + 'B'.repeat(140) } : {}) })) : scenario === 'high' ? Array.from({ length: 200 }, (_, index) => ({ ...completed[0], id: index + 1 })) : completed
    const inspections = source.filter(record => inPeriod(record.completed_at_raw))
    const scheduledCount = scheduled.filter(record => inPeriod(record.scheduled_at)).length
    const others = otherInspections.filter(record => inPeriod(record.date))
    const inspectionSummary = inspectionScenario ? {
      total: inspections.length + others.length, completed: inspections.length, scheduled: others.filter(row => row.status === 'Scheduled').length,
      general: inspections.filter(row => row.inspection_type === 'General Inspection').length + others.filter(row => row.inspection_type === 'General Inspection').length,
      follow_up: inspections.filter(row => row.inspection_type === 'Follow-up').length + others.filter(row => row.inspection_type === 'Follow-up').length,
    } : { total: inspections.length + scheduledCount, completed: inspections.length, scheduled: scheduledCount, general: inspections.length, follow_up: 0 }
    const alertScenario = scenario.startsWith('alerts')
    const alertSource = scenario === 'alerts-high' ? [
      ...Array.from({ length: 200 }, (_, index) => ({ ...sensorIncidents[0], id: index + 5000 })),
      { ...sensorIncidents[23], id: 6000 },
    ] : alertScenario ? sensorIncidents : incidents
    const alerts = alertSource.filter(record => inPeriod(record.triggered_at_raw)).map((record, index) => ({ ...record,
      ...(alertScenario ? {
        triggered_at: formatDateTime(record.triggered_at_raw),
        is_ongoing: !record.resolved_at_raw || manilaDay(record.resolved_at_raw) > (params.to || '2026-11-30'),
        ...(scenario === 'alerts-long' && index === 0 ? { farm_name: 'Long Farm ' + 'A'.repeat(100), owner_name: 'Long Owner ' + 'B'.repeat(100) } : {}),
      } : { is_ongoing: record.is_ongoing ?? false }),
    }))
    data = { data: {
      report_period: { from: params.from || null, to: params.to || null },
      overview_summary: { total_farms: farms.filter(inPeriod).length, farm_status_breakdown: { normal: 1, warning: 1, critical: 1 } },
      reading_data_completeness: { complete_readings: 1000, incomplete_readings: 10 },
      inspection_summary: inspectionSummary,
      alert_summary: { total: 9999, total_incidents: alerts.length, critical_incidents: alerts.filter(record => record.status === 'Critical').length,
        ammonia_incidents: alerts.filter(record => record.sensor_type === 'ammonia').length + (scenario === 'alerts-mismatch' ? 1 : 0),
        moisture_incidents: alerts.filter(record => record.sensor_type === 'moisture').length,
        resolved_incidents: alerts.filter(record => !record.is_ongoing).length },
      service_summary: { total: pendingRequests.filter(inPeriod).length, completed: 0, pending: pendingRequests.filter(inPeriod).length },
      maintenance_summary: { undetermined: 0, completed_this_month: 0, non_compliant: 0 },
      completed_inspections: inspections, alert_records: alerts, completed_services: [],
      maintenance_overdue_list: [], maintenance_non_compliant_list: [], maintenance_completed_list: [],
      alert_trend: { aggregation: 'day', buckets: alerts.map(record => ({ label: record.triggered_at, count: 1 })) },
    } }
    lastReport = data.data
  } else if (config.url === '/notifications') data = { data: [], unread_count: 0, total_count: 0 }
  else if (config.url === '/admin/generated-reports') data = { data: { items: [], total: 0, page: 1, last_page: 1, query_key: params.query_key } }
  else { unexpected.push(config.url); throw Error('Unexpected reporting request: ' + config.url) }
  return { data, status: 200, statusText: 'OK', headers: {}, config }
}

const root = createRoot(document.querySelector('#root'))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const assert = (condition, message) => { if (!condition) throw Error(message) }
const wait = async predicate => { for (let i = 0; i < 200; i++) { if (predicate()) return; await sleep(20) } throw Error('Staff reporting fixture timed out: ' + predicate) }
const chart = () => { const canvas = document.querySelector('.staff-reports canvas'); return canvas ? Chart.getChart(canvas) : null }
const click = label => {
  const button = [...document.querySelectorAll('button')].find(element => element.getAttribute('aria-label') === label || (label === 'Filter' ? element.textContent.trim().startsWith('Filter') : element.textContent.trim() === label))
  assert(button, 'Missing reporting button: ' + label); button.click()
}
async function field(selector, value) {
  const element = document.querySelector(selector)
  const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }))
  await sleep(25)
}
async function render(nextScenario = 'normal') {
  scenario = nextScenario
  setAuth('synthetic-staff-reports-session', { id: 99, role: 'admin', name: 'Synthetic Staff' }, false)
  const current = ++revision
  root.render(<MemoryRouter key={current}><div data-report-fixture={current}><Reports /></div></MemoryRouter>)
  await wait(() => document.querySelector(`[data-report-fixture="${current}"] .staff-overview-stats`) && chart())
  await document.fonts.ready
  await sleep(40)
}
async function apply(mode, first, second) {
  click('Filter'); await wait(() => document.querySelector('[aria-label="Filter By"]'))
  assert([...document.querySelector('[aria-label="Filter By"]').options].map(option => option.value).join('|') === 'all|month|year|custom', 'Existing reporting date options stay unchanged')
  await field('[aria-label="Filter By"]', mode)
  if (mode === 'month') { await field('[aria-label="Reporting month"]', first); await field('[aria-label="Reporting year"]', '2026') }
  if (mode === 'year') await field('[aria-label="Reporting year"]', first)
  if (mode === 'custom') { await field('[aria-label="Reporting start date"]', first); await field('[aria-label="Reporting end date"]', second) }
  const selector = document.querySelector('.staff-alert-stats') ? '.staff-alert-stats' : document.querySelector('.staff-inspection-stats') ? '.staff-inspection-stats' : '.staff-overview-stats'
  const previous = document.querySelector(selector)
  click('Apply')
  await wait(() => document.querySelector(selector) && document.querySelector(selector) !== previous)
  await sleep(40)
}
const values = () => [...document.querySelectorAll('.staff-overview-stats .rp-stat-card')].map(card => Number(card.firstElementChild.textContent))
function chartState() {
  const current = chart()
  return current ? { labels: [...current.data.labels], values: [...current.data.datasets[0].data], min: current.scales.y.min, max: current.scales.y.max,
    ticks: current.scales.y.ticks.map(tick => tick.value), tooltip: current.options.plugins.tooltip.callbacks.label({ parsed: { y: 1 } }),
    color: current.data.datasets[0].backgroundColor, summary: current.canvas.getAttribute('aria-label') } : null
}
function alertChartState() {
  const current = chart()
  return current ? {
    labels: [...current.data.labels], datasets: current.data.datasets.map(dataset => ({ label: dataset.label, values: [...dataset.data], color: dataset.backgroundColor })),
    min: current.scales.y.min, max: current.scales.y.max, ticks: current.scales.y.ticks.map(tick => tick.value),
    tooltip: current.options.plugins.tooltip.callbacks.label({ dataset: current.data.datasets[0], parsed: { y: 1 } }),
    grouped: current.getDatasetMeta(0).data.every((bar, index) => bar.x < current.getDatasetMeta(1).data[index].x),
    pairGaps: current.getDatasetMeta(0).data.map((bar, index) => {
      const right = current.getDatasetMeta(1).data[index]
      return right.x - bar.x - (bar.width + right.width) / 2
    }),
    summary: current.canvas.getAttribute('aria-label'),
  } : null
}

const passed = []
try {
  await render()
  assert(values().join('|') === '3|9|5|3', 'Overview retains current API metric definitions, including all inspections and incident-based alerts')
  assert([...document.querySelectorAll('.staff-overview-stats .rp-stat-card')].map(card => card.children[1].textContent).join('|') === 'Total Farms|Total Inspections|Total Alerts|Critical Alerts', 'Four current metrics remain without retired pending requests')
  assert(document.querySelectorAll('.staff-reports canvas').length === 1, 'Only the main chart appears on Staff Overview')
  assert(!/Current monitoring coverage|Recent Inspections|Alerts by Severity/.test(document.querySelector('.staff-reports').textContent), 'Redundant Overview sections are absent')
  assert(document.querySelector('.staff-report-period').textContent === 'Reporting period: All records', 'Applied period is visible')
  assert(chartState().values.join('|') === '2|0|4|1' && chartState().labels.join('|') === 'Jun 2026|Jul 2026|Aug 2026|Sep 2026', 'Unsorted API records aggregate chronologically with zero months and Manila boundaries')
  assert(chartState().summary.includes('Jul 2026: 0'), 'Accessible chart description includes exact monthly counts')
  passed.push('Staff Overview has four neutral-ready API metrics and one chronological, record-based chart with zero months')

  await apply('month', '8')
  assert(values().join('|') === '1|5|2|1', 'Selected-month KPI scope matches the API instead of being recomputed from the chart')
  assert(document.querySelector('.staff-overview-stats').textContent.includes('Registered in period'), 'Farm registrations are distinguished from the current inventory')
  assert(chartState().values.join('|') === '4' && chartState().labels[0] === 'Aug 2026', 'Monthly completions exclude scheduled visits')
  assert(chartState().min === 0 && chartState().ticks.every(Number.isInteger), 'Zero-based integer scale')
  await apply('month', '9')
  assert(chartState().values[0] === 1 && chartState().max >= 1 && chartState().ticks.every(Number.isInteger), 'Low counts retain an integer scale')
  await apply('month', '11')
  assert(!chart() && document.querySelector('.staff-reports').textContent.includes('No completed inspections in this reporting period.'), 'An empty completion period has a clear empty state')
  assert(values()[1] === 1, 'Scheduled-inspection KPI still exists when there are no completed inspections')
  await apply('year', '2026')
  assert(chartState().labels.length === 12 && chartState().values.reduce((sum, value) => sum + value, 0) === 7, 'Year filter shows all twelve calendar months without changing completion totals')
  await apply('custom', '2026-06-01', '2026-10-31')
  assert(chartState().values.join('|') === '2|0|4|1|0', 'Custom period includes zero-count boundary months')
  assert(document.querySelector('.staff-report-period').textContent.includes('Jun 1, 2026'), 'Custom reporting period is readable')
  passed.push('All date modes retain shared API scope, zero/low counts, registration-cohort meaning and empty states')

  const tabs = [...document.querySelectorAll('[role="tab"]')].map(button => button.textContent)
  assert(tabs.join('|') === 'Overview|Inspections|Alerts|Maintenance|Files', 'Active Staff tabs exclude the retired-only service report')
  click('Inspections'); await sleep(40)
  assert(document.querySelector('.staff-reports').textContent.includes('Inspections by Type') && document.querySelector('.staff-reports').textContent.includes('Synthetic Farm'), 'Detailed inspection chart and records remain available')
  click('Alerts'); await sleep(40)
  assert(document.querySelector('.staff-reports canvas') && document.querySelector('.staff-reports').textContent.includes('Synthetic Farm'), 'Detailed alert chart and records remain available')
  click('Maintenance'); await sleep(40)
  click('Files'); await sleep(80)
  assert(requests.some(request => request.url === '/admin/generated-reports' && request.params.from === '2026-06-01' && request.params.to === '2026-10-31'), 'Files receives the same period')
  assert(!requests.some(request => request.url.startsWith('/vet/') || request.method !== 'get'), 'Staff sends only existing authorized read requests')
  assert(JSON.stringify(completed) === original && !unexpected.length && !runtimeErrors.length, 'Underlying fixture records remain unchanged without unexpected calls/errors')
  passed.push('All detailed reports, Files period propagation and Staff-only API permissions remain intact')

  await render('high')
  assert(chartState().values[0] === 200 && chartState().max >= 200 && chartState().ticks.every(Number.isInteger), 'High counts scale dynamically rather than being clipped to a fixed maximum')
  passed.push('Real Chart.js rendering scales dynamically for high counts')

  await render('inspections'); click('Inspections'); await sleep(60)
  const inspectionValues = () => [...document.querySelectorAll('.staff-inspection-stats .rp-stat-card')].map(card => Number(card.firstElementChild.textContent))
  assert(inspectionValues().join('|') === '30|23|3', 'Total includes Cancelled records and is not recalculated as Completed plus Scheduled')
  assert([...document.querySelectorAll('.staff-inspection-stats .rp-stat-card')].map(card => card.children[1].textContent).join('|') === 'Total Inspections|Completed|Scheduled', 'Only the three requested inspection KPIs remain')
  assert(document.querySelector('.staff-inspection-stats').textContent.includes('Includes all statuses'), 'Total meaning is explicit')
  assert(chartState().values.join('|') === '21|9', 'Type chart retains API counts across statuses rather than counting completed table rows')
  assert(chartState().min === 0 && chartState().ticks.every(Number.isInteger), 'Type chart has dynamic integer ticks')
  assert(chartState().tooltip === '1 inspection' && chartState().summary.includes('General: 21; Follow-up: 9'), 'Type counts are accessible through tooltips and canvas description')
  assert(chart().config.plugins.some(plugin => plugin.id === 'inspectionTypeCounts'), 'Actual bar-value labels are enabled on the type chart')
  const table = document.querySelector('.staff-inspections-report table')
  assert([...table.querySelectorAll('th')].map(th => th.textContent).join('|') === 'Inspection No.|Farm|Owner|Type|Date|Status', 'Completed table preserves all six columns')
  assert(table.tBodies[0].rows.length === 10 && table.tBodies[0].rows[0].cells[0].textContent === 'INS-2000', 'First page preserves API row order and default page size')
  assert([...table.tBodies[0].rows].every(row => row.cells[5].textContent === 'Completed'), 'Only completed rows are shown')
  assert([...document.querySelector('[aria-label="Rows per page"]').options].map(option => option.value).join('|') === '10|25|50', 'Existing page-size choices are unchanged')
  click('Next'); await sleep(30)
  assert(table.tBodies[0].rows[0].cells[0].textContent === 'INS-2010', 'Next page retains API ordering')
  click('Next'); await sleep(30)
  assert(table.tBodies[0].rows.length === 3 && document.querySelector('.staff-inspections-report [aria-label="Next"]').disabled, 'Last page and disabled navigation are preserved')
  await field('[aria-label="Rows per page"]', '25')
  assert(table.tBodies[0].rows.length === 23 && document.querySelector('.staff-inspections-report .agb-table-footer').textContent.includes('Showing 1–23 of 23'), 'Page-size changes reset to page one')
  passed.push('Staff Inspections keeps independent API KPIs, type counts, six completed-only columns, API ordering and pagination')

  await field('[aria-label="Rows per page"]', '10'); click('Next'); await sleep(30)
  await apply('custom', '2026-10-20', '2026-10-31')
  assert(inspectionValues().join('|') === '10|4|2', 'Custom period scopes Total, Completed and Scheduled without excluding Cancelled from Total')
  assert(document.querySelector('.staff-inspections-report tbody').rows.length === 4 && document.querySelector('.staff-inspections-report tbody').rows[0].cells[0].textContent === 'INS-2000', 'Period changes reset pagination and retain only completed records in range')
  await apply('month', '11')
  assert(inspectionValues().join('|') === '1|0|1' && chartState().values.join('|') === '0|1', 'Zero and low type counts use actual API values while completed table is empty')
  assert(document.querySelector('.staff-inspections-report').textContent.includes('No completed inspections in this range.'), 'Original completed-table empty state remains')
  await apply('month', '12')
  assert(inspectionValues().join('|') === '0|0|0' && !chart(), 'All-zero type counts use a clear chart empty state')
  assert(document.querySelector('.staff-inspections-report').textContent.includes('No General or Follow-up inspections in this reporting period.'), 'Type chart empty state is specific to its two categories')
  await render('high'); click('Inspections'); await sleep(30)
  assert(chartState().values[0] === 200 && chartState().max >= 200 && chartState().ticks.every(Number.isInteger), 'Type chart scales to large counts without clipping')
  assert(!unexpected.length && !runtimeErrors.length, 'Inspection rendering and interactions have no unexpected calls or runtime errors')
  passed.push('Inspection period filters, pagination reset, completed-only empty states and zero/low/high type counts remain correct')

  await render('alerts'); click('Alerts'); await sleep(40)
  const alertValues = () => [...document.querySelectorAll('.staff-alert-stats .rp-stat-card')].map(card => Number(card.firstElementChild.textContent))
  const reconcile = () => {
    const state = alertChartState()
    assert(state.datasets[0].values.reduce((sum, count) => sum + count, 0) === lastReport.alert_summary.ammonia_incidents, 'Monthly ammonia bars reconcile with the API ammonia metric')
    assert(state.datasets[1].values.reduce((sum, count) => sum + count, 0) === lastReport.alert_summary.moisture_incidents, 'Monthly moisture bars reconcile with the API moisture metric')
  }
  assert(alertValues().join('|') === '31|11|23', 'Total, Critical and Resolved preserve the existing API incident/cutoff counts')
  assert([...document.querySelectorAll('.staff-alert-stats .rp-stat-card')].map(card => card.children[1].textContent).join('|') === 'Total Alerts|Critical Alerts|Resolved Alerts', 'Only the three requested alert KPI cards remain')
  const grouped = alertChartState()
  assert(grouped.labels.join('|') === 'Sep 2026|Oct 2026|Nov 2026', 'Alert months are chronological with the missing month retained')
  assert(grouped.datasets[0].values.join('|') === '3|0|1' && grouped.datasets[1].values.join('|') === '23|0|4', 'Sensor series use real record counts with zero-filled months')
  assert(grouped.grouped && grouped.min === 0 && grouped.ticks.every(Number.isInteger), 'Actual Chart.js bars are side by side on a zero-based integer scale')
  assert(grouped.tooltip === 'Ammonia Alerts: 1 incident' && grouped.summary.includes('Oct 2026: Ammonia 0, Moisture 0'), 'Tooltips and canvas description identify each sensor and count')
  assert(document.querySelector('[aria-label="Alert sensor legend"]').textContent === 'Ammonia AlertsMoisture Alerts', 'A clear fixed sensor legend is present')
  assert(![...document.querySelectorAll('.staff-alerts-report h3')].some(heading => ['By Sensor', 'Alert incidents over time'].includes(heading.textContent)), 'No separate sensor breakdown or old single-series panel remains')
  reconcile()
  const alertTable = document.querySelector('.staff-alerts-report table')
  assert([...alertTable.tHead.rows[0].cells].map(cell => cell.textContent).join('|') === 'Farm|Owner|Sensor|Severity|Triggered|Status', 'All alert table columns remain')
  assert(alertTable.tBodies[0].rows.length === 10, 'Default alert page size is unchanged')
  for (let index = 0; index < 10; index++) {
    const row = alertTable.tBodies[0].rows[index], incident = lastReport.alert_records[index]
    assert(row.cells[3].textContent === incident.status && row.cells[4].textContent === incident.triggered_at && row.cells[5].textContent === (incident.is_ongoing ? 'Ongoing' : 'Resolved'), 'Severity, trigger time and resolution status remain API supplied')
  }
  click('Next'); await sleep(30)
  assert(alertTable.tBodies[0].rows[0].cells[0].textContent === lastReport.alert_records[10].farm_name, 'Alert pagination preserves API ordering')
  await field('[aria-label="Rows per page"]', '25')
  assert(alertTable.tBodies[0].rows.length === 25, 'Alert page-size selector still works')
  await field('[aria-label="Rows per page"]', '50')
  assert(alertTable.tBodies[0].rows.length === 31, 'All scoped alert records remain available through pagination')
  passed.push('Grouped monthly sensor bars reconcile exactly; three API KPI cards, legend, tooltips and paginated alert table retain their meanings')

  await apply('month', '9'); reconcile()
  assert(alertValues().join('|') === '26|9|0', 'September keeps period counts and the API resolution cutoff rather than current resolution')
  assert(alertChartState().datasets[0].values.join('|') === '3' && alertChartState().datasets[1].values.join('|') === '23', 'Month mode groups by Manila trigger month')
  assert([...document.querySelector('.staff-alerts-report table').tBodies[0].rows].every(row => row.cells[5].textContent === 'Ongoing'), 'Historical report cutoff status remains unchanged')
  await apply('month', '10')
  assert(alertValues().join('|') === '0|0|0' && !chart(), 'Empty alert periods have zero cards and no fabricated bars')
  assert(document.querySelector('.staff-alerts-report').textContent.includes('No ammonia or moisture incidents in this reporting period.') && document.querySelector('.staff-alerts-report').textContent.includes('No alerts recorded in this range.'), 'Both alert empty states are clear')
  await apply('year', '2026'); reconcile()
  assert(alertChartState().labels.length === 12, 'Year mode includes zero incident months')
  await apply('custom', '2026-09-10', '2026-11-05'); reconcile()
  assert(alertChartState().datasets[0].values.join('|') === '0|0|1', 'Custom mode preserves partial-month scope')
  await render('alerts-high'); click('Alerts'); await sleep(30); reconcile()
  const unequal = alertChartState()
  assert(unequal.datasets[0].values[0] === 1 && unequal.datasets[1].values[0] === 200 && unequal.max >= 200 && unequal.ticks.every(Number.isInteger), 'Uneven sensor volumes retain their real magnitudes and dynamic scale')
  assert(chart().config.plugins.some(plugin => plugin.id === 'alertSensorIncidentCounts'), 'Small series counts stay readable using value labels')
  await render('alerts-mismatch'); click('Alerts'); await sleep(30)
  assert(!chart() && document.querySelector('.staff-alerts-report [role="alert"]')?.textContent.includes('do not match'), 'An inconsistent response is not presented as a reconciled chart')
  assert(requests.every(request => request.method === 'get') && !unexpected.length && !runtimeErrors.length, 'Alert reporting performs authorized reads only with no runtime errors')
  passed.push('Monthly/year/custom alert filters, zero months, historical cutoff status, unequal volumes and reconciliation safeguards are verified')
  window.staffReportsOverview = {
    preview: async () => { await render(); await apply('custom', '2026-06-01', '2026-10-31') },
    high: () => render('high'),
    inspectionsPreview: async (longNames = false) => { await render(longNames ? 'inspections-long' : 'inspections'); click('Inspections'); await sleep(40) },
    alertsPreview: async (longNames = false) => { await render(longNames ? 'alerts-long' : 'alerts'); click('Alerts'); await sleep(40) },
    alertsYearPreview: async () => { await render('alerts'); click('Alerts'); await sleep(40); await apply('year', '2026') },
    alertState: alertChartState,
    state: chartState,
    filter: () => click('Filter'),
  }
  window.staffReportsOverviewResults = { passed }
} catch (error) { window.staffReportsOverviewResults = { passed, error: error.stack, unexpected, runtimeErrors } }
