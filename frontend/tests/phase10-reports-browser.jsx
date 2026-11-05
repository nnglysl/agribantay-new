import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import AdminReports from '../src/pages/admin/Reports'
import SuperReports from '../src/pages/superadmin/Reports'
import VetReports from '../src/pages/vet/Reports'
import Inspections from '../src/pages/admin/Inspections'
import api from '../src/api/axios'
import { setAuth } from '../src/utils/auth'
import { useCachedFetch } from '../src/hooks/useCachedFetch'
import { Chart } from 'chart.js'
import '../src/index.css'

const root = createRoot(document.getElementById('root'))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const assert = (value, message) => { if (!value) throw Error(message) }
const requests = [], unexpected = [], runtimeErrors = [], downloads = []
let actorRole = 'admin'
window.addEventListener('error', event => runtimeErrors.push(event.message))
window.addEventListener('unhandledrejection', event => runtimeErrors.push(String(event.reason)))
URL.createObjectURL = blob => { downloads.push(blob); return 'blob:synthetic' }
URL.revokeObjectURL = () => {}
HTMLAnchorElement.prototype.click = function () { /* no actual download/navigation */ }

const records = [{ id: 1, farm_name: 'Synthetic Farm', owner_name: 'Synthetic Owner', barangay: 'Calansayan',
  service_type: 'Blood Test Request', status: 'Completed', completed_at_raw: '2026-10-15T02:00:00Z', completed_at: 'Oct 15, 2026', notes: '=1+2' }]
records.push({ ...records[0], id: 2, service_type: 'Farm Biosecurity Request' }, { ...records[0], id: 3, service_type: 'Vaccine Request' })
const retired = ['Odor Control Request', 'Fly Control Request'].map((service_type, index) => ({ ...records[0], id: 100 + index, service_type }))
const archive = { id: 90, report_name: 'Synthetic frozen report', period_label: 'October 2026', period_start: '2026-10-01', period_end: '2026-10-31', report_type: 'Monthly', date_generated: 'Nov 1, 2026',
  snapshot: { reporting_version: 2, completed_inspections: [{ farm_name: '=1+2', inspection_type: 'General Inspection', completed_at: 'Oct 15, 2026' }],
    completed_services: retired,
    vet_services: [{ farm_name: '=1+2', service_type: 'Blood Test Request', vet_name: 'Synthetic Vet', completed_at: 'Oct 15, 2026' }] } }
