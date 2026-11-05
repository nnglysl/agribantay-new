import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '../src/index.css'
import VetFarmDetails from '../src/pages/vet/FarmDetails'
import StaffFarmDetails from '../src/pages/admin/FarmDetails'
import L from 'leaflet'
import { FarmOverview } from '../src/components/farm-details/FarmProfileSections'
import { clearAllCache } from '../src/hooks/useCachedFetch'
import { setAuth } from '../src/utils/auth'
import api from '../src/api/axios'

// The test runner calls the actual Staff and Vet controllers against the same
// SQLite-memory farm, then supplies their JSON here. No operational API is used.
const roleResponses = await (await fetch('/__vet-overview-fixture')).json()
const requests = [], unexpected = [], runtimeErrors = [], passed = []
window.addEventListener('error', event => runtimeErrors.push(event.message))
window.addEventListener('unhandledrejection', event => runtimeErrors.push(String(event.reason)))
const baseFarm = roleResponses.vet
const markers = []
const originalCircleMarker = L.circleMarker
L.circleMarker = (coordinates, options) => { markers.push([...coordinates]); return originalCircleMarker(coordinates, options) }
let farm = structuredClone(baseFarm), failure = false, houseFailure = false, houses, mounts = 0
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const assert = (value, message) => { if (!value) throw Error(message) }
const text = () => document.body.textContent
const field = label => [...document.querySelectorAll('.fd-field')].find(element => element.querySelector('dt').textContent === label)?.querySelector('dd').textContent
const button = label => [...document.querySelectorAll('button')].find(element => element.textContent.trim() === label)
const click = label => { const element = button(label); assert(element, 'Missing button: ' + label); element.click() }
async function wait(check) {
  for (let index = 0; index < 300; index++) { if (check()) return; await sleep(20) }
  throw Error('Fixture wait timed out')
}
api.defaults.adapter = async config => {
  const { url, params = {}, method } = config
  requests.push({ url, method, params: structuredClone(params) })
  let data
  if (method !== 'get') { unexpected.push(method + ' ' + url); throw Error('No mutations are allowed') }
  if (url === '/notifications') data = { data: [], unread_count: 0, total_count: 0 }
  else if (url === '/vet/farms/17') {
    if (failure) throw Object.assign(Error('Synthetic farm unavailable'), { response: { status: 404, data: { message: 'Synthetic farm unavailable' } } })
    data = { data: structuredClone(farm) }
  } else if (url === '/admin/farms/17') data = { data: structuredClone(roleResponses.staff) }
  else if (url === '/farms/17/poultry-houses') {
    if (houseFailure) throw Error('Synthetic house listing unavailable')
    data = { data: structuredClone(houses) }
  } else if (url === '/vet/farms/17/readings-history') data = { data: { hours: params.hours, devices: [] } }
  else if (url === '/farms/17/house-monitoring') data = { data: {
    farm_id: 17, rows: [], coverage: { known: false, legacy_devices: 0 },
    connectivity: { online: 0, assigned_active_house_devices: 0, offline: 0, awaiting_first_reading: 0 },
    farm_assessment: { condition: 'Not Monitored' }, message: 'Synthetic unverified inventory.',
  } }
  else if (url === '/vet/farms/17/service-requests') data = { data: {
    query_key: params.query_key, current_page: 1, last_page: 1, total: 1,
    requests: [{ id: 90, request_number: 'SR-FIXTURE-90', request_type: 'Farm Biosecurity Request',
      status: 'Completed', created_at: '2026-10-25T01:00:00Z', request_date: 'Oct 25, 2026',
      accepted_by: 'Fixture Veterinarian', completed_at: 'Oct 26, 2026', completed_at_raw: '2026-10-26T01:00:00Z',
      notes: 'Synthetic biosecurity assessment.', attachments: [] }],
  } }
  else { unexpected.push(url); throw Error('Unexpected fixture request: ' + url) }
  return { data, status: 200, statusText: 'OK', headers: {}, config }
}
const root = createRoot(document.querySelector('#root'))
async function render(variant = 'current', role = 'vet') {
  root.render(null); await sleep(30); clearAllCache()
  farm = structuredClone(baseFarm); failure = variant === 'error'
  houseFailure = variant === 'house-error'
  houses = structuredClone(role === 'admin' ? roleResponses.staff_houses : roleResponses.vet_houses)
  // Simulate a future legitimately available response to test presentation and
  // defense against a mistakenly supplied management flag; no records are created.
  if (variant === 'houses') Object.assign(houses, { available: true, inventory_status: 'verified', can_manage: true, message: null,
    houses: [{ id: 8, house_number: 8, name: 'House 8', status: 'Active', assigned_devices: [] }] })
  if (variant === 'missing') Object.assign(farm, { owner_name: null, owner_first_name: null, owner_last_name: null, owner_address: null, email: null, mobile_number: null, address: null, barangay: null, farm_size: null, created_at: 'invalid', latitude: null, longitude: null })
  if (variant === 'blank-coordinates') Object.assign(farm, { latitude: '', longitude: ' ' })
  if (variant === 'invalid-coordinates') Object.assign(farm, { latitude: 'bad', longitude: false })
  if (variant === 'out-of-range') Object.assign(farm, { latitude: 91, longitude: 181 })
  if (variant === 'zero-coordinates') Object.assign(farm, { latitude: 0, longitude: 0 })
  if (variant === 'inactive') farm.status = 'Inactive'
  if (variant === 'photo') farm.owner_profile_photo_url = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42"><rect width="42" height="42" fill="#cfe0d3"/></svg>')
  if (variant === 'long') Object.assign(farm, { farm_name: 'A very long registered poultry farm name '.repeat(4), email: 'long-owner-contact-'.repeat(8) + '@example.test', address: 'Lot 12 near the barangay hall, Calansayan, San Jose, Batangas. '.repeat(4) })
  setAuth('synthetic-vet-overview', { id: 91, first_name: 'UI', last_name: 'Fixture', role, must_change_password: false, legal_acknowledged_at: '2026-11-03T00:00:00Z' })
  root.render(<StrictMode key={++mounts}><MemoryRouter initialEntries={[`/${role === 'admin' ? 'admin' : 'vet'}/farms/17`]}><Routes>
    <Route path="/vet/farms/:farmId" element={<VetFarmDetails />} />
    <Route path="/admin/farms/:farmId" element={<StaffFarmDetails />} />
    <Route path="/vet/farms" element={<p>Fixture farm list destination</p>} />
  </Routes></MemoryRouter></StrictMode>)
  await wait(() => failure ? text().includes('Synthetic farm unavailable') : document.querySelector('.fd-overview-grid'))
  if (!failure) await wait(() => document.querySelector('.ph-section'))
  await sleep(40)
}
window.vetOverviewPreview = render

