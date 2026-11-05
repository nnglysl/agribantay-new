import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import FarmerReadings from '../src/pages/farmowner/Readings'
import FarmContext from '../src/context/FarmContext'
import { clearAllCache, invalidateCache } from '../src/hooks/useCachedFetch'
import { setAuth } from '../src/utils/auth'
import api from '../src/api/axios'
import '../src/index.css'

// All identities, values, dates and conditions are synthetic; every API call is intercepted.
const root = createRoot(document.querySelector('#root')), passed = [], errors = [], unexpected = [], requests = []
window.addEventListener('error', event => errors.push(event.message))
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const assert = (value, message) => { if (!value) throw Error(message) }
const wait = async (predicate, name = 'readings') => { for (let i = 0; i < 350; i++) { if (predicate()) return; await sleep(20) } throw Error('Timed out: ' + name) }
const sample = (id, condition = 'Safe') => ({ id, farm_id: 1, sensor_id: id % 31 === 0 ? null : id % 7 === 0 ? 999 : id % 6 + 1,
  poultry_house_id: id % 4 === 0 ? null : id % 61 + 1, house_name: 'House ' + (id % 61 + 1), device_name: 'Recorded device ' + (id % 7 === 0 ? 999 : id % 6 + 1),
  ammonia: condition === 'No Readings Yet' ? null : condition === 'Critical' ? 85 : 4, ammonia_status: condition === 'Critical' ? 'Critical' : 'Safe', moisture: ['Incomplete Data', 'No Readings Yet'].includes(condition) ? null : 10, moisture_status: condition === 'Warning' ? 'Warning' : 'Safe',
  temperature: 32, humidity: 65, recorded_at: id % 3 === 0 ? '2026-10-31T16:10:00Z' : '2026-11-01T16:10:00Z', primary_assessment: { condition } })
const currentRow = (id, state = 'Safe') => ({ key: 'house:' + id, poultry_house_id: id, house_name: 'House ' + id, house_status: 'Active', device_id: id, device_name: 'AGB-FIXTURE-' + id,
  state, connectivity: ['Safe', 'Warning', 'Critical', 'Incomplete Data'].includes(state) ? 'Online' : state === 'Offline' ? 'Offline' : 'Awaiting first reading',
  current_reading: ['Safe', 'Warning', 'Critical', 'Incomplete Data', 'Offline'].includes(state) ? sample(id, state === 'Offline' ? 'Critical' : state) : null,
  last_reading: state === 'Offline' ? sample(id, 'Critical') : null })
const original = { farm_id: 1, inventory_status: 'verified', farm_assessment: { condition: 'Critical' }, rows: Array.from({ length: 61 }, (_, i) => currentRow(i + 1, ['Offline', 'Pending Setup', 'Not Monitored', 'Incomplete Data', 'No Readings Yet', 'Critical', 'Warning', 'Safe', 'Safe'][i % 9])) }
original.rows[60] = { ...original.rows[60], key: 'legacy:61', poultry_house_id: null, house_name: 'House not recorded' }
const second = { farm_id: 2, inventory_status: 'unavailable', farm_assessment: { condition: 'Safe' }, rows: [{ ...currentRow(201), key: 'legacy:201', poultry_house_id: null, house_name: 'House not recorded', device_name: 'Farm 2 device' }] }
const unavailable = { farm_id: 1, inventory_status: 'unavailable', farm_assessment: { condition: 'Offline' }, rows: [{ ...currentRow(61, 'Offline'), key: 'legacy:61', poultry_house_id: null, house_name: 'House not recorded' }] }
const historyRows = Array.from({ length: 125 }, (_, index) => sample(index + 1, ['Safe', 'Warning', 'Critical', 'Incomplete Data', 'No Readings Yet'][index % 5]))
const sortHistory = rows => [...rows].sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at) || b.id - a.id)
const manilaDay = value => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
let currentSource = original, key = 0, setFarm, failCurrent = false, failHistory = false, historyLimit = 125, foreignHistory = false, delayHistory = false, releases = []
const filteredHistory = (params = {}, farm = 1) => sortHistory((farm === 2 ? historyRows.slice(0, 4).map(row => ({ ...row, id: row.id + 2000, farm_id: 2, poultry_house_id: null, device_name: 'Farm 2 recorded device' })) : historyRows.slice(0, historyLimit)).filter(row =>
  (!params.poultry_house_id || String(row.poultry_house_id ?? 'unknown') === params.poultry_house_id)
  && (!params.sensor_id || String(row.sensor_id ?? 'unknown') === params.sensor_id)
  && (!params.from || manilaDay(row.recorded_at) >= params.from)
  && (!params.to || manilaDay(row.recorded_at) <= params.to)))
