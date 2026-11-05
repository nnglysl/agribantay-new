/* eslint-disable react-refresh/only-export-components -- Standalone browser fixture. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import '../src/index.css'
import ManureRecords from '../src/pages/farmowner/ManureRecords'
import ServiceRequests from '../src/pages/farmowner/ServiceRequests'
import StaffFarmDetails from '../src/pages/admin/FarmDetails'
import SuperFarmDetails from '../src/pages/superadmin/FarmDetails'
import StaffServiceHistory from '../src/pages/admin/ServiceRequests'
import SuperServiceRequests from '../src/pages/superadmin/ServiceRequests'
import StaffDashboard from '../src/pages/admin/Dashboard'
import MaintenanceOverdue from '../src/pages/admin/MaintenanceOverdue'
import FarmMaintenanceDetails from '../src/pages/admin/FarmMaintenanceDetails'
import FarmProvider from '../src/context/FarmProvider'
import { useSelectedFarm } from '../src/hooks/useSelectedFarm'
import { clearAllCache, invalidateCache } from '../src/hooks/useCachedFetch'
import { setAuth } from '../src/utils/auth'
import api from '../src/api/axios'

// Entirely synthetic. No API verb can reach the operational server.
const requests = [], unexpected = [], runtimeErrors = [], opened = []
window.addEventListener('error', event => runtimeErrors.push(event.message))
window.addEventListener('unhandledrejection', event => runtimeErrors.push(String(event.reason)))
window.open = url => { opened.push({ url }); return {} }
const originalClick = HTMLAnchorElement.prototype.click
HTMLAnchorElement.prototype.click = function () { if (this.href.startsWith('blob:')) opened.push({ url: this.href, download: this.download }); else originalClick.call(this) }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const clone = value => structuredClone(value)
const farms = [{ id: 1, farm_name: 'Calansayan Poultry Farm', status: 'Active' }, { id: 2, farm_name: 'Second Owner Farm', status: 'Active' }]
let documents, failure, delay, uploadDelay, nextId, mounts = 0, actorRole = 'farm_owner'
let maintenanceDelay = 5
let dashboardFixture = { total_farms: 2, cleanout_compliance: { compliant: 1, non_compliant: 1, undetermined: 0, total_farms: 2 } }
let dashboardInspections = []
const complianceFor = id => Number(id) === 2 ? {
  status: 'Non-Compliant', registration_date: 'Oct 30, 2025', last_full_cleanout_date: null,
  due_date: 'Oct 30, 2026', days_since: null, days_remaining: 0, days_overdue: 1,
  required_interval: '12 Calendar Months', interval_months: 12, compliance_basis: 'farm_registration',
} : {
  status: 'Compliant', registration_date: 'Jun 12, 2026', last_full_cleanout_date: 'Oct 10, 2026', last_performed_at: 'Oct 10, 2026',
  due_date: 'Oct 10, 2027', days_since: 21, days_remaining: 344, days_overdue: 0,
  required_interval: '12 Calendar Months', interval_months: 12, compliance_basis: 'latest_full_cleanout',
}
const legacy = [{ id: 90, service_type: 'Odor Control Request', status: 'Scheduled', created_at: '2026-10-20T01:00:00Z', scheduled_at: '2026-11-01T01:00:00Z' },
  { id: 91, service_type: 'Fly Control Request', status: 'Completed', created_at: '2026-10-10T01:00:00Z', completed_at: '2026-10-20T01:00:00Z', attachments: [{ id: 66, original_name: 'legacy-form.pdf', mime_type: 'application/pdf', file_size: 400, uploaded_at: '2026-10-20T01:00:00Z', uploaded_by: 'Fixture Staff' }] },
  { id: 92, service_type: 'Farm Biosecurity Request', status: 'Pending', created_at: '2026-10-20T01:00:00Z' },
  { id: 93, service_type: 'Blood Test Request', status: 'Scheduled', created_at: '2026-10-20T01:00:00Z', scheduled_at: '2026-11-01T01:00:00Z' }]
const retired = type => ['Odor Control Request', 'Fly Control Request'].includes(type)
function reset() {
  documents = Array.from({ length: 13 }, (_, i) => ({ id: i + 1, farm_id: 1, category: i === 12 ? 'fly_control' : 'odor_control',
    document_type: i === 12 ? 'Fly Control' : 'Odor Control', original_name: i === 12 ? 'fly-control-record.pdf' : i === 11 ? 'odor-control-plan.pdf' : `earlier-plan-${i + 1}.pdf`,
    file_size: 42000, mime_type: 'application/pdf', uploaded_at: 'Oct 31, 2026 10:45 AM', uploaded_by: 'Mara Reyes', remarks: i === 11 ? 'Current farm management plan.' : null }))
  failure = ''; delay = 8; uploadDelay = 15; nextId = 14
}
reset()
function fail(message = 'Synthetic request unavailable.') { const error = new Error(message); error.response = { status: 503, data: { message } }; throw error }
function table(rows, params, extra = {}) {
  const size = Number(params.per_page || 10), total = rows.length, last = Math.max(1, Math.ceil(total / size)), current = Math.min(Number(params.page || 1), last)
  return { items: rows.slice((current - 1) * size, current * size), total, current_page: current, page: current, last_page: last, per_page: size, query_key: params.query_key, ...extra }
}
api.get = async (url, options = {}) => {
  const params = clone(options.params || {})
  requests.push({ method: 'GET', url, params, responseType: options.responseType })
  const captured = clone(documents), capturedFailure = failure
  const capturedCompliance = clone(complianceFor(params.farm_id || 1))
  await sleep(url.includes('control-documents') ? delay : url === '/farmer/maintenance' ? maintenanceDelay : 5)
  if (options.signal?.aborted) { const error = Error('Canceled'); error.code = 'ERR_CANCELED'; throw error }
  if (capturedFailure && url.includes(capturedFailure)) fail(capturedFailure === 'control-documents' ? 'Control Documents are not available yet. Please contact system support.' : undefined)
  if (url === '/notifications') return { data: { data: [], total_count: 0, unread_count: 0 } }
  if (url === '/farmer/farms') return { data: { data: clone(farms) } }
  // Farm Details can mount its read-only house section before the test opens Compliance.
  if (/^\/farms\/(1|2)\/poultry-houses$/.test(url)) return { data: { data: { farm_id: Number(url.split('/')[2]), available: false, inventory_status: 'unavailable', can_manage: false, houses: [], message: 'Poultry house records are not available yet.' } } }
  if (url === '/farmer/maintenance') return { data: { data: { farm_id: Number(params.farm_id), recent_logs: Number(params.farm_id) === 2 ? [] : [{ id: 71, performed_at: 'Oct 10, 2026', maintenance_type: 'Full Manure Clean-out', notes: 'Full manure clean-out recorded.', photo_url: null }], status: { ...capturedCompliance, as_of_date: '2026-10-31', registration_date_raw: Number(params.farm_id) === 2 ? '2025-10-30' : '2026-06-12' } } } }
  if (url === '/farmer/disposal-records') return { data: { data: [] } }
  if (url === '/admin/maintenance/overdue') return { data: { data: table([{ farm_id: 2, farm_name: farms[1].farm_name, owner_name: 'Mara Reyes', barangay: 'Calansayan', farm_size: 'Large', ...complianceFor(2) }], params) } }
  if (/^\/admin\/maintenance\/\d+\/details$/.test(url)) return { data: { data: { farm: { ...farms[1], owner_name: 'Mara Reyes', barangay: 'Calansayan', farm_size: 'Large', created_at: '2025-10-30T02:00:00Z' }, maintenance: complianceFor(2), notifications: [], logs: [] } } }
  if (url === '/admin/dashboard') return { data: { data: { total_owners: 1, active_requests: 0, critical_farms: [], upcoming_inspections: [], ...clone(dashboardFixture) } } }
  if (url === '/admin/inspections') return { data: { data: clone(dashboardInspections) } }
  if (url === '/admin/farms-map') return { data: { data: [] } }
  if (url === '/farmer/service-requests' || url === '/admin/service-requests') {
    let rows = clone(legacy).filter(item => !retired(item.service_type) && actorRole !== 'admin' && params.tab !== 'legacy')
    rows = rows.filter(item => ['past','history'].includes(params.tab) ? ['Completed','Cancelled'].includes(item.status)
      : params.tab === 'active' ? ['Pending','Scheduled'].includes(item.status)
        : params.tab === 'overdue' ? item.status === 'Scheduled' && new Date(item.scheduled_at) < new Date()
          : params.tab === 'scheduled' ? item.status === 'Scheduled' && new Date(item.scheduled_at) >= new Date()
            : item.status.toLowerCase() === params.tab)
    if (params.service_type) rows = rows.filter(item => item.service_type === params.service_type)
    if (params.search) rows = rows.filter(item => [item.request_number,item.service_type,item.farm_name].join(' ').toLowerCase().includes(params.search.toLowerCase()))
    rows = rows.map(item => ({ farm_name: farms[0].farm_name, farm_owner_name: 'Mara Reyes', requested_by: 'Mara Reyes', request_number: 'SR-'+item.id, is_retired: retired(item.service_type), ...item }))
    return { data: { data: table(rows, params) } }
  }
  if (/^\/admin\/farms\/\d+$/.test(url)) { const id = Number(url.split('/').at(-1)); return { data: { data: { ...farms.find(farm => farm.id === id), address: 'Calansayan, San Jose, Batangas', barangay: 'Calansayan', farm_size: 'Medium', created_at: '2026-06-12T02:00:00Z', user: { first_name: 'Mara', last_name: 'Reyes' }, device_list: [], sensors: [], device_deployments: [], maintenance_status: complianceFor(id) } } } }
  if (/^\/farms\/\d+\/control-documents\/\d+\/file$/.test(url) || url === '/service-requests/91/attachments/66') return { data: new Blob(['%PDF-1.4 synthetic'], { type: 'application/pdf' }), headers: { 'content-type': 'application/pdf', 'content-disposition': 'inline; filename="fixture-document.pdf"' } }
  if (/^\/farms\/\d+\/control-documents$/.test(url)) {
    const farmId = Number(url.split('/')[2]), rows = captured.filter(row => row.farm_id === farmId).sort((a, b) => b.id - a.id)
    const latest = { odor_control: rows.find(row => row.category === 'odor_control') || null, fly_control: rows.find(row => row.category === 'fly_control') || null }
    const items = rows.map(row => ({ ...row, is_latest: latest[row.category]?.id === row.id, status: latest[row.category]?.id === row.id ? 'On File' : 'Previous Submission' }))
    return { data: { data: table(items, params, { farm_id: farmId, latest, max_file_kb: 5120 }) } }
  }
  unexpected.push(url); fail('Unexpected GET: ' + url)
}
api.post = async (url, body) => {
  requests.push({ method: 'POST', url, body: body instanceof FormData ? Object.fromEntries(body) : clone(body) })
  const farmId = Number(url.split('/')[3]), capturedFailure = failure
  await sleep(uploadDelay)
  if (url === '/farmer/service-requests') {
    if (retired(body.service_type)) fail('Retired type')
    const row = { id: legacy.length + 1000, ...body, status: 'Pending', created_at: '2026-10-31T01:00:00Z' }; legacy.push(row)
    return { data: { success: true, data: row } }
  }
  if (capturedFailure === 'upload') fail('The document could not be saved. Please try again.')
  if (/^\/farmer\/farms\/\d+\/control-documents$/.test(url)) {
    const category = body.get('category')
    documents.push({ id: nextId++, farm_id: farmId, category, document_type: category === 'odor_control' ? 'Odor Control' : 'Fly Control',
      original_name: body.get('document').name, file_size: body.get('document').size, mime_type: body.get('document').type, uploaded_at: 'Oct 31, 2026 11:00 AM', uploaded_by: 'Mara Reyes', remarks: body.get('remarks') })
    return { data: { success: true } }
  }
  unexpected.push(url); fail('Unexpected POST: ' + url)
}
for (const verb of ['put', 'patch', 'delete']) api[verb] = async url => { unexpected.push(url); fail('Unexpected mutation ' + url) }

function SelectionBridge() { const { setSelectedFarmId } = useSelectedFarm(); window.fixtureSelectFarm = setSelectedFarmId; return null }
const root = createRoot(document.querySelector('#root'))
const assert = (condition, message) => { if (!condition) throw Error(message) }
const text = () => document.body.textContent
const wait = async predicate => { for (let i = 0; i < 300; i++) { if (predicate()) return; await sleep(20) } throw Error('Timed out: ' + text().slice(-750)) }
const button = label => [...document.querySelectorAll('button')].find(element => { const copy = element.cloneNode(true); copy.querySelectorAll('[aria-hidden="true"],.cd-sr-only').forEach(child => child.remove()); return copy.textContent.trim() === label })
const click = label => { const element = button(label); assert(element, 'Missing button ' + label); element.click() }
const panel = () => document.querySelector('.control-documents')
function input(element, value) { Object.getOwnPropertyDescriptor(element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLTextAreaElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new Event('change', { bubbles: true })); element.dispatchEvent(new Event('input', { bubbles: true })) }
function chooseFile(name = 'updated-plan.pdf', type = 'application/pdf', content = '%PDF-1.4 synthetic') {
  const files = new DataTransfer(); files.items.add(new File([content], name, { type })); const element = document.querySelector('#control-document-file'); element.files = files.files; element.dispatchEvent(new Event('change', { bubbles: true }))
}
async function render({ role = 'farm_owner', farmId = 1, page = 'documents', seed = true, prefill, query = '' } = {}) {
  root.render(null); await sleep(25); clearAllCache(); if (seed) reset()
  localStorage.setItem('agribantay_selected_farm_id', String(farmId))
  actorRole = role
  setAuth('isolated-document-fixture', { id: 91, first_name: 'UI', last_name: 'Fixture', role, must_change_password: false, legal_acknowledged_at: '2026-10-31T00:00:00Z' })
  const prefix = role === 'admin' ? 'admin' : 'superadmin'
  const route = role === 'farm_owner' ? (page === 'services' ? '/farmowner/service-requests' : '/farmowner/manure-records') : page === 'overdue' ? '/admin/maintenance/overdue' : page === 'maintenance-details' ? '/admin/maintenance/overdue/2' : page === 'services' ? `/${prefix}/service-requests` : page === 'dashboard' ? '/admin/dashboard' : `/${prefix}/farms/${farmId}`
  root.render(<StrictMode key={++mounts}><MemoryRouter initialEntries={[{ pathname: route, search: query, state: prefill ? { prefillService: prefill } : null }]}>{role === 'farm_owner' ? <FarmProvider><SelectionBridge /><Routes><Route path="/farmowner/manure-records" element={<ManureRecords />} /><Route path="/farmowner/service-requests" element={<ServiceRequests />} /></Routes></FarmProvider> : <Routes><Route path="/admin/farms/:farmId" element={<StaffFarmDetails />} /><Route path="/superadmin/farms/:farmId" element={<SuperFarmDetails />} /><Route path="/admin/service-requests" element={<StaffServiceHistory />} /><Route path="/superadmin/service-requests" element={<SuperServiceRequests />} /><Route path="/admin/dashboard" element={<StaffDashboard />} /><Route path="/admin/maintenance/overdue" element={<MaintenanceOverdue />} /><Route path="/admin/maintenance/overdue/:farmId" element={<FarmMaintenanceDetails />} /></Routes>}</MemoryRouter></StrictMode>)
  if (page === 'overdue' || page === 'maintenance-details') { await wait(() => text().includes('Non-Compliant')); return }
  if (page === 'services') { await wait(() => document.querySelectorAll('tbody tr').length > 0 || text().includes('No requests') || text().includes('No service requests are available')); return }
  if (page === 'dashboard') { await wait(() => text().includes('Farm monitoring map')); await sleep(250); return }
  if (page === 'manure') { await wait(() => button('Control Documents') && button('Disposal Records')); return }
  await wait(() => button(role === 'farm_owner' ? 'Control Documents' : 'Compliance'))
  click(role === 'farm_owner' ? 'Control Documents' : 'Compliance')
  await wait(() => panel() && !panel().querySelector('[aria-label="Loading control documents"]'))
}
async function selectFarm(id) {
  const selector = document.querySelector('.agb-farm-selector .agb-dropdown-trigger'); selector.click(); await wait(() => document.querySelectorAll('.agb-farm-selector .agb-dropdown-option').length > 0)
  const option = [...document.querySelectorAll('.agb-farm-selector .agb-dropdown-option')].find(element => element.textContent.includes(farms.find(farm => farm.id === id).farm_name)); assert(option, 'Farm option must exist'); option.click()
  await sleep(25)
}
async function uploadForm(category = 'odor_control') {
  document.querySelector('.cd-upload').click()
  await wait(() => document.querySelector('[role="dialog"]'))
  input(document.querySelector('#control-document-category'), category); await sleep(20)
}
window.phase6Preview = async options => {
  await render(options)
  if (options.view === 'history') { click('View Submission History'); await wait(() => document.querySelector('.cd-history')) }
  if (options.view === 'upload') await uploadForm()
  if (options.view === 'error') { failure = 'control-documents'; invalidateCache(`/farms/${options.farmId || 1}/control-documents`); await wait(() => panel().querySelector('[role="alert"]')) }
  window.scrollTo(0, 0)
}

const passed = []
try {
  await render({ farmId: 2 })
  assert(panel()?.textContent.includes('Second Owner Farm') && panel().querySelector('h2')?.textContent === 'Farm Documents' && panel().querySelector('.cd-empty p')?.textContent === 'No documents uploaded yet.' && panel().querySelectorAll('.cd-heading .cd-upload').length === 1 && !panel().querySelector('table'), 'An empty farm must show a simple empty state and one authorized upload action in its heading')
  assert(document.querySelectorAll('.mr-tab-btn').length === 2 && text().toLowerCase().includes('service requests'), 'Keep manure records and valid Vet service sidebar')
  passed.push('selected empty farm has a simple empty state and Farmer-only upload while keeping existing navigation')
  await uploadForm('fly_control')
  assert(document.querySelector('.cd-selected-farm').textContent.includes('Second Owner Farm') && document.activeElement.id === 'control-document-category', 'Upload form must identify farm and receive focus')
  chooseFile('fly-submission.pdf'); await sleep(15); click('Submit Document'); click('Submit Document')
  await wait(() => panel()?.textContent.includes('fly-submission.pdf'))
  const upload = requests.filter(request => request.method === 'POST').at(-1)
  assert(upload.url === '/farmer/farms/2/control-documents' && upload.body.category === 'fly_control' && !('farm_id' in upload.body) && requests.filter(request => request.method === 'POST').length === 1, 'Explicit selected farm, server-owned identity and duplicate-click guard')
  passed.push('Fly Control upload targets selected farm with feedback and duplicate-click protection')
  await selectFarm(1); await wait(() => panel()?.textContent.includes('odor-control-plan.pdf'))
  assert(!panel()?.textContent.includes('fly-submission.pdf'), 'A second farm submission must not appear on farm one')
  assert([...panel().querySelectorAll('thead th')].map(cell => cell.textContent).join('|') === 'File Name|Document Type|Date Uploaded|Actions', 'Current documents show supported metadata without inventing expiry dates')
  assert(panel().querySelectorAll('tbody tr').length === 2 && !panel().querySelector('.cd-category,.cd-status') && panel().textContent.includes('Current farm management plan.'), 'Latest category records and remarks remain without nested category cards or approval badges')
  passed.push('existing farm selector isolates current documents per owned farm')
  await uploadForm(); chooseFile(); await sleep(10); click('Submit Document'); await wait(() => panel()?.textContent.includes('updated-plan.pdf'))
  click('View Submission History'); await wait(() => document.querySelector('.cd-history'))
  assert(text().includes('Previous Submission') && documents.some(row => row.original_name === 'odor-control-plan.pdf'), 'Updating appends and retains the previous submission')
  assert(text().includes('Showing 1–10 of 14'), 'History must use server totals')
  document.querySelector('.cd-history [aria-label="Next"]').click(); await wait(() => text().includes('Showing 11–14 of 14'))
  assert(document.querySelectorAll('.cd-history tbody tr').length === 4 && panel()?.textContent.includes('updated-plan.pdf'), 'No double pagination, latest remains on page two')
  passed.push('Odor Control update preserves previous files and server-paged submission history')
  document.querySelector('[aria-label="View updated-plan.pdf"]').click(); await wait(() => opened.length > 0)
  await wait(() => !document.querySelector('[aria-label="Download updated-plan.pdf"]')?.disabled)
  document.querySelector('[aria-label="Download updated-plan.pdf"]').click(); await wait(() => opened.some(item => item.download))
  const fileCalls = requests.filter(request => request.url.endsWith('/file'))
  assert(fileCalls.every(request => request.url.startsWith('/farms/1/control-documents/') && request.responseType === 'blob') && fileCalls.some(request => request.params.download === 1), 'Files must use authenticated blob requests with correct farm')
  passed.push('View and Download reuse authenticated private-file transport')
  await uploadForm(); chooseFile('bad.svg', 'image/svg+xml', '<svg/>'); await sleep(10); const count = requests.length; click('Submit Document'); await wait(() => text().includes('Choose a PDF'))
  assert(requests.length === count, 'Invalid extension must fail before upload'); click('Cancel')
  passed.push('invalid files have clear validation feedback without submitting')
  failure = 'upload'; await uploadForm(); chooseFile(); await sleep(10); click('Submit Document'); await wait(() => text().includes('The document could not be saved'))
  assert(document.querySelector('[role="dialog"]') && button('Submit Document') && !button('Submit Document').disabled, 'Failed upload remains retryable')
  failure = ''; click('Cancel')
  passed.push('failed uploads retain the form and allow retry or cancel')
  delay = 200; invalidateCache('/farms/1/control-documents'); await sleep(25); await selectFarm(2)
  await wait(() => panel()?.textContent.includes('fly-submission.pdf')); await sleep(220)
  assert(!panel()?.textContent.includes('updated-plan.pdf') && !panel()?.textContent.includes('odor-control-plan.pdf'), 'Delayed previous-farm responses cannot repopulate current cards')
  passed.push('farm switching rejects delayed responses from the previous farm')
  delay = 8; await uploadForm(); chooseFile('late-farm-two.pdf'); await sleep(10); uploadDelay = 180; click('Submit Document'); await sleep(20); await selectFarm(1)
  await wait(() => panel()?.textContent.includes('updated-plan.pdf')); await sleep(200)
  assert(!document.querySelector('[role="dialog"]') && !panel()?.textContent.includes('late-farm-two.pdf') && documents.find(row => row.original_name === 'late-farm-two.pdf').farm_id === 2, 'An in-flight upload stays attached to its captured farm')
  passed.push('in-flight upload cannot move its file or success state to another selected farm')
  for (const role of ['admin', 'super_admin']) {
    await render({ role })
    const beforeReadOnly = requests.length
    assert(document.querySelectorAll('.fd-main-tabs button').length === 4 && panel()?.querySelectorAll('tbody tr').length === 2 && !panel().querySelector('.cd-upload'), 'LGU integration is read-only inside four tabs')
    assert(document.querySelectorAll('.fd-compliance > section').length === 2 && !document.querySelector('.annual-compliance .annual-compliance,.fd-compliance > .fd-panel'), 'Compliance has exactly two flat cards')
    assert(document.querySelector('.annual-compliance h2')?.textContent === 'Annual Clean-out Compliance' && document.querySelector('.annual-compliance-actions button')?.textContent.includes('View Clean-out History'), 'Annual status and history action share one card')
    click('View Submission History'); await wait(() => document.querySelector('.cd-history'))
    assert(![...panel().querySelectorAll('button')].some(item => /approve|reject|verify|submit|update|upload|delete|edit/i.test(item.textContent)), 'No document review or mutation action')
    document.querySelector('[aria-label="View odor-control-plan.pdf"]').click(); await sleep(20)
    await wait(() => !document.querySelector('[aria-label="Download odor-control-plan.pdf"]').disabled)
    document.querySelector('[aria-label="Download odor-control-plan.pdf"]').click(); await sleep(20)
    assert(requests.slice(beforeReadOnly).every(request => request.method === 'GET'), 'Administrative document actions only read files and history')
  }
  passed.push('Staff and Super Admin view current/history files without document mutation or review actions')
  await render({ farmId: 2 }); delay = 160; await selectFarm(1)
  await wait(() => panel()?.querySelector('[aria-label="Loading control documents"]'))
  assert(!panel().querySelector('.cd-empty,.cd-upload'), 'Loading must not show an empty state or an upload against unverified data')
  await wait(() => panel()?.textContent.includes('odor-control-plan.pdf')); delay = 8
  failure = 'control-documents'; invalidateCache('/farms/1/control-documents'); await wait(() => panel().querySelector('[role="alert"]'))
  assert(button('Retry') && panel().textContent.includes('Unable to load documents.') && !panel().querySelector('.cd-empty,table,.cd-upload'), 'The schema-unavailable response is a concise error, never an empty list')
  const beforeRetry = requests.length
  failure = ''; click('Retry'); await wait(() => panel()?.textContent.includes('odor-control-plan.pdf'))
  assert(requests.slice(beforeRetry).some(request => request.url === '/farms/1/control-documents'), 'Retry must actually fetch the selected farm documents')
  passed.push('loading and schema-unavailable responses remain distinct from empty documents and Retry recovers through the API')
  const originalLegacy = JSON.stringify(legacy)
  await render({ page: 'services' }); assert(text().includes('Farm Biosecurity') && text().includes('Scheduled'), 'Valid Vet service requests remain active')
  assert(!text().includes('Legacy Odor/Fly Records'), 'Retired history is unavailable to Farmers')
  await render({ role: 'admin', page: 'services' })
  assert(text().includes('No service requests are available') && !text().includes('Fly Control') && !text().includes('Odor Control'), 'Staff bookmark must not expose retired records or Vet access')
  assert(JSON.stringify(legacy) === originalLegacy, 'Legacy records, statuses and attachments must not change')
  passed.push('retired requests are absent from active role pages while original fixture statuses and attachment metadata remain unchanged')
  await render({ role: 'farm_owner' })
  for (const [name, category] of [['certificate.pdf', 'odor_control'], ['permit.pdf', 'fly_control'], ['contract.pdf', 'odor_control']]) {
    await uploadForm(category)
    assert([...document.querySelector('#control-document-category').options].map(option => option.value).join('|') === 'odor_control|fly_control', 'Document categories are preserved independently of retired service-request types')
    chooseFile(name); await sleep(15); click('Submit Document')
    await wait(() => panel()?.textContent.includes(name))
    const saved = documents.find(row => row.original_name === name)
    assert(saved?.category === category && saved.farm_id === 1, 'Supporting document keeps its selected farm and valid category')
    const before = requests.length
    document.querySelector(`[aria-label="View ${name}"]`).click()
    await wait(() => requests.slice(before).some(request => request.url.endsWith('/file')))
    await wait(() => !document.querySelector(`[aria-label="Download ${name}"]`).disabled)
    document.querySelector(`[aria-label="Download ${name}"]`).click()
    await wait(() => requests.slice(before).some(request => request.url.endsWith('/file') && request.params.download === 1))
    await wait(() => !document.querySelector(`[aria-label="Download ${name}"]`).disabled)
  }
  assert(documents.some(row => row.original_name === 'certificate.pdf') && documents.some(row => row.original_name === 'permit.pdf') && documents.some(row => row.original_name === 'contract.pdf'), 'Certificates, permits and contracts remain stored, including superseded submissions')
  passed.push('certificates, permits and contracts upload, view and download within both preserved document categories')
  assert(unexpected.length === 0 && runtimeErrors.length === 0, 'No unexpected requests or runtime errors: ' + unexpected.join(',') + runtimeErrors.join(','))
  passed.push('all API verbs intercepted and no frontend runtime errors')
  window.phase6Results = { passed }
} catch (error) { window.phase6Results = { passed, error: error.stack, unexpected, runtimeErrors } }
window.phase7Harness = { render, click, button, wait, text, requests, unexpected, runtimeErrors, legacy, sleep, input, selectFarm, setMaintenanceDelay: value => { maintenanceDelay = value }, setDashboardFixture: (data, inspections = []) => { dashboardFixture = data; dashboardInspections = inspections }, getRole: () => actorRole }