const originalArchive = JSON.stringify(archive)
function archivedResponse() {
  // Match the real show-controller projections. The stored mixed snapshot
  // stays frozen, while each role receives only its authorized response.
  const copy = structuredClone(archive)
  if (actorRole === 'vet') copy.snapshot = {
    reporting_version: copy.snapshot.reporting_version,
    coverage: null, signatures: null, period_activity: null,
    vet_summary: copy.snapshot.vet_summary ?? {}, vet_services: copy.snapshot.vet_services ?? [],
  }
  else if (actorRole === 'admin') {
    delete copy.snapshot.vet_summary
    delete copy.snapshot.vet_services
  }
  return copy
}
api.defaults.adapter = async config => {
  const params = config.params || {}
  requests.push({ url: config.url, method: config.method, params: { ...params } })
  let data
  if (config.method !== 'get') throw Error('No mutations allowed in report browser fixture')
  if (config.url === '/notifications') data = { success: true, data: [], unread_count: 0 }
  else if (config.url === '/admin/farms') data = {success:true,data:[]}
  else if (config.url === '/admin/inspections') data = {success:true,data:{calendar:[{id:901,farm_id:701,farm_name:'Manila midnight fixture',owner_name:'Synthetic Owner',scheduled_at:'2026-09-30T16:30:00Z',status:'Scheduled',inspection_type:'General Inspection',assigned_to_id:1,scheduled_by_name:'Synthetic Staff'}],summary:{total:1,scheduled:1,completed:0,cancelled:0}}}
  else if (config.url.endsWith('/generated-reports/90')) data = { success: true, data: archivedResponse() }
  else if (config.url.endsWith('/generated-reports')) data = { success: true, data: { items: [Object.fromEntries(Object.entries(archive).filter(([key]) => key !== 'snapshot'))], total: 1, page: 1, last_page: 1, per_page: params.per_page, query_key: params.query_key } }
  else if (['/admin/reports', '/vet/reports'].includes(config.url)) data = { success: true, data: {
    report_period: { from: params.from || null, to: params.to || null, status_as_of: '2026-10-31' },
    overview_summary: { total_farms: 3, farm_status_breakdown: { normal: 0, warning: 1, critical: 1, pending_setup: 0, incomplete_data: 1, no_readings_yet: 0, offline: 0, incomplete_coverage: 3 } },
    reading_data_completeness: { complete_readings: 12, incomplete_readings: 3, no_primary_readings: 1 },
    inspection_summary: { total: 1, completed: 1, scheduled: 0, cancelled: 0, general: 1, follow_up: 0 },
    alert_summary: { total_incidents: 1, critical_incidents: 1, ammonia_incidents: 1, moisture_incidents: 0, warning: 0, resolved_incidents: 0, ongoing_incidents: 1 },
    maintenance_summary: { policy: 'annual_12_calendar_months_v1', compliant: 1, overdue: 0, non_compliant: 0, undetermined: 0 },
    service_summary: { total: 4, completed: 2, pending: 0, scheduled: 2 },
    alert_trend: { aggregation: 'day', total: 1, buckets: [{ key: '2026-10-15', label: 'Oct 15, 2026', count: 1 }] },
    completed_inspections: [{ ...records[0], inspection_type: 'General Inspection', inspector_name: 'Synthetic Staff' }],
    alert_records: [{ id: 1, farm_name: 'Synthetic Farm', sensor_type: 'ammonia', status: 'Critical', triggered_at_raw: '2026-10-15T02:00:00Z', triggered_at: 'Oct 15, 2026' }],
    maintenance_overdue_list: [], maintenance_non_compliant_list: [], maintenance_completed_list: [],
    completed_services: config.url === '/vet/reports' ? records : retired, total_completed: 3, total_pending: 0, total_requests: 3, farms_covered: 1, vet_name: 'Synthetic Vet',
    service_records: (config.url === '/vet/reports' ? records : retired).map(row => ({ ...row, date_raw: row.completed_at_raw, date: row.completed_at, vet_name: 'Synthetic Vet' })),
  } }
  else { unexpected.push(config.url); throw Error('Unexpected report request: ' + config.url) }
  return { status: 200, statusText: 'OK', headers: {}, config, data }
}
const wait = async condition => { for (let i = 0; i < 250; i++) { if (condition()) return; await sleep(20) } throw Error('Timed out: ' + condition) }
const buttons = () => [...document.querySelectorAll('button')]
const click = label => { const target = buttons().find(button => label === 'Filter' ? button.textContent.trim().startsWith('Filter') : button.textContent.trim() === label); assert(target, 'Missing button: ' + label + ' (available: '+buttons().map(button => button.textContent.trim()).join('|')+')'); target.click() }
const field = (selector, value) => {
  const element = document.querySelector(selector); assert(element, 'Missing field: ' + selector)
  Object.getOwnPropertyDescriptor(element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }))
}
async function render(role) {
  root.render(null); await sleep(40)
  actorRole = role
  setAuth('synthetic-session', { id: 1, role, name: 'Synthetic Auditor', first_name: 'Synthetic', last_name: 'Auditor' }, false)
  const Component = { admin: AdminReports, super_admin: SuperReports, vet: VetReports }[role]
  root.render(<MemoryRouter><Component /></MemoryRouter>)
  await wait(() => document.querySelector('h1') && buttons().some(button => button.textContent.trim() === 'Overview'))
  await sleep(100)
}
window.phase10ReportsPreview = async role => { await render(role); return true }
window.phase10CalendarPreview = async () => {
  root.render(null); await sleep(40)
  setAuth('synthetic-staff',{id:1,role:'admin',name:'Synthetic Staff'},false)
  root.render(<MemoryRouter initialEntries={['/admin/inspections?month=2026-10']}><Inspections /></MemoryRouter>)
  await wait(()=>document.querySelector('h1')?.textContent.includes('Inspections'))
  await sleep(120)
  const cell=[...document.querySelectorAll('div')].find(element=>element.children[0]?.textContent.trim()==='1'&&element.textContent.includes('Manila midnight fixture'))
  if(!cell) return {correctDay:false,errors:runtimeErrors}
  cell.click(); await sleep(80)
  return {correctDay:true,correctLabel:document.body.textContent.includes('October 1, 2026'),events:document.body.textContent.split('Manila midnight fixture').length-1,errors:runtimeErrors}
}
export function AccountCacheProbe() {
  const { data } = useCachedFetch('/settings')
  return <p id="account-cache-probe">{data?.name || 'Loading account'}</p>
}