api.defaults.adapter = async config => {
  assert(config.method === 'get', 'Farmer Readings sends only GET requests')
  requests.push(config)
  const response = data => ({ data: { data }, status: 200, statusText: 'OK', headers: {}, config })
  if (config.url === '/notifications') return response([])
  const match = config.url.match(/^\/farms\/(\d+)\/(house-monitoring|house-readings)$/)
  if (!match) { unexpected.push(config.url); throw Error('Unexpected request ' + config.url) }
  const farm = Number(match[1])
  if (match[2] === 'house-monitoring') {
    if (failCurrent) throw Error('Synthetic current failure')
    return response(structuredClone(farm === 2 ? second : currentSource))
  }
  if (failHistory) throw Error('Synthetic history failure')
  const params = config.params, size = Number(params.per_page), selected = filteredHistory(params, farm)
  assert(!Object.hasOwn(params, 'condition'), 'History never sends a hidden Condition filter')
  assert([10, 25, 50].includes(size), 'History always uses a bounded supported page size')
  const pages = Math.max(1, Math.ceil(selected.length / size)), page = Math.min(Number(params.page), pages)
  const data = { farm_id: foreignHistory ? 2 : farm, query_key: params.query_key, total: selected.length, current_page: page, last_page: pages, per_page: size,
    items: selected.slice((page - 1) * size, page * size), devices: [1, 2, 3, 4, 5, 6, 999].map(id => ({ id, device_name: 'Recorded device ' + id })) }
  if (delayHistory && farm === 1) return new Promise(resolve => releases.push(() => resolve(response(data))))
  return response(data)
}

export function Fixture() {
  const [selectedFarmId, changeFarm] = useState(1); setFarm = changeFarm
  const farms = [{ id: 1, farm_name: 'Synthetic Farm A' }, { id: 2, farm_name: 'Synthetic Farm B' }]
  return <FarmContext.Provider value={{ selectedFarmId, selectedFarm: farms.find(farm => farm.id === selectedFarmId), setSelectedFarmId: changeFarm, farms, farmsLoading: false }}><MemoryRouter initialEntries={['/farmowner/readings']}><FarmerReadings /></MemoryRouter></FarmContext.Provider>
}
const panel = () => document.querySelector('.fr-panel:not([hidden])')
const tableRows = () => [...(panel()?.querySelectorAll('tbody tr') || [])]
const tab = index => document.querySelectorAll('.fr [role="tab"]')[index]
const select = async (label, value) => { const node = panel().querySelector(`[aria-label="${label}"]`); assert(node, 'Select exists: ' + label); node.value = value; node.dispatchEvent(new Event('change', { bubbles: true })); await sleep(40) }
const input = async (label, value) => { const node = panel().querySelector(`[aria-label="${label}"]`); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new Event('change', { bubbles: true })); node.dispatchEvent(new Event('input', { bubbles: true })); await sleep(30) }
const button = text => {
  const node = [...panel().querySelectorAll('button')].find(node => node.textContent === text || node.getAttribute('aria-label') === text)
  assert(node, `Button "${text}" is available in ${panel().querySelector('h2')?.textContent}`)
  return node
}
const apply = async () => { button('Apply Filters').click(); await sleep(40); await wait(() => !panel().querySelector('.fr-message[role="status"]'), 'filter results') }
async function render() { clearAllCache(); root.render(<Fixture key={++key} />); await wait(() => document.querySelector('.fr') && (tableRows().length || panel()?.querySelector('.fr-empty, [role="alert"]')), 'initial render'); await sleep(40) }
const ids = () => tableRows().map(row => Number(row.dataset.readingId))
const historyRequests = () => requests.filter(request => request.url.endsWith('/house-readings'))

