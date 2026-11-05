import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '../src/index.css'
import SuperAdminDashboard from '../src/pages/superadmin/Dashboard'
import StaffDashboard from '../src/pages/admin/Dashboard'
import { clearAllCache, invalidateCache } from '../src/hooks/useCachedFetch'
import { setAuth } from '../src/utils/auth'
import api from '../src/api/axios'

// Generated records and an intercepting adapter for every HTTP verb. No API
// call can reach operational data; backend counting is tested in SQLite memory.
const requests = [], unexpected = [], runtimeErrors = [], passed = []
window.addEventListener('error', event => runtimeErrors.push(event.message))
window.addEventListener('unhandledrejection', event => runtimeErrors.push(String(event.reason)))
const alert = { farm_id: 1, farm_name: 'Synthetic Critical Farm', critical_count: 1, reading_at: new Date().toISOString(),
  all_sensors: [{ type: 'Ammonia', value: 35, unit: 'ppm', critical: true }, { type: 'Moisture', value: 20, unit: '%', critical: false }] }
const baseData = { total_farms: 47, monitored_farms: 2, critical_farms: [alert],
  cleanout_compliance: { compliant: 31, non_compliant: 12, undetermined: 2, total_farms: 45, policy: 'annual_12_calendar_months_v1' } }
const mapFarms = [{ id: 1, farm_name: alert.farm_name, latitude: 13.855, longitude: 121.093, current_status: 'Critical' },
  { id: 2, farm_name: 'Synthetic Safe Farm', latitude: 13.86, longitude: 121.10, current_status: 'Safe' }]
let fixture, mounts = 0
const root = createRoot(document.querySelector('#root'))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const assert = (value, message) => { if (!value) throw Error(message) }
const text = () => document.body.textContent
const cards = () => [...document.querySelectorAll('.superadmin-dashboard-stat')]
const button = label => [...document.querySelectorAll('button')].find(element => element.textContent.trim() === label)
const values = () => [...document.querySelectorAll('.superadmin-dashboard-stat-value,.superadmin-dashboard-stat dd')].map(element => element.textContent)
async function wait(check) {
  for (let index = 0; index < 300; index++) { if (check()) return; await sleep(20) }
  throw Error('Fixture wait timed out')
}
api.defaults.adapter = async config => {
  requests.push({ method: config.method, url: config.url })
  if (config.method !== 'get') { unexpected.push(config.method + ' ' + config.url); throw Error('Unexpected mutation') }
  const captured = structuredClone(fixture)
  let data
  if (config.url === '/notifications') data = { data: [], unread_count: 0, total_count: 0 }
  else if (config.url === '/admin/dashboard') {
    if (captured.delay) await sleep(captured.delay)
    if (captured.error) throw Object.assign(Error('Synthetic dashboard unavailable'), { response: { status: 500, data: { message: 'Synthetic dashboard unavailable' } } })
    data = { data: captured.data }
  } else if (config.url === '/admin/farms-map') data = { data: captured.noMap ? [] : mapFarms }
  else if (config.url === '/admin/inspections') data = { data: [] }
  else { unexpected.push(config.url); throw Error('Unexpected endpoint: ' + config.url) }
  return { config, data, status: 200, statusText: 'OK', headers: {} }
}
async function render({ variant = 'current', role = 'super_admin' } = {}) {
  root.render(null); await sleep(30); clearAllCache()
  fixture = { data: structuredClone(baseData), error: variant === 'error', delay: variant === 'loading' ? 350 : 0, noMap: variant === 'no-map' }
  if (variant === 'empty') fixture.data = { total_farms: 0, monitored_farms: 0, critical_farms: [], cleanout_compliance: { compliant: 0, non_compliant: 0, undetermined: 0 } }
  if (variant === 'offline') Object.assign(fixture.data, { monitored_farms: 0, critical_farms: [] })
  if (variant === 'missing') { delete fixture.data.monitored_farms; delete fixture.data.cleanout_compliance }
  if (variant === 'large') Object.assign(fixture.data, { total_farms: 123456, monitored_farms: 12345, cleanout_compliance: { compliant: 100000, non_compliant: 20000, undetermined: 3456 } })
  setAuth('synthetic-superadmin-dashboard', { id: 91, first_name: 'UI', last_name: 'Fixture', role, must_change_password: false, legal_acknowledged_at: '2026-11-03T00:00:00Z' })
  root.render(<StrictMode key={++mounts}><MemoryRouter initialEntries={['/dashboard']}><Routes>
    <Route path="/dashboard" element={role === 'admin' ? <StaffDashboard /> : <SuperAdminDashboard />} />
    <Route path="/admin/alert-history" element={<p>Synthetic alert history destination</p>} />
  </Routes></MemoryRouter></StrictMode>)
  if (variant === 'loading') return
  await wait(() => variant === 'error' ? text().includes('Synthetic dashboard unavailable') : document.querySelector(role === 'admin' ? '.staff-dashboard-stat' : '.superadmin-dashboard-stat'))
  await sleep(50)
}
window.superadminDashboardPreview = render