const passed = []
try {
  for (const role of ['admin', 'super_admin', 'vet']) {
    const start = requests.length
    await render(role)
    if (role === 'admin') { click('Alerts'); await sleep(100) }
    assert(document.querySelector('canvas'), role + ': render a real report chart for populated data')
    click('Overview'); await sleep(50)
    if (role === 'super_admin') assert(document.body.textContent.includes('Current monitoring coverage') && document.body.textContent.includes('Incomplete Data') && document.body.textContent.includes('12 complete, 3 incomplete'), role + ': severity and incomplete coverage remain separate')
    if (role === 'admin') assert(!document.body.textContent.includes('Current monitoring coverage') && document.querySelectorAll('.rp canvas').length === 1 && document.querySelectorAll('.staff-overview-stats .rp-stat-card').length === 4, 'Staff Overview contains four current KPI cards and one inspection chart')
    if (role === 'admin') assert(!requests.slice(start).some(request => request.url === '/vet/reports'), 'Staff cannot request Vet reports')
    if (role === 'vet') assert(!requests.slice(start).some(request => request.url === '/admin/reports'), 'Vet cannot request Admin reports')
    if (role === 'super_admin') {
      const card = [...document.querySelectorAll('.rp-stat-card')].find(element => element.textContent.includes('Vet Service Requests'))
      assert(card?.firstElementChild.textContent === '3' && document.body.textContent.includes('Vet services completed by type'), 'Super Admin totals use the unchanged Vet scope, excluding Staff retired counts')
      const servicesChart = Chart.getChart(document.querySelectorAll('.rp canvas')[1])
      assert(servicesChart.data.labels.join('|') === 'Farm biosecurity|Blood test' && servicesChart.data.datasets[0].data.join('|') === '2|1', 'Service chart excludes retired API rows and preserves historical Vaccine folding into Biosecurity')
    }
    const tabs = role === 'vet' ? ['Overview', 'Service History', 'Files'] : role === 'admin' ? ['Overview', 'Inspections', 'Alerts', 'Maintenance', 'Files'] : ['Overview', 'Inspections', 'Alerts', 'Maintenance', 'Service Requests', 'Files']
    if (role === 'admin') assert(!buttons().some(button => button.getAttribute('role') === 'tab' && button.textContent === 'Service Requests'), 'No retired-only Staff reporting tab')
    for (const tab of tabs) {
      click(tab); await sleep(60); assert(!document.body.textContent.includes('Something went wrong'), role + ': tab error')
      if (tab !== 'Files') assert(!/Odor|Odour|Fly control|Legacy Pending Status/i.test(document.querySelector('.rp').textContent), role + ': no retired workflows in active reporting')
      if (role === 'super_admin' && tab === 'Service Requests') assert(document.body.textContent.includes('Vet Service Request Records') && document.body.textContent.includes('Farm Biosecurity') && document.body.textContent.includes('Blood Test') && document.body.textContent.includes('Vaccination'), 'Authorized Vet reports retain Biosecurity, Blood Test and historical Vaccine rows')
      if (role === 'admin' && tab === 'Inspections') {
        const cards = [...document.querySelectorAll('.staff-inspection-stats .rp-stat-card')]
        assert(cards.length === 3 && cards.every(card => getComputedStyle(card).backgroundColor === 'rgb(255, 255, 255)'), 'Staff inspection summary is opt-in and neutral')
      }
      if (role === 'super_admin' && tab === 'Inspections') {
        assert(!document.querySelector('.staff-inspection-stats') && [...document.querySelectorAll('.rp-stat-card')].every(card => getComputedStyle(card).backgroundColor !== 'rgb(255, 255, 255)'), 'Super Admin retains its own status cards and visibility')
      }
      if (role === 'admin' && tab === 'Alerts') {
        assert(document.querySelectorAll('.staff-alert-stats .rp-stat-card').length === 3 && document.querySelector('.staff-alerts-report').textContent.includes('Alert Incidents by Sensor'), 'Staff receives the grouped sensor chart and three summary cards')
      }
      if (role === 'super_admin' && tab === 'Alerts') {
        assert(!document.querySelector('.staff-alert-stats') && document.body.textContent.includes('Alert incidents over time'), 'Super Admin keeps its separate reporting layout and metrics')
      }
    }
    click('Overview'); await sleep(50)
    for (const [mode, from, to] of [['month', '2026-10-01', '2026-10-31'], ['year', '2026-01-01', '2026-12-31'], ['custom', '2026-10-10', '2026-10-20']]) {
      click('Filter'); await wait(() => document.querySelector('[aria-label="Filter By"]'))
      field('[aria-label="Filter By"]', mode); await sleep(30)
      if (mode === 'month') field('[aria-label="Reporting month"]', '10')
      if (mode !== 'custom') field('[aria-label="Reporting year"]', '2026')
      else {
        field('[aria-label="Reporting start date"]', '2026-10-20'); field('[aria-label="Reporting end date"]', '2026-10-10'); await sleep(30)
        const before = requests.length; click('Apply'); await sleep(30)
        assert(document.querySelector('[role="alert"]') && requests.length === before, 'Invalid period must not fetch')
        field('[aria-label="Reporting start date"]', from); field('[aria-label="Reporting end date"]', to)
      }
      await sleep(30); const scopeStart = requests.length; click('Apply')
      await wait(() => requests.slice(scopeStart).some(request => request.url.endsWith('/reports') && request.params.from === from && request.params.to === to))
      await sleep(70)
    }
    passed.push(role + ': real report tabs, chart, role-specific calls and three date modes')
    click('Files'); await wait(() => buttons().some(button => button.textContent.trim() === 'Export CSV'))
    const beforeDownload = downloads.length; click('Export CSV'); await wait(() => downloads.length > beforeDownload)
    const csv = await downloads.at(-1).text()
    assert(csv.includes('"\t=1+2"'), 'Actual archive export must neutralize untrusted farm names')
    if (role === 'vet') assert(!csv.includes('Odor Control Request') && !csv.includes('Fly Control Request') && csv.includes('Blood Test Request'), 'Vet archive exports receive only the authorized veterinary slice')
    else assert(csv.includes('Odor Control Request') && csv.includes('Fly Control Request'), 'Authorized frozen mixed snapshots retain their retired history in CSV exports')
    if (role === 'admin') assert(!csv.includes('Blood Test Request'), 'Staff archive exports cannot reintroduce stripped veterinary details')
    assert(JSON.stringify(archive) === originalArchive, 'Role projections and exports cannot rewrite a stored mixed snapshot')
    passed.push(role + ': frozen report export retrieves the selected archive and neutralizes formula text')
  }
  // Two owners using the same browser/role must never share an earlier
  // account's pending response or repopulated cache after a session change.
  root.render(null); await sleep(40)
  const adapter=api.defaults.adapter, pending=[]
  api.defaults.adapter=config=>new Promise(resolve=>pending.push(name=>resolve({status:200,statusText:'OK',headers:{},config,data:{data:{name}}})))
  setAuth('synthetic-owner-a',{id:101,role:'farm_owner'},false)
  root.render(<AccountCacheProbe />); await wait(()=>pending.length===1)
  root.render(null); await sleep(40)
  setAuth('synthetic-owner-b',{id:102,role:'farm_owner'},false)
  root.render(<AccountCacheProbe />); await sleep(60)
  if(pending[1]) pending[1]('Current account')
  else pending[0]('Previous account')
  await wait(()=>document.getElementById('account-cache-probe')?.textContent !== 'Loading account')
  assert(document.getElementById('account-cache-probe').textContent==='Current account','New session must not receive the previous account response')
  pending[0]('Previous account'); await sleep(60)
  root.render(null); await sleep(40); root.render(<AccountCacheProbe />); await sleep(60)
  assert(document.getElementById('account-cache-probe').textContent==='Current account','Old response must not repopulate the new session cache')
  api.defaults.adapter=adapter
  passed.push('same-role account switching cannot share pending responses or stale cache')
  assert(unexpected.length === 0 && runtimeErrors.length === 0, 'No unexpected API calls or browser runtime errors: ' + runtimeErrors.join('; '))
  window.phase10ReportsResults = { passed, unexpected, runtimeErrors }
} catch (error) { window.phase10ReportsResults = { passed, error: error.stack, unexpected, runtimeErrors } }