try {
  setAuth('synthetic-farmer-readings', { id: 1, role: 'farm_owner', first_name: 'Synthetic', last_name: 'Farmer' })
  await render()
  assert(document.querySelector('.agb-farm-selector') && tab(0).getAttribute('aria-selected') === 'true' && tableRows().length === 10, 'Current tab and existing farm selector load with ten rows')
  assert(!document.querySelector('[aria-label="Monitoring view"], canvas, .hm-cards') && historyRequests().length === 0, 'No View dropdown, charts, sensor cards or eager history download')
  assert(!document.querySelector('[aria-label="Current condition"],[aria-label="History condition"]') && panel().querySelector('thead').textContent.includes('Condition'), 'Condition filters are absent while the Condition column remains')
  assert(panel().querySelectorAll('.fr-badge--offline,.fr-badge--critical,.fr-badge--warning,.fr-badge--safe').length > 0, 'Existing monitoring status badges remain visible')
  assert(tableRows()[0].querySelectorAll('td')[1].textContent === '—' && tableRows()[0].textContent.includes('Offline') && tableRows()[0].textContent.includes('Last recorded'), 'Offline stale Critical values are hidden, original last timestamp is retained')
  assert(tableRows()[1].textContent.includes('Pending Setup') && !tableRows()[1].textContent.includes('85'), 'Pending setup never appears Safe or live')
  assert(JSON.stringify([...panel().querySelector('[aria-label="Rows per page"]').options].map(option => option.value)) === JSON.stringify(['10', '25', '50']), 'Existing shared page-size choices are retained')
  assert(button('Previous').disabled && !button('Next').disabled, 'First page navigation states are accurate')
  button('Next').click(); await wait(() => tableRows()[0]?.textContent.includes('House 11'))
  assert(panel().textContent.includes('Showing 11–20 of 61 records'), 'Current pagination shows the correct range')
  await select('Rows per page', '25'); assert(tableRows().length === 25 && panel().textContent.includes('Showing 1–25 of 61 records'), 'Current size changes reset to page one')
  await select('Rows per page', '10'); button('Next').click(); await wait(() => tableRows()[0]?.textContent.includes('House 11'))
  passed.push('Current readings suppress stale values, preserve Pending Setup, and use bounded shared pagination')

  tab(1).click(); await wait(() => tableRows()[0]?.dataset.readingId, 'history first page')
  assert(!panel().querySelector('[aria-label="History condition"]') && panel().querySelectorAll('.fr-badge').length === 10, 'History keeps condition badges without a Condition dropdown')
  const expected = sortHistory(historyRows).map(row => row.id)
  assert(JSON.stringify(ids()) === JSON.stringify(expected.slice(0, 10)), 'History is newest-first with stable ID tie breaking')
  assert(panel().querySelector('thead th').textContent === 'Date / Time' && tableRows()[0].textContent.includes('November 2, 2026'), 'History begins with original timestamps in Asia/Manila')
  button('Next').click(); await wait(() => ids()[0] === expected[10])
  await select('Rows per page', '25'); await wait(() => tableRows().length === 25)
  assert(ids()[0] === expected[0] && historyRequests().at(-1).params.page === 1, 'History size change resets to page one on the server')
  await select('Rows per page', '50'); await wait(() => tableRows().length === 50)
  tab(0).click(); await wait(() => tableRows()[0]?.textContent.includes('House 11'))
  assert(panel().querySelector('[aria-label="Rows per page"]').value === '10', 'Current and history page sizes are independent')
  tab(1).click(); await wait(() => tableRows().length === 50)
  passed.push('History uses server pagination, deterministic order, Manila timestamps and independent tab state')

  await input('From date', '2026-11-02'); await input('To date', '2026-11-02')
  await select('History house or device', 'device:999'); await apply()
  const params = historyRequests().at(-1).params
  assert(params.from === '2026-11-02' && params.to === '2026-11-02' && params.sensor_id === '999' && !Object.hasOwn(params, 'condition'), 'Date and device filters are sent together without Condition')
  assert(JSON.stringify(ids()) === JSON.stringify(filteredHistory(params).map(row => row.id)), 'Date and device filters retain every recorded condition in the authorized dataset')
  assert(!panel().querySelector('[aria-label="Pagination"]') && panel().textContent.includes('records'), 'A single page does not show redundant page buttons')
  button('Reset').click(); await wait(() => tableRows().length === 50)
  await select('History house or device', 'house:unknown'); await apply()
  assert(tableRows().length === 31 && tableRows().every(row => row.textContent.includes('Farm-level reading')) && !tableRows().some(row => row.textContent.includes('House 1')), 'Legacy farm-level readings are not attributed to House 1')
  button('Reset').click(); await wait(() => tableRows().length === 50)
  await select('History house or device', 'house:11'); await apply()
  assert(tableRows().every(row => row.textContent.includes('House 11')) && historyRequests().at(-1).params.poultry_house_id === '11', 'House filtering uses the original recorded house')
  button('Reset').click(); await wait(() => tableRows().length === 50)
  await input('From date', '2027-01-01'); await input('To date', '2027-01-02'); await apply()
  assert(panel().querySelector('.fr-empty').textContent.includes('No historical readings found') && !tableRows().length, 'Empty history results are explicit')
  passed.push('Date and house/device filters preserve all recorded conditions, attribution and empty results')

  await render(); tab(0).focus(); tab(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })); await wait(() => tab(1).getAttribute('aria-selected') === 'true' && tableRows()[0]?.dataset.readingId)
  assert(document.activeElement === tab(1) && panel().getAttribute('aria-labelledby') === tab(1).id && tab(0).tabIndex === -1, 'Keyboard tabs keep selected focus and ARIA associations')
  tab(1).dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); await wait(() => tab(0).getAttribute('aria-selected') === 'true')
  await select('Current house or device', 'device:1')
  assert(tableRows().length === 1 && tableRows()[0].querySelector('.fr-badge--offline') && tableRows()[0].querySelectorAll('td')[1].textContent === '—' && !panel().querySelector('[aria-label="Pagination"]'), 'Device filtering preserves Offline status, hides stale values and hides one-page navigation')
  passed.push('Tabs are keyboard accessible and current filters remain separate from history filters')

  await render(); tab(1).click(); await wait(() => tableRows()[0]?.dataset.readingId); button('Next').click(); await wait(() => ids()[0] === expected[10])
  historyLimit = 7; invalidateCache('/farms/1/house-readings'); await wait(() => tableRows().length === 7)
  assert(panel().textContent.includes('Showing 1–7 of 7 records') && !panel().querySelector('[aria-label="Pagination"]'), 'Shrinking results clamp an out-of-range page to the correct server page')
  historyLimit = 125; failHistory = true; invalidateCache('/farms/1/house-readings'); await wait(() => panel().querySelector('[role="alert"]'))
  assert(!tableRows().length, 'History errors do not leave stale rows visible')
  failHistory = false; button('Retry history').click(); await wait(() => tableRows().length === 10)
  failCurrent = true; tab(0).click(); await wait(() => tab(0).getAttribute('aria-selected') === 'true'); button('Refresh').click(); await wait(() => panel().querySelector('[role="alert"]'))
  assert(!tableRows().length, 'Current refresh errors remove stale values')
  failCurrent = false; button('Retry current readings').click(); await wait(() => tableRows().length === 10)
  passed.push('Out-of-range pages, API errors and retries clear stale rows and recover correctly')

  currentSource = unavailable; await render()
  assert(tableRows().length === 1 && panel().textContent.includes('Farm device — no house recorded') && panel().querySelector('.fr-panel-heading').textContent.includes('Offline'), 'Unavailable inventory still shows the actual legacy device and prominent Offline status')
  tab(1).click(); await wait(() => tableRows()[0]?.dataset.readingId)
  assert(tableRows().length === 10, 'Historical data remains reachable without house inventory')
  currentSource = { farm_id: 1, inventory_status: 'unavailable', farm_assessment: { condition: 'Pending Setup' }, rows: [] }; await render()
  assert(panel().textContent.includes('Pending Setup') && panel().textContent.includes('No current readings found') && !panel().querySelector('[aria-label="Pagination"]'), 'Empty current monitoring is distinct from Safe')
  currentSource = original
  passed.push('Offline farm-level history, unavailable inventory and empty Pending Setup states remain honest')

  await render(); delayHistory = true; releases = []; tab(1).click(); await wait(() => releases.length > 0)
  assert(!tableRows().length && panel().textContent.includes('Loading reading history'), 'Loading history never displays another view’s rows')
  setFarm(2); await wait(() => tableRows()[0]?.textContent.includes('Farm 2 device'))
  releases.forEach(release => release()); delayHistory = false; await sleep(100)
  assert(tableRows().length === 1 && tab(0).getAttribute('aria-selected') === 'true' && !panel().textContent.includes('House 1'), 'Late old-farm responses and tab filters cannot leak into the new farm')
  tab(1).click(); await wait(() => tableRows().length === 4)
  assert(ids().every(id => id > 2000), 'Second farm history contains only its own records')
  foreignHistory = true; await render(); tab(1).click(); await wait(() => panel().querySelector('[role="alert"]'))
  assert(!tableRows().length && panel().textContent.includes('did not match the selected farm'), 'A foreign-farm history response is rejected')
  foreignHistory = false
  assert(!unexpected.length && !errors.length && requests.every(request => request.method === 'get'), 'Every application request is intercepted and read-only, with no runtime errors')
  passed.push('Multiple farms, delayed responses and invalid response identities preserve Farmer isolation')

  window.farmerReadingsPreview = async (view = 'current') => {
    currentSource = view === 'offline' ? unavailable : original
    failCurrent = false; failHistory = false; historyLimit = 125; foreignHistory = false
    await render()
    if (view === 'history') { tab(1).click(); await wait(() => tableRows()[0]?.dataset.readingId) }
    window.scrollTo(0, 0); await sleep(80)
  }
  window.farmerReadingsResults = { passed }
} catch (error) { window.farmerReadingsResults = { passed, error: error.stack, errors, unexpected, lastRequests: requests.slice(-5).map(request => ({ url: request.url, params: request.params })) } }
