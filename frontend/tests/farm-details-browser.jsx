import { StrictMode } from 'react'
import '../src/index.css'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import StaffFarmDetails from '../src/pages/admin/FarmDetails'
import SuperFarmDetails from '../src/pages/superadmin/FarmDetails'
import api from '../src/api/axios'
import { setAuth } from '../src/utils/auth'
import { clearAllCache, invalidateCache } from '../src/hooks/useCachedFetch'

// All records, identities and measurements here are synthetic. Every API verb
// is intercepted; this fixture cannot read or modify operational records.
const requests = []
const unexpected = []
const runtimeErrors = []
window.addEventListener('error', event => runtimeErrors.push(event.message))
window.addEventListener('unhandledrejection', event => runtimeErrors.push(String(event.reason)))
const now = '2026-10-31T02:45:00Z'
const date = index => `2026-10-${String(index + 1).padStart(2, '0')}`
const clone = value => structuredClone(value)
function makeFarm(id = 1) {
  return { id, farm_name: id === 1 ? 'Calansayan Poultry Farm' : 'Second Owner Farm', owner_name: 'Mara Reyes',
    barangay: 'Calansayan', address: 'Lot 12, Calansayan, San Jose, Batangas', lot_number: 'Lot 12', street: '', landmark: '',
    farm_size: 'Medium', num_birds: 18000, created_at: '2026-06-12T02:00:00Z', status: 'Active', latitude: 13.855, longitude: 121.093,
    user: { id: 801, first_name: 'Mara', last_name: 'Reyes', mobile_number: '09000000004', email: 'owner@example.test', address: 'San Jose, Batangas', status: 'active' },
    mobile_number: '09000000004', display_status: 'Critical', connectivity: 'Online', alerting_metrics: ['ammonia', 'moisture'],
    device_list: [{ id: 7, device_name: 'AGB-D01', status: 'Active', connectivity: 'Online', last_seen_at: now, installed_at: 'Oct 20, 2026',
      has_reading: true, last_reading_at: now, last_recorded_condition: 'Warning', ammonia: 18.25, ammonia_status: 'Warning',
      moisture: 67, moisture_status: 'Critical', temperature: 28.5, temperature_status: 'Critical', humidity: 65, humidity_status: 'Critical' }],
    sensors: [{ id: 7, device_name: 'AGB-D01', label: 'AGB-D01', sensor_code: 'AGB-D01', status: 'Active', device_key: 'FIXTURE-DEVICE-CREDENTIAL', farm_id: id, installed_at: 'Oct 20, 2026' }],
    sensor_readings: [{ ammonia: 9876, moisture: 99, created_at: '2026-01-01T00:00:00Z' }],
    maintenance_status: { status: 'Compliant', registration_date: 'Jun 12, 2026', last_full_cleanout_date: 'Oct 10, 2026', last_performed_at: 'Oct 10, 2026', due_date: 'Oct 10, 2027', interval_months: 12, days_since: 21, days_remaining: 344, days_overdue: 0 },
    device_deployments: [{ assignment_key: '7:old', sensor_id: 7, device_name: 'AGB-D01', is_current: false, assigned_at: '2026-10-01T00:00:00Z', unassigned_at: '2026-10-10T00:00:00Z', reading_count: 1000, days_covered: 9 },
      { assignment_key: '7:new', sensor_id: 7, device_name: 'AGB-D01', is_current: true, assigned_at: '2026-10-20T00:00:00Z', unassigned_at: null, reading_count: 1200, days_covered: 11 }],
  }
}
let fixture = { farm: makeFarm(), fail: '' }
const inspections = Array.from({ length: 23 }, (_, i) => ({ id: i + 1, inspection_type: i === 22 ? 'Follow-up' : 'General Inspection', status: 'Completed',
  scheduled_by_name: 'Fixture Staff', completed_at: `Oct ${i + 1}, 2026`, completed_at_raw: `${date(i)}T01:00:00Z`, scheduled_at: `Oct ${i + 1}, 2026`, scheduled_at_raw: `${date(i)}T01:00:00Z` }))
const disposals = Array.from({ length: 23 }, (_, i) => ({ id: i + 1, disposal_method: i === 22 ? 'Sold' : 'Composted', buyer_name: i === 22 ? 'Fixture Buyer' : null,
  disposal_date: `Oct ${i + 1}, 2026`, disposal_date_raw: date(i), quantity: 100 + i, notes: 'Fixture disposal record' }))
const cleanouts = Array.from({ length: 23 }, (_, i) => ({ id: i + 1, performed_at: `Oct ${i + 1}, 2026`, notes: `Clean-out fixture ${i + 1}`, photo_url: null }))
const services = [{ id: 1, request_type: 'Odor Control Request', status: 'Scheduled' }, { id: 2, request_type: 'Fly Control Request', status: 'Completed' },
  { id: 3, request_type: 'Vaccine Request', status: 'Completed' }, { id: 4, request_type: 'Farm Biosecurity Request', status: 'Completed' },
  { id: 5, request_type: 'Blood Test Request', status: 'Completed' }].map(item => ({ ...item, request_date: 'Oct 21, 2026', request_date_raw: '2026-10-21T01:00:00Z', accepted_by: 'Fixture Staff', completed_at: item.status === 'Completed' ? 'Oct 22, 2026' : null }))