try {
  await render()
  assert(document.querySelector('.fd-title h1').textContent === baseFarm.farm_name, 'Farm name leads the header')
  assert(document.querySelector('.fd-title p').textContent === baseFarm.address, 'Header shows complete stored farm address')
  assert([...document.querySelectorAll('.fd-panel h2')].map(element => element.textContent).join('|') === 'Farm Information|Farm Owner Information|Farm Location', 'Reuse the three Staff cards')
  for (const [label, value] of [['Farm Name', baseFarm.farm_name], ['Farm ID', '#17'], ['Barangay', 'Calansayan'], ['Farm Size', 'Medium'], ['Date Registered', 'Jun 12, 2026'], ['Farm Status', 'Active'], ['Complete Address', baseFarm.address], ['Contact Number', baseFarm.mobile_number], ['Email Address', baseFarm.email], ['Owner Address', baseFarm.owner_address]]) {
    assert(field(label) === value, label + ' must use the authorized response and Manila registration date')
  }
  assert(document.querySelector('.fd-owner strong').textContent === 'Mara Reyes' && document.querySelector('.fd-owner-avatar').textContent === 'MR', 'Keep owner name and initials')
  assert(!document.querySelector('.fd-overview-grid input,.fd-overview-grid select,.fd-overview-grid textarea,.fd-overview-grid button,.fd-account-access'), 'Overview has no form, management or account access controls')
  assert(!/Edit Farm|Edit Owner|Delete Farm|Assign Device|Account Information|Owner Profile Photo/.test(text()), 'No Staff actions or registration hints')
  assert(field('Owner Address') !== field('Complete Address'), 'Owner address never falls back to farm address')
  assert(document.querySelector('.ph-section')?.textContent.includes('Poultry house records are unavailable.'), 'Vet house summary keeps unavailable inventory concise')
  passed.push('actual Vet controller response: correct authorized fields, privacy and guarded house empty state')

  const overviewData = () => ({ fields: Object.fromEntries([...document.querySelectorAll('.fd-field')].map(element => [element.querySelector('dt').textContent, element.querySelector('dd').textContent])),
    owner: document.querySelector('.fd-owner strong').textContent, coordinates: document.querySelector('.fd-location-body .fd-caption').textContent,
    marker: markers.at(-1), link: document.querySelector('.fd-map-link').href, houseState: document.querySelector('.ph-section').textContent })
  const vetData = overviewData()
  await render('current', 'admin')
  const vetProfileData = { ...vetData }; delete vetProfileData.houseState
  const staffProfileData = overviewData(); delete staffProfileData.houseState
  assert(JSON.stringify(staffProfileData) === JSON.stringify(vetProfileData), 'Actual Staff and Vet response fields, owner identity, marker and map URL must match for the same stored farm')
  assert(button('Edit Farm') && document.querySelector('.fd-account-access'), 'Staff management remains present for Staff')
  await render()
  assert(!button('Edit Farm') && !document.querySelector('.fd-account-access'), 'No Staff management after switching to Vet')
  passed.push('same SQLite-memory farm: actual Staff/Vet routes match all Overview values, owner contacts, coordinates and marker')

  await render('coordinates')
  const link = document.querySelector('.fd-map-link')
  assert(link?.href === `https://www.google.com/maps?q=${baseFarm.latitude},${baseFarm.longitude}` && link.target === '_blank' && link.rel.includes('noopener'), 'Larger map uses exact stored coordinates and safe external navigation')
  assert(document.querySelector('.fd-map.leaflet-container') && document.querySelector('.leaflet-interactive') && !document.querySelector('.leaflet-marker-draggable'), 'Reuse the Staff Leaflet map with a fixed pin')
  assert(text().includes(`${Number(baseFarm.latitude).toFixed(5)}, ${Number(baseFarm.longitude).toFixed(5)}`), 'Show stored coordinate values')
  assert(JSON.stringify(markers.at(-1)) === JSON.stringify([baseFarm.latitude, baseFarm.longitude]), 'Marker retains full stored coordinate precision')
  assert(!text().includes('Farm Monitoring Summary') && !text().includes('Environmental Trend'), 'Vet farm details omit monitoring summaries')
  passed.push('shared map: exact coordinates, fixed marker and larger-map link')

  click('Service Requests'); await wait(() => text().includes('SR-FIXTURE-90') || document.querySelector('tbody tr'))
  assert([...document.querySelectorAll('.agb-scrollable-tabs-viewport > button')].map(element => element.textContent).join('|') === 'Farm Information|Service Requests', 'Keep only Farm Information and Service Requests tabs')
  const view = document.querySelector('.agb-table-action'); assert(view, 'Existing service request View action'); view.click()
  await wait(() => text().includes('Synthetic biosecurity assessment.'))
  assert(text().includes('Farm Biosecurity') && text().includes('SR-FIXTURE-90'), 'Farm Biosecurity detail workflow remains accessible')
  click('Close'); click('Farm Information'); await wait(() => document.querySelector('.fd-overview-grid'))
  click('← Back'); await wait(() => text().includes('Fixture farm list destination'))
  passed.push('existing tabs, Farm Biosecurity request details and Back route remain accessible')

  await render('missing')
  for (const label of ['Contact Number', 'Email Address', 'Owner Address']) assert(field(label) === 'Not provided', label + ' missing fallback')
  assert(document.querySelector('.fd-map--empty') && !document.querySelector('.fd-map-link'), 'Missing coordinates have no fabricated pin or link')
  assert(field('Date Registered') === '—' && field('Complete Address') === '—', 'Missing farm fields use Staff fallbacks')
  assert(document.querySelector('.fd-owner strong').textContent === 'Not provided' && text().includes('Address not available'), 'Missing owner and address have clear fallbacks')
  await render('inactive'); assert(field('Farm Status') === 'Inactive' && document.querySelector('.fd-header .fd-badge--muted'), 'Inactive badge stays neutral')
  await render('photo'); assert(document.querySelector('.fd-owner-avatar img')?.alt === 'Farm owner', 'Keep authorized owner avatar')
  await render('error'); assert(!document.querySelector('.fd-overview-grid'), 'Failed farm response cannot display a stale profile')
  for (const variant of ['blank-coordinates', 'invalid-coordinates', 'out-of-range']) {
    await render(variant); assert(document.querySelector('.fd-map--empty') && !document.querySelector('.fd-map-link'), variant + ' must not produce a pin or link')
  }
  await render('zero-coordinates'); assert(document.querySelector('.fd-map-link')?.href === 'https://www.google.com/maps?q=0,0', 'Valid numeric zero coordinates are preserved')
  passed.push('missing values, invalid/blank/range/zero coordinates, inactive status, photo and farm load failure')

  await render('houses')
  const houseSection = document.querySelector('.ph-section')
  assert(houseSection.textContent.includes('House 8') && houseSection.textContent.includes('Active') && !/Device|Monitoring|Safe/.test(houseSection.textContent), 'Vet sees only the compact house name and status summary')
  assert(houseSection.querySelectorAll('button').length === 0, 'Vet house summary has no management or refresh controls')
  await render('house-error')
  assert(document.querySelector('.ph-error') && !document.querySelector('.ph-section tbody'), 'A failed house request shows an error rather than stale data')
  passed.push('read-only Poultry Houses: compact inventory, no controls, and explicit load errors')

  root.render(null); await sleep(30)
  root.render(<div className="fd-page"><FarmOverview farm={baseFarm} registrationDate="Jun 12, 2026" readOnly onEdit={() => { throw Error('Read-only edit invoked') }} accountAccess={<button>Secret account management</button>} /></div>)
  await wait(() => document.querySelector('.fd-overview-grid'))
  assert(!button('Edit') && !text().includes('Secret account management'), 'Read-only option suppresses management even when callbacks/content are supplied')
  root.render(<div className="fd-page"><FarmOverview farm={baseFarm} registrationDate="Jun 12, 2026" onEdit={() => {}} accountAccess={<button>Staff account management</button>} /></div>)
  await wait(() => button('Edit') && button('Staff account management'))
  passed.push('shared component: explicit read-only suppresses actions; Staff default keeps them')

  assert(unexpected.length === 0 && runtimeErrors.length === 0, 'No unexpected API calls or browser exceptions: ' + JSON.stringify({ unexpected, runtimeErrors }))
  assert(requests.every(request => request.method === 'get'), 'No write request from this UI')
  await render()
  window.vetOverviewResults = { passed, unexpected, runtimeErrors }
} catch (error) {
  window.vetOverviewResults = { passed, error: error.stack, unexpected, runtimeErrors }
}
