import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import HouseMonitoring from '../src/components/HouseMonitoring'
import FarmerDashboard from '../src/pages/farmowner/Dashboard'
import FarmerReadings from '../src/pages/farmowner/Readings'
import VetFarmDetails from '../src/pages/vet/FarmDetails'
import FarmContext from '../src/context/FarmContext'
import { clearAllCache, invalidateCache } from '../src/hooks/useCachedFetch'
import { setAuth } from '../src/utils/auth'
import api from '../src/api/axios'
import { Chart } from 'chart.js'
import '../src/index.css'

const root = createRoot(document.querySelector('#root')), requests = [], passed = [], errors = [], unexpected = []
window.addEventListener('error', event => errors.push(event.message))
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const assert = (condition, message) => { if (!condition) throw Error(message) }
const wait = async predicate => { for (let i = 0; i < 250; i++) { if (predicate()) return; await sleep(20) } throw Error('Monitoring browser fixture timed out') }
const reading = (id, condition = 'Safe') => ({ id, ammonia: condition === 'Critical' ? 85 : 2, ammonia_status: condition, moisture: 10, moisture_status: 'Safe', temperature: 45, temperature_status: 'Critical', humidity: 80, humidity_status: 'Critical', recorded_at: '2026-11-01T12:00:00Z', primary_assessment: { condition } })
const row = (id, state, sample) => ({ key: `house:${id}`, poultry_house_id: id, house_name: `House ${id}`, house_status: state === 'Inactive' ? 'Inactive' : 'Active', device_id: id, device_name: `AGB-D0${id}`, state, connectivity: ['Safe', 'Critical'].includes(state) ? 'Online' : state === 'Offline' ? 'Offline' : 'Not applicable', current_reading: sample || null, last_reading: sample || (state === 'Offline' ? reading(990, 'Critical') : null) })
const original = { farm_id: 1, farm_name: 'First Fixture Farm', inventory_status: 'verified', rows: [row(1, 'Critical', reading(101, 'Critical')), row(2, 'Safe', reading(102)), row(3, 'Offline'), row(4, 'Not Monitored'), row(5, 'Inactive'), row(6, 'No Readings Yet'), { ...row(7, 'Safe', reading(103)), key: 'legacy:7', poultry_house_id: null, house_name: 'House not recorded' }], farm_assessment: { condition: 'Critical' }, coverage: { known: true, monitored_houses: 4, active_houses: 5, unmonitored_houses: 1, legacy_devices: 1 }, connectivity: { online: 2, assigned_active_house_devices: 4, offline: 1, awaiting_first_reading: 1, legacy_online: 1 }, message: 'Missing houses are not assumed Safe.' }
// Deliberately inconsistent cached response: the UI must still suppress stale Safe values when Offline.
original.rows[2].current_reading = reading(990)
const second = { ...structuredClone(original), farm_id: 2, farm_name: 'Second Fixture Farm', rows: [row(1, 'Safe', reading(202))], farm_assessment: { condition: 'Safe' }, coverage: { known: true, active_houses: 1, monitored_houses: 1, unmonitored_houses: 0, legacy_devices: 0 }, connectivity: { online: 1, assigned_active_house_devices: 1, offline: 0, awaiting_first_reading: 0 } }
let failRead = false, delayFirst = false, releaseFirst, mounted = 0, setSelected
let vetHistoryMode = 'normal', vetHistoryReleases = []
const historyNow = Date.now()
const vetPoint = (ago, ammonia) => ({ t: new Date(historyNow - ago * 3600000).toISOString(), ammonia, moisture: ammonia + 10, temperature: 28 + ago / 24, humidity: 60 + ago / 24 })
const vetSeries = [
  { sensor_id: 1, device_name: 'Recorded device A', points: [vetPoint(48, 42), vetPoint(12, 6), vetPoint(2, 10)] },
  { sensor_id: 7, device_name: 'Recorded legacy device', points: [vetPoint(1, 3)] },
]
api.defaults.adapter = async config => {
  requests.push({ method: config.method, url: config.url, params: config.params })
  assert(config.method === 'get', 'Monitoring never sends a mutating request')
  const response = data => ({ data, status: 200, statusText: 'OK', headers: {}, config })
  if (config.url === '/notifications') return response({ data: [], unread_count: 0, total_count: 0 })
  if (config.url === '/farmer/insights') return response({ data: { tips: [`Advice for farm ${config.params.farm_id}`] } })
  if (config.url === '/farmer/dashboard') {
    const snapshot = config.params.farm_id === 2 ? second : original
    const devices = snapshot.rows.filter(row => row.device_id && !['Inactive', 'Not Monitored'].includes(row.state)).map(row => ({ ...row.current_reading,
      device_id: row.device_id, device_name: row.device_name, poultry_house_name: row.poultry_house_id ? row.house_name : null, connectivity: row.connectivity, has_reading: !!row.current_reading, last_reading_at: row.current_reading?.recorded_at }))
    const data = { farm_id: snapshot.farm_id, farm_name: snapshot.farm_name, house_monitoring: structuredClone(snapshot), devices, alerting_metrics: ['ammonia', 'moisture'] }
    if (delayFirst && config.params.farm_id === 1) return new Promise(resolve => { releaseFirst = () => resolve(response({ data })) })
    return response({ data })
  }
  const match = config.url.match(/^\/farms\/(\d+)\/(house-monitoring|house-readings|poultry-houses)$/)
  if (match) {
    const farm = Number(match[1])
    if (match[2] === 'poultry-houses') return response({ data: { farm_id: farm, available: false, inventory_status: 'unavailable', can_manage: false, houses: [] } })
    if (match[2] === 'house-monitoring') {
      if (failRead) throw Error('Synthetic monitoring refresh failed')
      const data = structuredClone(farm === 2 ? second : original)
      if (delayFirst && farm === 1) return new Promise(resolve => { releaseFirst = () => resolve(response({ data })) })
      return response({ data })
    }
    const query = config.params || {}, page = query.page || 1
    const items = [{ ...reading(page === 2 ? 112 : 111), poultry_house_id: query.poultry_house_id === 'unknown' ? null : 1, house_name: query.poultry_house_id === 'unknown' ? 'House not recorded' : 'House 1', device_name: 'AGB-D01', assignment_event_id: query.assignment_event_id || 31 }]
    return response({ data: { farm_id: farm, query_key: query.query_key, items, total: 11, current_page: page, last_page: 2, periods: [{ id: 31, to_house_number: 1, occurred_at: '2026-11-01T11:00:00Z' }, { id: 11, to_house_number: 1, occurred_at: '2026-10-20T11:00:00Z' }] } })
  }
  if (/^\/vet\/farms\/\d+$/.test(config.url)) return response({ data: { id: Number(config.url.split('/').at(-1)), farm_name: 'Vet Fixture Farm', owner_name: 'Synthetic Owner', status: 'Active', latest_reading: null } })
  if (config.url.endsWith('/readings-history')) {
    if (vetHistoryMode === 'error') throw Error('Synthetic historical data failure')
    const hours = Number(config.params.hours)
    const source = config.url.includes('/2/') ? [{ sensor_id: 2, device_name: 'Second farm history', points: [vetPoint(1, 55)] }] : vetSeries
    const devices = vetHistoryMode === 'empty' ? [] : source.map(device => ({ ...device, points: device.points.filter(point => Date.parse(point.t) >= historyNow - hours * 3600000) }))
    const data = { hours, devices }
    if (vetHistoryMode === 'delay') return new Promise(resolve => vetHistoryReleases.push(() => resolve(response({ data }))))
    return response({ data })
  }
  unexpected.push(config.url); throw Error('Unexpected fixture GET')
}
const panel = () => document.querySelector('.hm-panel')
const select = async (label, value) => { const element = document.querySelector(`[aria-label="${label}"]`); element.value = value; element.dispatchEvent(new Event('change', { bubbles: true })); await sleep(40) }
const button = text => [...document.querySelectorAll('button')].find(button => button.textContent === text)
const tableRows = () => [...panel().querySelectorAll('tbody tr')]
const accuracyNote = 'Ammonia values are device estimates; ppm accuracy has not yet been validated.'
async function direct(farmId = 1, cards = false, farmer = false) {
  const previous = panel()
  root.render(<HouseMonitoring key={++mounted} farmId={farmId} cards={cards} farmer={farmer} />)
  await wait(() => panel() !== previous && panel()?.querySelector('[aria-label="Monitoring house"]'))
}
export function FarmerFixture({ page }) {
  const [selectedFarmId, update] = useState(1)
  setSelected = update
  return <FarmContext.Provider value={{ selectedFarmId, setSelectedFarmId: update, farmsLoading: false, farms: [{ id: 1, farm_name: 'First Fixture Farm' }, { id: 2, farm_name: 'Second Fixture Farm' }] }}><MemoryRouter>{page === 'dashboard' ? <FarmerDashboard /> : <FarmerReadings />}</MemoryRouter></FarmContext.Provider>
}
async function vetView(farmId = 1) {
  const previousHeader = document.querySelector('.fd-header')
  clearAllCache(); setAuth('synthetic-vet-token', { id: 200, role: 'vet', first_name: 'Synthetic' })
  root.render(<MemoryRouter key={++mounted} initialEntries={[`/vet/farms/${farmId}`]}><Routes><Route path="/vet/farms/:farmId" element={<VetFarmDetails />} /></Routes></MemoryRouter>)
  await wait(() => button('Monitoring') && document.querySelector('.fd-header') && document.querySelector('.fd-header') !== previousHeader)
  button('Monitoring').click(); await wait(() => document.querySelector('.vm-sensor'))
}
const vetSection = title => [...document.querySelectorAll('.vm .fd-panel')].find(section => section.querySelector('h2')?.textContent === title)
const chart = () => Chart.getChart(document.querySelector('.vm canvas'))
try {
  setAuth('synthetic-monitoring-token', { id: 100, role: 'farm_owner', first_name: 'Synthetic' })
  await direct()
  assert(tableRows().length === 6 && !panel().querySelector('.hm-summary') && !/Worst valid current farm condition|Device Coverage|house inventory is unverified|farm-only device\(s\)|House not recorded/.test(panel().textContent), 'Current monitoring excludes legacy farm-only rows while readings remain')
  assert(panel().querySelector('h2').textContent === 'Current Readings' && panel().querySelector('.hm-heading button').textContent === 'Refresh', 'Current Readings is the default card and owns the concise Refresh action')
  assert(panel().querySelector('.hm-accuracy-note').textContent === accuracyNote && panel().querySelector('.hm-accuracy-note').nextElementSibling.classList.contains('hm-scroll'), 'Exact concise ammonia limitation stays next to the readings table')
  assert(panel().querySelector('thead').textContent.includes('Connectivity'), 'Connectivity column remains after removing its summary card')
  for (const state of ['Offline', 'Not Monitored', 'Inactive', 'No Readings Yet', 'Critical']) assert(panel().textContent.includes(state), 'Show independent state '+state)
  assert(!tableRows()[2].textContent.includes('85'), 'Offline values never appear as current measurements')
  passed.push('Simplified Current Readings card keeps exact ammonia note, independent states and offline suppression without redundant summaries')

  await select('Monitoring house', '1')
  assert(tableRows().length === 1 && tableRows()[0].textContent.includes('House 1'), 'House filtering stays independent')
  button('Reading History').click(); await wait(() => document.querySelector('[aria-label="Monitoring from date"]'))
  assert(!document.querySelector('[aria-label="Monitoring period"]') && ![...panel().querySelectorAll('th')].some(cell => cell.textContent === 'Assignment period'), 'Assignment selector and column removed without changing history rows')
  assert(requests.at(-1).params.poultry_house_id === '1', 'History explicitly scopes house and assignment period together')
  button('Next readings').click(); await wait(() => requests.at(-1)?.params?.page === 2)
  await select('Monitoring house', 'unknown')
  await wait(() => panel().textContent.includes('House not recorded') && requests.at(-1)?.params?.poultry_house_id === 'unknown')
  assert(!requests.at(-1).params.assignment_event_id && requests.at(-1).params.page === 1, 'Changing house resets period and page')
  passed.push('House history has no Assignment Period UI while original attribution and pagination remain intact')

  const originalRows = original.rows
  original.rows = [...originalRows, ...Array.from({ length: 5 }, (_, index) => row(index + 8, 'Safe', reading(index + 800)))]
  for (const role of ['admin', 'super_admin']) {
    setAuth('synthetic-reading-views-' + role, { id: 300, role, first_name: 'Synthetic' })
    await direct()
    const tabs = [...document.querySelectorAll('.hm [role="tab"]')]
    assert(tabs.map(tab => tab.textContent).join('|') === 'Current Readings|Reading History', role + ': separate reading tabs')
    assert(!panel().contains(tabs[0]) && document.querySelector('.hm > .agb-scrollable-tabs').nextElementSibling === panel(), role + ': tabs above the white content card')
    assert(!document.querySelector('[aria-label="Monitoring view"],[aria-label="Monitoring condition"]'), role + ': View and Condition dropdowns removed')
    assert(panel().querySelector('h2').textContent === 'Current Readings' && button('Refresh')?.closest('.hm-panel') === panel(), role + ': Refresh belongs inside the default Current Readings card')
    assert(!panel().querySelector('.hm-summary') && !panel().textContent.includes(original.message) && panel().querySelector('.hm-accuracy-note').textContent === accuracyNote, role + ': no redundant metadata summary, exact readable accuracy note')
    assert(tableRows().length === 10 && panel().textContent.includes('Page 1 of 2') && panel().querySelector('thead').textContent.includes('Condition'), role + ': current pagination and condition column retained')
    const beforeRefresh = requests.filter(request => request.url.endsWith('/house-monitoring')).length
    button('Refresh').click(); await wait(() => requests.filter(request => request.url.endsWith('/house-monitoring')).length > beforeRefresh)
    button('Next readings').click(); await wait(() => tableRows().length === 2)
    await select('Monitoring house', '1')
    assert(tableRows().length === 1 && panel().textContent.includes('Page 1 of 1'), role + ': house filter resets current pagination')
    tabs[0].focus(); tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    await wait(() => document.querySelector('[aria-label="Monitoring from date"]'))
    assert(tabs[1].getAttribute('aria-selected') === 'true' && document.activeElement === tabs[1] && panel().getAttribute('aria-labelledby') === tabs[1].id, role + ': keyboard and ARIA associations')
    for (const [label, value] of [['Monitoring from date', '2026-11-01'], ['Monitoring to date', '2026-11-02']]) {
      const input = document.querySelector(`[aria-label="${label}"]`)
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }))
      await sleep(30)
    }
    const historyRequests = () => requests.filter(request => request.url.endsWith('/house-readings'))
    await wait(() => historyRequests().at(-1)?.params?.to === '2026-11-02')
    const query = historyRequests().at(-1).params
    assert(query.from === '2026-11-01' && query.poultry_house_id === '1' && !Object.hasOwn(query, 'assignment_event_id') && !Object.hasOwn(query, 'condition'), role + ': history preserves house/date filters without hidden Assignment Period or Condition')
    assert(tableRows()[0].querySelectorAll('td')[5].textContent === 'Safe' && tableRows()[0].textContent.includes('November 1, 2026') && /8:00\s*PM/.test(tableRows()[0].textContent), role + ': original recorded condition and Manila time remain')
    assert(panel().querySelector('h2').textContent === 'Reading History' && !button('Refresh') && panel().querySelector('.hm-accuracy-note').textContent === accuracyNote, role + ': history stays distinct and Refresh is limited to Current Readings')
    button('Next readings').click(); await wait(() => historyRequests().at(-1)?.params?.page === 2)
    assert(!panel().querySelector('select[aria-label="Monitoring condition"]'), role + ': no history Condition filter')
    tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    await wait(() => tabs[0].getAttribute('aria-selected') === 'true' && !document.querySelector('[aria-label="Monitoring period"]'))
    assert(!panel().querySelector('input[type="date"]') && tableRows()[0].textContent.includes('Critical'), role + ': current condition stays independent of history dates')
  }
  original.rows = originalRows
  setAuth('synthetic-monitoring-token', { id: 100, role: 'farm_owner', first_name: 'Synthetic' })
  passed.push('Staff and Super Admin retain keyboard tabs, house/date filters, refresh and pagination without Assignment Period controls')

  await direct(1, true)
  assert(panel().querySelectorAll('[data-metric]').length === 4, 'Dashboard preserves four sensor cards')
  await select('Monitoring house', '2')
  assert(panel().textContent.includes('House 2') && panel().querySelector('[data-metric="ammonia"]').textContent.includes('Safe'), 'Select a house independently')
  assert(!panel().querySelector('[data-metric="temperature"]').textContent.includes('Critical'), 'Supporting indicators do not acquire primary severity badges')
  await select('Monitoring house', '3')
  assert(!panel().querySelector('[data-metric="ammonia"]').textContent.includes('85'), 'Offline cards remain empty instead of displaying old Critical as current')
  passed.push('Four sensor cards retain primary/supporting roles and show only the selected house current period')

  await direct(); failRead = true; button('Refresh').click()
  await wait(() => panel()?.textContent.includes('Synthetic monitoring refresh failed'))
  assert(!panel().querySelector('table'), 'Read failure clears stale measurements')
  failRead = false; button('Retry Monitoring').click(); await wait(() => panel()?.querySelector('table'))
  passed.push('Refresh failure removes stale readings until a successful retry')

  clearAllCache(); delayFirst = true; releaseFirst = null
  root.render(<FarmerFixture key={++mounted} page="dashboard" />)
  await wait(() => releaseFirst && setSelected); setSelected(2)
  await wait(() => document.querySelector('.fdb-condition')?.textContent.includes('Safe') && document.querySelector('.fdb-overview tbody'))
  releaseFirst(); await sleep(100)
  assert(document.querySelector('.fdb-condition').textContent.includes('Safe') && !document.querySelector('.hm-panel, [data-metric]') && !document.body.textContent.includes('Advice for farm 1') && document.querySelector('.fdb-overview tbody tr').textContent.includes('House 1'), 'Late previous-farm data and advice cannot cross the selected farm summary boundary; Dashboard has no detailed metrics')
  delayFirst = false
  passed.push('Actual Farmer Dashboard switches farms without stale readings, coverage or recommendations')

  clearAllCache(); root.render(<FarmerFixture key={++mounted} page="readings" />)
  const farmerPanel = () => document.querySelector('.fr-panel:not([hidden])')
  const farmerRows = () => [...(farmerPanel()?.querySelectorAll('tbody tr') || [])]
  await wait(() => farmerPanel()?.querySelector('table'))
  assert(!farmerPanel().querySelector('svg,canvas') && !document.querySelector('.hm-cards'), 'Actual Farmer Readings remains a simple table without charts')
  assert(!farmerPanel().textContent.includes('Device Coverage') && !farmerPanel().textContent.includes('Assignment period'), 'Farmer view hides technical totals and internal period IDs')
  document.querySelectorAll('.fr [role="tab"]')[1].click(); await wait(() => farmerPanel()?.querySelector('[aria-label="History house or device"]'))
  await select('History house or device', 'house:unknown'); button('Apply Filters').click(); await wait(() => farmerRows()[0]?.textContent.includes('Farm-level reading'))
  assert(!farmerRows()[0].textContent.includes('House 1'), 'Legacy history never invents House 1')
  setSelected(2); await wait(() => farmerRows().length === 1 && farmerRows()[0].textContent.includes('Safe') && document.querySelector('.fr [role="tab"]').getAttribute('aria-selected') === 'true')
  assert(farmerRows().length === 1, 'Actual Readings switches farm inventory instead of merging rows')
  passed.push('Actual Farmer Readings uses accessible tabs and respects farm switching')

  await vetView(); await wait(() => chart()?.data.datasets.length === 2)
  assert(document.body.textContent.includes('Farm Monitoring Summary') && document.body.textContent.includes('Environmental Trend') && document.querySelectorAll('.vm-sensor').length === 4 && !document.querySelector('.vm table,.hm-panel'), 'Vet uses summary cards and authorized history without detailed reading tables')
  assert([...document.querySelectorAll('.vm-sensor h3')].map(node=>node.textContent).join('|') === 'Ammonia|Manure Moisture|Temperature|Humidity', 'Four Vet sensor summaries use the requested order')
  assert(document.querySelector('.vm-sensor[data-metric=ammonia] .vm-value').textContent.includes('85.0') && !document.querySelector('.vm-sensor[data-metric=temperature] .fd-badge--critical'), 'Current primary statuses are preserved; supporting values do not become primary alerts')
  assert(chart().data.datasets.flatMap(dataset=>dataset.data).filter(value=>value!=null).sort((a,b)=>a-b).join('|') === '3|6|10', 'Environmental Trend plots exactly the returned authorized historical measurements, not current cards')
  assert(vetSection('Monitoring Highlights').textContent.includes('10.0') && !vetSection('Monitoring Highlights').textContent.includes('42.0'), '24-hour highlights use only selected-range samples')
  await select('Current monitoring source', 'house:3')
  assert([...document.querySelectorAll('.vm-value')].every(node=>node.textContent === '—') && vetSection('Farm Monitoring Summary').textContent.includes('Offline'), 'Vet Offline source cannot display contradictory stale current values')
  await select('Current monitoring source', 'legacy:7')
  assert(document.querySelector('[aria-label="Current monitoring source"] option:checked').textContent.includes('House not recorded'), 'Legacy current source never becomes House 1')
  await select('Time range', '72'); await wait(() => chart()?.data.datasets.flatMap(dataset=>dataset.data).includes(42))
  assert(vetSection('Monitoring Highlights').textContent.includes('42.0') && vetSection('Monitoring Highlights').textContent.includes('Last 3 days'), 'Range change refreshes actual chart points and highlights together')
  await select('Historical monitoring device', '7'); await wait(() => chart()?.data.datasets.length === 1)
  assert(chart().data.datasets[0].label === 'Recorded legacy device' && chart().data.datasets[0].data.filter(value=>value!=null).join('|') === '3' && !vetSection('Environmental Trend').textContent.includes('House 1'), 'Historical device selection never inherits the current house placement')
  vetHistoryMode = 'delay'; vetHistoryReleases = []
  await select('Time range', '168'); await wait(() => vetHistoryReleases.length > 0)
  assert(!document.querySelector('.vm canvas') && vetSection('Monitoring Highlights').textContent.includes('Loading historical samples'), 'Prior-range chart/highlights are hidden while a new range loads')
  vetHistoryMode = 'normal'; vetHistoryReleases.forEach(release=>release()); await wait(() => chart())
  vetHistoryMode = 'error'; invalidateCache('/vet/farms/1/readings-history'); await wait(() => button('Retry historical readings'))
  assert(!document.querySelector('.vm canvas') && vetSection('Monitoring Highlights').textContent.includes('unavailable'), 'History errors cannot present old range highlights as accepted data')
  vetHistoryMode = 'normal'; button('Retry historical readings').click(); await wait(() => chart())
  await select('Current monitoring source', 'house:1')
  failRead = true; button('Refresh').click(); await wait(() => vetSection('Farm Monitoring Summary').querySelector('[role=alert]'))
  assert([...document.querySelectorAll('.vm-value')].every(node=>node.textContent === '—'), 'Failed current refresh clears all current card values')
  failRead = false; button('Refresh').click(); await wait(() => document.querySelector('.vm-value').textContent.includes('85.0'))
  vetHistoryMode = 'empty'; invalidateCache('/vet/farms/1/readings-history'); await wait(() => vetSection('Environmental Trend').textContent.includes('No readings recorded'))
  assert(vetSection('Monitoring Highlights').textContent.includes('No valid samples') && !document.querySelector('.vm canvas'), 'Empty history is not fabricated into a trend or condition')
  vetHistoryMode = 'delay'; vetHistoryReleases = []; invalidateCache('/vet/farms/1/readings-history'); await wait(() => vetHistoryReleases.length > 0)
  const oldHistoryReleases = vetHistoryReleases.slice(); vetHistoryMode = 'normal'; await vetView(2); await wait(() => chart()?.data.datasets[0]?.label === 'Second farm history')
  oldHistoryReleases.forEach(release=>release()); await sleep(60)
  assert(chart().data.datasets[0].label === 'Second farm history' && chart().data.datasets[0].data.includes(55), 'Late previous-farm history cannot replace the new farm trend')
  assert(!requests.some(request => request.method !== 'get') && !unexpected.length && !errors.length, 'All roles use only intercepted reads, without browser errors')
  passed.push('Vet read-only summary, sensor cards, sampled trend and range highlights preserve offline handling, real values and farm/device attribution')
  await direct(1, true, true)
  await select('Monitoring house', '3')
  assert(panel().querySelector('.hm-current-condition').textContent.includes('Offline'), 'Farmer clearly sees the selected device outage')
  assert([...panel().querySelectorAll('[data-metric] strong')].every(value => value.textContent === '—') && !panel().querySelector('[data-metric="ammonia"]').textContent.includes('Safe'), 'Offline stale Safe payload values never become current cards')
  await select('Monitoring house', '6')
  assert(panel().querySelector('.hm-current-condition').textContent.includes('No readings yet.'), 'A new period has a plain empty state')
  const empty = original.rows[5]
  original.rows[5] = { ...empty, connectivity: 'Online', current_reading: { ...reading(606), ammonia: null, moisture: null } }
  button('Refresh readings').click(); await wait(() => panel().querySelector('[data-metric="temperature"] strong').textContent !== '—')
  assert(panel().querySelector('[data-metric="ammonia"] strong').textContent === '—' && panel().querySelector('[data-metric="temperature"] strong').textContent.includes('45'), 'Fresh supporting values stay visible when primary values are missing; no primary Safe is invented')
  original.rows[5] = empty
  await select('Monitoring house', '4')
  assert(panel().querySelector('.hm-current-condition').textContent.includes('No device assigned'), 'An unmonitored house is distinct from an offline device')
  const prior = original.rows[3]
  original.rows.splice(3, 1)
  button('Refresh readings').click(); await sleep(150)
  assert([...panel().querySelectorAll('[data-metric] strong')].every(value => value.textContent === '—') && panel().textContent.includes('no longer available'), 'A removed selected house never falls through to another house current readings')
  original.rows.splice(3, 0, prior)
  passed.push('Farmer labels stay simple while Offline, empty and changed-house responses never invent current values')
  window.housePhase5Preview = async (view = 'cards') => {
    if (view === 'vet') { vetHistoryMode = 'normal'; await vetView(); await wait(() => chart()); window.scrollTo(0,0); await sleep(80); return }
    await direct(1, view === 'cards', view === 'cards')
    if (view === 'history') { button('Reading History').click(); await wait(() => panel().querySelector('[aria-label="Monitoring from date"]')) }
    window.scrollTo(0, 0); await sleep(80)
  }
  window.housePhase5Results = { passed }
} catch (error) { window.housePhase5Results = { passed, error: error.stack+'\nProgress: '+JSON.stringify(passed)+'\nUnexpected: '+JSON.stringify(unexpected)+'\nRuntime: '+JSON.stringify(errors)+'\nBody: '+document.body.textContent.slice(-1500), unexpected, errors } }