function page(rows, params, key = 'items', extra = {}) {
  const size = Number(params.per_page || 10), total = rows.length
  const last = Math.max(1, Math.ceil(total / size)), current = Math.min(Number(params.page || 1), last)
  return { [key]: rows.slice((current - 1) * size, current * size), total, page: current, current_page: current,
    last_page: last, per_page: size, query_key: params.query_key, ...extra }
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
function fail(message = 'Isolated fixture request failed.') { const error = new Error(message); error.response = { status: 500, data: { message } }; throw error }
api.get = async (url, options = {}) => {
  const params = clone(options.params || {})
  requests.push({ method: 'GET', url, params })
  const captured = clone(fixture)
  await sleep(8)
  if (captured.fail && url.includes(captured.fail)) fail()
  if (url === '/notifications') return { data: { data: [], total_count: 0, unread_count: 0 } }
  if (/^\/farms\/\d+\/house-monitoring$/.test(url)) return { data: { data: { farm_id: Number(url.split('/')[2]), rows: [], farm_assessment: { condition: 'No Readings Yet' }, coverage: { known: false, legacy_devices: 0 }, connectivity: { online: 0, assigned_active_house_devices: 0, offline: 0, awaiting_first_reading: 0 }, message: 'House inventory has not been verified.' } } }
  if (url === '/admin/farms-map') return { data: { data: [] } }
  if (url === '/admin/farms') return { data: { data: [captured.farm] } }
  if (/^\/farms\/\d+\/poultry-houses$/.test(url)) return { data: { data: { farm_id: Number(url.split('/')[2]), available: true,
    inventory_status: 'unverified', can_manage: false, houses: [], message: 'House inventory has not been verified. Existing farm monitoring remains available.' } } }
  if (/^\/farms\/\d+\/control-documents$/.test(url)) return { data: { data: { farm_id: Number(url.split('/')[2]), latest: { odor_control: null, fly_control: null }, items: [], total: 0, current_page: 1, last_page: 1, per_page: 10, page: 1, max_file_kb: 5120, query_key: params.query_key } } }
  if (/^\/admin\/farms\/\d+$/.test(url)) return { data: { data: { ...captured.farm, ...((url.endsWith('/2')) ? { id: 2, farm_name: 'Second Owner Farm' } : {}) } } }
  if (url.endsWith('/readings-summary')) return { data: { data: { deployments: captured.farm.device_deployments.map(period => ({ ...period, total_readings: period.reading_count, data_coverage_percent: 88,
    rows: Array.from({ length: 12 }, (_, i) => ({ date: date(i), reading_count: 100, ammonia_avg: 12.3, ammonia_peak: 18.25, moisture_avg: 61, moisture_peak: 67, status: 'Warning' })) })) } } }
  if (url === '/admin/sensors' || url.endsWith('/sensors')) return { data: { data: captured.farm.sensors } }
  if (url.endsWith('/inspection-records')) {
    let rows = clone(inspections)
    if (params.inspection_type) rows = rows.filter(row => row.inspection_type === params.inspection_type)
    if (params.from) rows = rows.filter(row => row.completed_at_raw.slice(0, 10) >= params.from)
    if (params.to) rows = rows.filter(row => row.completed_at_raw.slice(0, 10) <= params.to)
    rows.sort((a, b) => params.dir === 'asc' ? a.id - b.id : b.id - a.id)
    return { data: { data: page(rows, params, 'inspections') } }
  }
  if (url.endsWith('/disposal-records')) {
    let rows = clone(disposals)
    if (params.disposal_method) rows = rows.filter(row => row.disposal_method === params.disposal_method)
    if (params.from) rows = rows.filter(row => row.disposal_date_raw >= params.from)
    if (params.to) rows = rows.filter(row => row.disposal_date_raw <= params.to)
    rows.sort((a, b) => params.dir === 'asc' ? a.id - b.id : b.id - a.id)
    return { data: { data: page(rows, params, 'records', { disposal_methods: ['Sold', 'Composted'] }) } }
  }
  if (url.endsWith('/maintenance-logs')) return { data: { data: page(clone(cleanouts).sort((a, b) => params.dir === 'asc' ? a.id - b.id : b.id - a.id), params, 'logs') } }
  if (url.endsWith('/service-requests')) {
    let rows = clone(services).filter(row => window.fixtureRole === 'super_admin' || row.request_type !== 'Vaccine Request')
    if (params.service_type) rows = rows.filter(row => row.request_type === params.service_type)
    return { data: { data: page(rows, params, 'requests') } }
  }
  if (url === '/admin/alert-history') return { data: { data: page(Array.from({ length: 12 }, (_, i) => ({ id: i + 1, triggered_at: 'Oct 21, 2026 9:00 AM', sensor_type: 'Ammonia', value: 18.25, status: 'Warning', device_name: 'AGB-D01', duration: '1h', is_ongoing: false })), params) } }
  unexpected.push(url); fail('Unexpected fixture GET: ' + url)
}
api.post = async (url, body) => {
  requests.push({ method: 'POST', url, body: body instanceof FormData ? Object.fromEntries(body) : clone(body) })
  if (url === '/admin/farms/check-location') return { data: { data: { status: 'verified', ok: true } } }
  if (url.endsWith('/email/otp/request')) return { data: { success: true, message: 'Fixture verification requested.' } }
  if (url.endsWith('/resend-sms')) return { data: { success: true, message: 'Fixture password delivery completed.' } }
  if (/^\/admin\/farms\/\d+$/.test(url) && body instanceof FormData) {
    fixture.farm.farm_name = body.get('farm_name'); fixture.farm.user.first_name = body.get('first_name'); fixture.farm.user.last_name = body.get('last_name')
    return { data: { success: true, message: 'Fixture farm update confirmed.' } }
  }
  unexpected.push(url); fail('Unexpected fixture POST: ' + url)
}
for (const verb of ['put', 'patch', 'delete']) api[verb] = async url => { unexpected.push(url); fail('Unexpected fixture mutation: ' + url) }

const root = createRoot(document.querySelector('#root'))
let mount = 0
const assert = (value, message) => { if (!value) throw Error(message) }
const waitFor = async predicate => { for (let i = 0; i < 250; i++) { if (predicate()) return; await sleep(20) } throw Error('Timed out: ' + document.querySelector('.fd-page')?.textContent.slice(0, 700)) }
const button = text => [...document.querySelectorAll('.fd-page button, .fd-page [role="button"]')].find(element => element.textContent.trim() === text)
const click = text => { const target = button(text); assert(target, 'Missing control: ' + text); target.click() }
const tab = label => { const target = [...document.querySelectorAll('.fd-main-tabs button')].find(element => element.textContent === label); assert(target, 'Missing tab ' + label); target.click() }
const recordTab = label => { const target = [...document.querySelectorAll('.fd-subtabs button')].find(element => element.textContent === label); assert(target, 'Missing record tab ' + label); target.click() }
const pageText = () => document.querySelector('.fd-page')?.textContent || ''
function setInput(element, value) {
  assert(element, 'Missing input')
  const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }))
}
function editField(label) { return [...document.querySelectorAll('.fd-edit-dialog label')].find(element => element.textContent === label)?.parentElement.querySelector('input,select') }
async function render({ role = 'admin', variant = 'online', farmId = 1, fail: failure = '' } = {}) {
  root.render(null); await sleep(25); clearAllCache()
  fixture = { farm: makeFarm(farmId), fail: failure }
  if (variant === 'offline') { fixture.farm.display_status = 'Safe'; fixture.farm.device_list[0].connectivity = 'Offline' }
  if (variant === 'new-assignment') { fixture.farm.display_status = 'Safe'; fixture.farm.device_list[0].has_reading = false; fixture.farm.device_list[0].ammonia = 8765; fixture.farm.device_list[0].moisture = 99 }
  if (variant === 'unassigned') { fixture.farm.display_status = 'Safe'; fixture.farm.device_list = []; fixture.farm.sensors = [] }
  if (variant.startsWith('supporting-')) Object.assign(fixture.farm.device_list[0], { ammonia: 5, moisture: 12, ammonia_status: 'Safe', moisture_status: 'Safe', temperature_status: variant.split('-')[1], humidity_status: variant.split('-')[1] })
  if (variant === 'partial') {
    Object.assign(fixture.farm.device_list[0], { ammonia: 5, ammonia_status: 'Safe', moisture: 12, moisture_status: 'Safe' })
    fixture.farm.device_list.push({ ...fixture.farm.device_list[0], id: 8, device_name: 'AGB-D02', connectivity: 'Offline', ammonia: 45, ammonia_status: 'Critical', last_recorded_condition: 'Critical' })
  }
  if (variant.startsWith('missing-')) {
    const [, metric, status] = variant.split('-')
    Object.assign(fixture.farm.device_list[0], { ammonia: 5, ammonia_status: status, moisture: 12, moisture_status: status })
    if (metric === 'both') Object.assign(fixture.farm.device_list[0], { ammonia: null, moisture: null })
    else fixture.farm.device_list[0][metric] = null
  }
  window.fixtureRole = role
  setAuth('isolated-ui-fixture', { id: 91, first_name: 'UI', last_name: 'Fixture', role, must_change_password: false, legal_acknowledged_at: now })
  const path = `/${role === 'super_admin' ? 'superadmin' : 'admin'}/farms/${farmId}`
  root.render(<StrictMode key={++mount}><MemoryRouter initialEntries={[path]}><Routes><Route path="/admin/farms/:farmId" element={<StaffFarmDetails />} /><Route path="/superadmin/farms/:farmId" element={<SuperFarmDetails />} /></Routes></MemoryRouter></StrictMode>)
  await waitFor(() => document.querySelector('.fd-title h1') || pageText().includes('failed'))
  await sleep(25)
}