try {
  await render()
  assert(cards().length === 3 && cards().map(card => card.getAttribute('aria-label')).join('|') === 'Total Farms|Monitored Farms|Annual Clean-out Compliance', 'Exactly three oversight cards with the requested labels')
  assert(values().join('|') === '47|2|31|12', 'Cards use the authorized aggregate fields')
  assert(cards()[2].querySelector('dl').textContent.includes('Compliant') && cards()[2].textContent.includes('Undetermined: 2'), 'Split compliance counts and separate visible Undetermined count')
  assert(!document.querySelector('.annual-compliance') && !cards().some(card => /Staff|Veterinarian|Scheduled Inspections|Critical Alerts/.test(card.textContent)), 'No separate compliance banner or operational/account/duplicate alert cards')
  assert(!requests.some(request => request.url === '/superadmin/accounts'), 'Account fetching removed with account summary cards')
  assert(cards().every(card => card.querySelector('h2 svg')?.getAttribute('width') === '16'), 'Reuse small Staff outline icons')
  passed.push('exactly three cards, authoritative fields, separate Undetermined, no account request or extra banner')

  assert(document.querySelector('.leaflet-container') && text().includes('Summary') && text().includes('Critical Alerts') && text().includes(alert.farm_name), 'Existing map and Critical Alerts Summary remain')
  assert(document.querySelectorAll('.leaflet-marker-icon').length === 2, 'Existing map markers remain')
  button('View all →').click(); await wait(() => button('Open Alert History →'))
  assert(text().includes('35ppm'), 'Current critical alert details remain accessible')
  button('Open Alert History →').click(); await wait(() => text().includes('Synthetic alert history destination'))
  passed.push('map markers, Critical Alerts Summary, details and Alert History navigation preserved')

  await render({ variant: 'loading' }); await sleep(60)
  assert(cards().length === 0 && document.querySelectorAll('.agb-skeleton').length > 0, 'Loading uses placeholders instead of fabricated zero counts')
  await wait(() => cards().length === 3)
  await render({ variant: 'error' }); assert(cards().length === 0, 'Failed dashboard request displays an error without zero cards')
  await render({ variant: 'missing' }); assert(values().join('|') === '47|—|—|—', 'Missing aggregate fields remain unavailable, never converted to zero')
  await render({ variant: 'empty' }); assert(values().join('|') === '0|0|0|0' && !text().includes('Undetermined:'), 'Successful empty dataset correctly displays zero')
  await render({ variant: 'offline' }); assert(values()[0] === '47' && values()[1] === '0', 'Offline aggregate leaves registered total intact')
  await render({ variant: 'no-map' }); assert(values()[1] === '2' && !document.querySelector('.leaflet-marker-icon'), 'Monitored aggregate is independent of map coordinates or marker count')
  passed.push('loading, failure, missing fields, empty data and offline states never manufacture a monitored count')

  fixture.data.monitored_farms = 1
  invalidateCache('/admin/dashboard'); await wait(() => values()[1] === '1')
  assert(cards().length === 3 && !requests.some(request => request.url.includes('readings')), 'Refresh consumes one dashboard aggregate without per-farm calls')
  passed.push('existing cached-fetch refresh updates the aggregate without per-farm requests')

  assert(!unexpected.length && !runtimeErrors.length, JSON.stringify({ unexpected, runtimeErrors }))
  await render()
  window.superadminDashboardResults = { passed, unexpected, runtimeErrors }
} catch (error) {
  window.superadminDashboardResults = { passed, error: error.stack, unexpected, runtimeErrors }
}