window.phase5Preview = async options => {
  await render(options)
  if (options.tab) { tab(options.tab); await sleep(250) }
  if (options.record) { recordTab(options.record); await sleep(150) }
  if (options.recordView) { click(options.recordView); await sleep(150) }
  window.scrollTo(0, 0)
  return { width: innerWidth, pageWidth: document.querySelector('.fd-page')?.clientWidth, overflow: document.documentElement.scrollWidth > innerWidth + 1 }
}

const passed = []
try {
  await render()
  assert([...document.querySelectorAll('.fd-main-tabs button')].map(element => element.textContent).join('|') === 'Overview|Monitoring|Compliance|Records', 'Exactly four shared tabs are required')
  assert(pageText().includes('Calansayan Poultry Farm') && pageText().includes('Mara Reyes') && pageText().includes('270 days') === false, 'Overview must show actual farm/owner information')
  assert(!pageText().includes('Riverside Hog Farm') && !pageText().includes('FARM-00123'), 'Mockup sample data must not become product data')
  passed.push('four tabs and actual farm/owner fields, without mockup values')

  const beforeMonitor = requests.length
  tab('Monitoring')
  await waitFor(() => document.querySelectorAll('.fd-reading').length === 4)
  assert(document.querySelectorAll('.fd-reading--primary').length === 2 && document.querySelectorAll('.fd-reading--supporting').length === 2, 'Two primary and two secondary cards required')
  assert(document.querySelector('[data-metric="ammonia"]').textContent.includes('18.25') && document.querySelector('[data-metric="moisture"]').textContent.includes('67'), 'Use backend measurements verbatim')
  assert(document.querySelector('[data-metric="ammonia"]').textContent.includes('ppm estimate'), 'Unvalidated ammonia must be qualified')
  assert([...document.querySelectorAll('.fd-reading--supporting')].every(card => card.textContent.includes('Supporting reading') && !card.querySelector('.fd-badge, .fd-reading-foot')), 'Supporting cards retain measurements without classifications or condition labels')
  assert(document.querySelector('[data-metric="temperature"] strong').textContent === '28.5' && document.querySelector('[data-metric="humidity"] strong').textContent === '65', 'Supporting values remain verbatim')
  assert([...document.querySelectorAll('.fd-reading--primary .fd-badge')].map(badge => badge.textContent).join('|') === 'Warning|Critical', 'Primary classifications remain visible')
  assert(getComputedStyle(document.querySelector('.fd-reading--primary strong')).fontSize === getComputedStyle(document.querySelector('.fd-reading--supporting strong')).fontSize, 'All four readings have equal visual emphasis')
  assert(pageText().includes('Sensor Readings (Current)') && [...document.querySelectorAll('.fd-reading time')].length === 4 && [...document.querySelectorAll('.fd-reading time')].every(time => time.dateTime === now), 'Every current card has its actual reading timestamp')
  assert(!pageText().includes('FIXTURE-DEVICE-CREDENTIAL') && !document.querySelector('canvas'), 'No visible credentials or unnecessary charts')
  assert(!requests.slice(beforeMonitor).some(request => request.url.endsWith('/root-cause')) && !pageText().includes('Condition Assessment and Recommendations'), 'Staff Monitoring omits the assessment card and its request')
  assert(!requests.slice(beforeMonitor).some(request => request.url.endsWith('/readings-summary') || request.url.endsWith('/sensors')), 'History and device management fetch lazily')
  passed.push('four sensor cards retain primary/supporting context and actual timestamps without Staff recommendations')

  tab('Compliance')
  await waitFor(() => pageText().includes('every 12 months') && pageText().includes('No documents uploaded yet.'))
  assert(pageText().includes('Oct 10, 2027') && document.querySelector('.annual-compliance h2')?.textContent === 'Annual Clean-out Compliance', 'Use one annual compliance card with authoritative dates and an honest document state')
  assert(![...document.querySelectorAll('.fd-page button')].some(element => element.disabled), 'No disabled future-feature controls')
  assert(!button('View Service Request History →'), 'Staff Compliance must not link to retired service requests')
  passed.push('Staff Compliance retains annual clean-out and Control Documents without a service workflow link')

  tab('Records'); await waitFor(() => button('Inspections'))
  recordTab('Inspections')
  await waitFor(() => pageText().includes('Showing 1–10 of 23'))
  assert(document.querySelector('.fd-record-controls input[type="date"]') && document.querySelector('.fd-record-description')?.textContent.includes('inspection'), 'Existing filters share the record heading without losing their controls')
  const selectedRecordTab = document.querySelector('.fd-subtab[aria-selected="true"]')
  selectedRecordTab.focus()
  assert(document.activeElement === selectedRecordTab && getComputedStyle(selectedRecordTab).backgroundColor === 'rgb(35, 74, 53)' && getComputedStyle(selectedRecordTab).color === 'rgb(255, 255, 255)' && getComputedStyle(selectedRecordTab).fontWeight === '600', 'The selected segmented tab uses the shared dark green and remains keyboard-focusable')
  document.querySelector('[aria-label="Next"]').click()
  await waitFor(() => pageText().includes('Showing 11–20 of 23'))
  const dates = document.querySelectorAll('.fd-page input[type="date"]')
  setInput(dates[0], '2026-10-23'); setInput(dates[1], '2026-10-23')
  setInput([...document.querySelectorAll('.fd-page select')].find(select => [...select.options].some(option => option.value === 'Follow-up')), 'Follow-up')
  click('Apply')
  await waitFor(() => pageText().includes('Showing 1–1 of 1'))
  assert(pageText().includes('Follow-up'), 'Filter must find the matching record across all pages')
  setInput(document.querySelector('.fd-page input[type="date"]'), '2026-11-01'); click('Apply')
  await waitFor(() => pageText().includes('No inspections recorded'))
  assert(button('Reset'), 'Empty filtered views must retain their Reset control')
  click('Reset'); await waitFor(() => pageText().includes('Showing 1–10 of 23'))
  passed.push('Phase 4 pagination, combined filters, page reset and empty-result recovery remain functional')

  recordTab('Manure Records')
  await waitFor(() => pageText().includes('Clean-out fixture'))
  const manureCard = button('Clean-out Logs').closest('.fd-record-card')
  assert(manureCard?.firstElementChild.classList.contains('fd-record-navigation') && manureCard.contains(document.querySelector('.fd-record-heading')), 'Manure navigation belongs inside the history card above its heading')
  assert(!pageText().includes('Required Interval') && !pageText().includes('Next Full Clean-out Due'), 'Records prioritizes history without repeating the Compliance summary')
  const cleanoutTab = button('Clean-out Logs')
  cleanoutTab.focus()
  assert(document.activeElement === cleanoutTab && cleanoutTab.getAttribute('aria-pressed') === 'true' && getComputedStyle(cleanoutTab).borderBottomWidth === '2px' && getComputedStyle(cleanoutTab).backgroundColor === 'rgba(0, 0, 0, 0)', 'Selected manure navigation is focusable and underlined without a solid background')
  document.querySelector('.fd-record-card th').click()
  await waitFor(() => document.querySelector('.fd-record-card tbody td')?.textContent === 'Oct 1, 2026')
  document.querySelector('[aria-label="Next"]').click()
  await waitFor(() => pageText().includes('Showing 11–20 of 23'))
  click('View'); await waitFor(() => pageText().includes('Clean-out Record'))
  click('Close')
  button('Disposal Records').focus()
  click('Disposal Records'); await waitFor(() => pageText().includes('Manure Disposal History') && pageText().includes('Fixture Buyer'))
  assert(document.activeElement === button('Disposal Records'), 'Keyboard focus stays on the selected manure tab after switching')
  assert(button('Disposal Records').closest('.fd-record-card') && button('Disposal Records').getAttribute('aria-pressed') === 'true' && button('Clean-out Logs').getAttribute('aria-pressed') === 'false', 'Disposal navigation stays inside its card with the correct active state')
  const disposalDates = document.querySelectorAll('.fd-record-controls input[type="date"]')
  setInput(disposalDates[0], '2026-10-23'); setInput(disposalDates[1], '2026-10-23')
  setInput(document.querySelector('.fd-record-controls select'), 'Sold'); click('Apply')
  await waitFor(() => pageText().includes('Showing 1–1 of 1'))
  assert(pageText().includes('Fixture Buyer'), 'Existing disposal date and method filters retain matching records')
  click('Reset'); await waitFor(() => pageText().includes('Showing 1–10 of 23'))
  document.querySelector('[aria-label="Next"]').click()
  await waitFor(() => pageText().includes('Showing 11–20 of 23'))
  click('View'); await waitFor(() => pageText().includes('Disposal Record'))
  click('Close')
  click('Clean-out Logs'); await waitFor(() => pageText().includes('Clean-out History') && pageText().includes('Showing 1–10 of 23'))
  passed.push('integrated manure navigation preserves clean-out sorting, disposal filters, pagination, and record detail actions')

  recordTab('Alerts'); await waitFor(() => pageText().includes('Showing 1–5 of 12'))
  document.querySelector('[aria-label="Next"]').click(); await waitFor(() => pageText().includes('Showing 6–10 of 12'))
  assert(pageText().includes('ppm estimate'), 'Historical ammonia values must remain qualified')
  passed.push('alert history uses the existing server pager and retains recorded readings')

  tab('Monitoring'); await waitFor(() => button('View History'))
  click('View History'); await waitFor(() => pageText().includes('Previously installed') && pageText().includes('Readings Summary') && button('View'))
  click('View'); await waitFor(() => pageText().includes('Ammonia Avg'))
  assert(pageText().includes('12.3 ppm estimate'), 'Daily history must preserve values and qualify ppm')
  passed.push('assignment visits and daily monitoring history remain accessible')

  click('Manage Devices'); await waitFor(() => button('Unassign'))
  assert(button('+ Register Device') && button('Edit'), 'Existing authorized device actions must remain')
  assert(!pageText().includes('FIXTURE-DEVICE-CREDENTIAL') && document.querySelector('[aria-label="Show Device Key"]'), 'Keys remain masked in management')
  const beforeUnassign = requests.length
  click('Unassign'); await waitFor(() => document.querySelector('#fd-unassign-question'))
  const unassignDialog = document.querySelector('[aria-labelledby="fd-unassign-title"]')
  assert(unassignDialog.querySelector('h3').textContent === 'Unassign Device?', 'Farm Details uses the exact confirmation title')
  assert(document.querySelector('#fd-unassign-question').textContent.trim() === 'Unassign AGB-D01 from Calansayan Poultry Farm?', 'Farm Details uses the selected device and actual farm name')
  assert(document.querySelector('#fd-unassign-support').textContent.trim() === 'Previous readings will remain with this farm.', 'Farm Details removes the old long technical paragraph')
  assert(!/Are you sure|repair|maintenance|reassignment|Device Key|firmware|reflash|Pending Setup|will remain registered/i.test(unassignDialog.textContent), 'No old unassignment explanation remains in the rendered modal')
  click('Cancel'); await waitFor(() => !document.querySelector('#fd-unassign-question'))
  assert(!requests.slice(beforeUnassign).some(request => request.url.endsWith('/unassign')), 'Closing the Farm Details confirmation does not unassign')
  click('Change Assignment'); await waitFor(() => document.querySelector('.device-assignment-dialog'))
  assert(document.querySelector('#device-assignment-farm').value === '' && document.querySelector('#device-assignment-house').value === '', 'Farm Details uses explicit empty farm and house selections too')
  await waitFor(() => [...document.querySelector('#device-assignment-farm').options].some(option => option.value === '1'))
  setInput(document.querySelector('#device-assignment-farm'), '1')
  await waitFor(() => document.querySelector('.device-assignment-dialog').textContent.includes('House inventory has not been verified'))
  assert(document.querySelector('.device-assignment-dialog [type="submit"]').disabled, 'Legacy unverified farms cannot be guessed into a house from Farm Details')
  document.querySelector('.device-assignment-dialog [aria-label="Close assignment"]').click()
  await waitFor(() => !document.querySelector('.device-assignment-dialog'))
  assert(!requests.slice(beforeUnassign).some(request => request.url.endsWith('/assign')), 'Closing the assignment picker never changes the device')
  passed.push('device management is lazy, retains authorized actions, and masks credentials')

  click('Edit Farm'); await waitFor(() => document.querySelector('[role="dialog"]'))
  assert(document.activeElement === editField('First Name'), 'Edit dialog must receive keyboard focus')
  setInput(editField('Farm Name'), 'Updated fixture farm')
  click('Save Changes'); await waitFor(() => document.querySelector('.fd-title h1')?.textContent === 'Updated fixture farm')
  const save = requests.filter(request => request.method === 'POST' && request.url === '/admin/farms/1').at(-1)
  assert(save.body._method === 'PUT' && save.body.first_name === 'Mara' && !('role' in save.body), 'Preserve profile save and ownership/role fields')
  passed.push('existing farm/owner editing saves through the original authenticated API contract')

  click('Edit Farm'); await waitFor(() => document.querySelector('[role="dialog"]'))
  setInput(editField('Email Address'), 'new-owner@example.test'); click('Save Changes')
  await waitFor(() => pageText().includes('Verify New Email'))
  assert(requests.some(request => request.url.endsWith('/email/otp/request')), 'Email changes must keep the verification gate')
  click('Cancel')
  passed.push('owner email changes retain the existing OTP verification workflow')

  const beforeOffline = requests.length
  await render({ variant: 'offline' }); tab('Monitoring')
  await waitFor(() => pageText().includes('not live measurements'))
  assert(document.querySelector('.fd-condition .fd-badge').textContent === 'Offline', 'Offline cannot inherit a current Safe condition')
  assert([...document.querySelectorAll('.fd-reading--primary')].every(card => card.textContent.includes('Last recorded condition:') && card.querySelector('.fd-badge')), 'Primary classifications must be identified as historical')
  assert([...document.querySelectorAll('.fd-reading--supporting')].every(card => card.textContent.includes('Last recorded') && !card.querySelector('.fd-badge, .fd-reading-foot')), 'Offline supporting cards retain timestamps without historical condition badges')
  assert(pageText().includes('Sensor Readings (Last Recorded)') && !pageText().includes('Condition Assessment and Recommendations') && !requests.slice(beforeOffline).some(request => request.url.endsWith('/root-cause')), 'Offline readings cannot request or show recommendations')
  passed.push('offline connectivity is distinct from last recorded environmental conditions')

  await render({ variant: 'new-assignment' }); tab('Monitoring')
  await waitFor(() => pageText().includes('No Readings Yet'))
  assert(!pageText().includes('8765') && !pageText().includes('9876') && document.querySelector('[data-metric="ammonia"] strong').textContent === '—', 'No previous visit or compatibility readings may populate current cards')
  assert(!document.querySelector('.fd-reading time') && !document.querySelector('.fd-reading .fd-badge'), 'No values, timestamps or classifications are invented for a new assignment')
  passed.push('new A-to-B-to-A assignments cannot inherit compatibility or previous-visit values')

  await render({ variant: 'unassigned' }); tab('Monitoring')
  await waitFor(() => pageText().includes('Pending Setup'))
  assert(!document.querySelector('.fd-condition').textContent.includes('Safe'), 'An unassigned farm cannot appear Safe')
  passed.push('Pending Setup has honest empty readings and no manufactured Safe state')

  await render({ variant: 'partial' }); tab('Monitoring')
  await waitFor(() => pageText().includes('1 of 2 assigned devices reporting'))
  setInput(document.querySelector('[aria-label="Assigned device"]'), '8')
  await waitFor(() => pageText().includes('Sensor Readings (Last Recorded)'))
  assert(document.querySelector('.fd-condition').textContent.includes('Incomplete Data') && pageText().includes('Last recorded condition: Critical'), 'Safe plus offline coverage is incomplete; preserve individual device history')
  assert(!pageText().includes('Condition Assessment and Recommendations'), 'Historical readings do not show a recommendation card')
  passed.push('multi-device selection preserves partial-coverage context and backend farm classification')

  for (const [metric, status, expected] of [['ammonia','Safe','Incomplete Data'],['moisture','Safe','Incomplete Data'],['ammonia','Warning','Warning'],['moisture','Critical','Critical'],['both','Critical','No Readings Yet']]) {
    const beforeIncomplete = requests.length
    await render({ variant: `missing-${metric}-${status}` }); tab('Monitoring'); await sleep(40)
    assert(document.querySelector('.fd-condition').textContent.includes(expected), `Missing ${metric}: ${expected} condition`)
    assert(pageText().includes('Incomplete Data') || pageText().includes('unavailable'), 'Missing primary coverage needs an explanation')
    assert(!requests.slice(beforeIncomplete).some(request => request.url.endsWith('/root-cause')) && !pageText().includes('Condition Assessment and Recommendations'), 'Incomplete primary data does not show a recommendation card')
  }
  await render({ variant: 'supporting-Critical' }); tab('Monitoring'); await sleep(40)
  assert(document.querySelector('.fd-condition .fd-badge').textContent === 'Safe' && !document.querySelector('.fd-reading--supporting .fd-badge'), 'Supporting classifications cannot replace the primary farm condition or appear as condition badges')

  await render({ farmId: 2 })
  assert(document.querySelector('.fd-title h1').textContent === 'Second Owner Farm' && pageText().includes('Mara Reyes'), 'A shared owner must not force the first farm into view')
  passed.push('multi-farm ownership uses the selected farm ID and the correct owner')

  const beforeServiceHistory = requests.length
  await render({ role: 'super_admin' }); tab('Records'); await waitFor(() => button('Service History')); recordTab('Service History')
  await waitFor(() => document.querySelector('.fd-page tbody')?.textContent.includes('Vaccination'))
  assert([...document.querySelectorAll('.fd-page option')].some(option => option.value === 'Vaccine Request'), 'Super Admin must retain legacy Vet history options')
  assert(pageText().includes('Legacy — Odor Control') && pageText().includes('Legacy — Fly Control') && pageText().includes('Farm Biosecurity') && pageText().includes('Blood Test'), 'Super Admin retains both retired history and completed Vet records')
  assert(pageText().includes('Read-only history') && pageText().includes('do not represent active appointments') && pageText().includes('Original Status'), 'Historical scope and stored status are explicit')
  const serviceTypeSelect = [...document.querySelectorAll('.fd-page select')].find(select => [...select.options].some(option => option.value === 'Odor Control Request'))
  assert([...serviceTypeSelect.options].find(option => option.value === 'Odor Control Request').textContent === 'Legacy — Odor Control', 'Retired filter values are labeled as legacy')
  setInput(serviceTypeSelect, 'Odor Control Request'); await sleep(20); click('Apply')
  await waitFor(() => document.querySelectorAll('.fd-page tbody tr').length === 1)
  const legacyRow = document.querySelector('.fd-page tbody tr')
  assert(legacyRow.textContent.includes('Scheduled') && legacyRow.textContent.includes('Oct 21, 2026') && legacyRow.textContent.includes('Fixture Staff') && !legacyRow.textContent.includes('Overdue'), 'Retired original status, date and personnel are preserved')
  assert([...legacyRow.querySelectorAll('button')].map(element => element.textContent).join('|') === 'View', 'Historical requests have only a read action')
  legacyRow.querySelector('button').click(); await waitFor(() => pageText().includes('Legacy Service Request'))
  assert(pageText().includes('Original Status') && !button('Accept') && !button('Reschedule') && !button('Complete'), 'Legacy detail is read-only')
  click('Close')
  tab('Compliance'); await waitFor(() => pageText().includes('Annual Clean-out Compliance'))
  assert(!button('View Service Request History →'), 'Documentary compliance must not link to retired service workflows; Super Admin history remains in Records')
  click('View Clean-out History →'); await waitFor(() => document.querySelector('.fd-subtabs [aria-selected="true"]')?.textContent === 'Manure Records')
  assert(requests.slice(beforeServiceHistory).filter(request => request.url.endsWith('/service-requests')).every(request => request.method === 'GET'), 'History must not submit service mutations')
  const beforeStaffRecords = requests.length
  await render(); tab('Records'); await waitFor(() => button('Inspections'))
  assert([...document.querySelectorAll('.fd-subtabs button')].map(element => element.textContent).join('|') === 'Inspections|Manure Records|Alerts', 'Staff Records omit the Service Requests subtab')
  assert(!requests.slice(beforeStaffRecords).some(request => request.url.endsWith('/service-requests')), 'Staff Farm Details must not fetch a retired service queue')
  passed.push('Staff omit service entry points while Super Admin retains filtered read-only legacy and Vet history')

  for (const role of ['admin', 'super_admin']) for (const variant of ['online', 'offline', 'new-assignment', 'missing-ammonia-Safe', 'unassigned', 'supporting-Safe', 'supporting-Warning', 'supporting-Critical']) {
    await render({ role, variant }); tab('Monitoring')
    await waitFor(() => document.querySelector('.fd-sensor-grid'))
    assert(!pageText().includes('Condition Assessment and Recommendations') && !pageText().includes('Current recommendations') && !document.querySelector('.fd-assessment'), `${role}/${variant}: no assessment card or unavailable state`)
    assert(pageText().includes('Device Information') && pageText().includes('Current Farm Condition') && pageText().includes('Sensor Readings') && button('View History'), `${role}/${variant}: retained monitoring sections and actions`)
    assert(document.querySelector('.fd-monitoring').nextElementSibling.classList.contains('fd-history-heading'), 'Monitoring History follows the sensor section without a placeholder')
    assert([...document.querySelectorAll('.fd-reading--supporting')].every(card => !card.querySelector('.fd-badge, .fd-reading-foot') && !/Last condition|Last recorded condition|Safe|Warning|Critical|Not assessed/.test(card.textContent)), `${role}/${variant}: supporting cards have no condition labels`)
    const cards = [...document.querySelectorAll('.fd-reading')]
    assert(cards.every(card => Math.abs(card.getBoundingClientRect().height - cards[0].getBoundingClientRect().height) < 1 && getComputedStyle(card).backgroundColor === 'rgb(255, 255, 255)' && getComputedStyle(card).borderTopColor === getComputedStyle(card).borderBottomColor), `${role}/${variant}: equal white cards without a colored top border`)
    if (variant.startsWith('supporting-')) assert(document.querySelector('.fd-condition .fd-badge').textContent === 'Safe' && document.querySelectorAll('.fd-reading--primary .fd-badge').length === 2, `${role}/${variant}: supporting classifications do not change the primary assessment`)
  }
  await render(); tab('Monitoring'); await waitFor(() => document.querySelector('.fd-sensor-grid'))
  fixture.farm.device_list[0].has_reading = false
  fixture.farm.device_list[0].last_reading_at = null
  invalidateCache('/admin/farms')
  await waitFor(() => pageText().includes('No Readings Yet')); await sleep(220)
  assert(document.querySelector('[data-metric="ammonia"] strong').textContent === '—' && !requests.some(request => request.url.endsWith('/root-cause')), 'Assignment refresh hides previous values without any assessment requests')
  passed.push('Staff and Super Admin retain monitoring and history in every state while omitting the entire assessment section')

  await render({ fail: 'inspection-records' }); tab('Records')
  await waitFor(() => document.querySelector('.fd-page [role="alert"]'))
  assert(pageText().includes('Isolated fixture request failed.') && button('Reset'), 'Record errors must remain visible with recoverable controls')
  assert(unexpected.length === 0, 'All API calls must be explicitly intercepted: ' + unexpected.join(','))
  assert(runtimeErrors.length === 0, 'No frontend runtime errors: ' + runtimeErrors.join(','))
  passed.push('record errors have explicit states and no unexpected API calls or runtime errors')
  window.phase5Results = { passed }
} catch (error) {
  window.phase5Results = { passed, error: error.stack, unexpected, runtimeErrors }
}
