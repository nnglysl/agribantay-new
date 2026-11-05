import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import FarmerDashboard from '../src/pages/farmowner/Dashboard'
import FarmContext from '../src/context/FarmContext'
import { clearAllCache } from '../src/hooks/useCachedFetch'
import { setAuth } from '../src/utils/auth'
import api from '../src/api/axios'
import '../src/index.css'

const root = createRoot(document.querySelector('#root')), passed = [], errors = [], unexpected = [], requests = []
window.addEventListener('error', e => errors.push(e.message))
window.addEventListener('unhandledrejection', e => errors.push(String(e.reason)))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const assert = (condition, message) => { if (!condition) throw Error(message) }
const wait = async test => { for (let i = 0; i < 300; i++) { if (test()) return; await sleep(20) } throw Error('Summary fixture timed out') }
// All samples, dates, classifications and recommendations here are intercepted test data only.
const house = (id, state) => ({ key: 'house:'+id, poultry_house_id: id, house_name: 'House '+id, house_status: state === 'Inactive' ? 'Inactive' : 'Active',
  device_status: ['Inactive', 'Not Monitored'].includes(state) ? null : 'Active', assignment_verified: !['Inactive', 'Not Monitored'].includes(state), state,
  connectivity: ['Safe', 'Critical', 'Warning', 'Incomplete Data'].includes(state) ? 'Online' : state === 'Offline' ? 'Offline' : 'Awaiting first reading',
  primary_assessment: { available_primary_metrics: ['ammonia', 'moisture'], incomplete_data: state === 'Incomplete Data' },
  current_reading: ['Safe', 'Critical', 'Warning', 'Incomplete Data'].includes(state) ? { ammonia: state === 'Critical' ? 40 : 4, ammonia_status: state === 'Critical' ? 'Critical' : 'Safe', moisture: state === 'Warning' ? 30 : 10, moisture_status: state === 'Warning' ? 'Warning' : 'Safe', temperature: 45, humidity: 90, recorded_at: '2026-11-02T03:50:00Z' } : null })
const payload = (states, condition, farm = 1) => ({ farm_id: farm, farm_name: 'Synthetic Farm '+farm, monitoring_assessment: { condition, reporting_devices: states.filter(s => ['Safe', 'Critical', 'Warning', 'Incomplete Data'].includes(s)).length, incomplete_data: states.some(s => ['Offline', 'Incomplete Data', 'No Readings Yet'].includes(s)) },
  house_monitoring: { farm_id: farm, inventory_status: 'verified', coverage: { known: true }, rows: states.map((s, i) => house(i + 1, s)) },
  cleanout_compliance: { status: 'Compliant', last_full_cleanout_date: 'Oct 02, 2026', due_date: 'Oct 02, 2027' } })
const mixed = payload(['Critical', 'Warning', 'Not Monitored', 'Inactive'], 'Critical')
let source = mixed, key = 0, setFarm, delayed = false, releases = [], failed = false
let environmentalAdvice = false, legacySuggestions = true
api.defaults.adapter = async config => {
  requests.push(config)
  assert(config.method === 'get', 'Summary must never mutate')
  const response = data => ({ data: { data }, status: 200, statusText: 'OK', config, headers: {} })
  if (config.url === '/notifications') return response([])
  if (['/farmer/dashboard', '/farmer/insights'].includes(config.url)) {
    const farm = Number(config.params.farm_id)
    const insight = { available: true,
      tips: environmentalAdvice ? ['Remove manure to reduce ammonia.', 'Replace wet litter and check drinkers.', 'Improve airflow and ventilation.', 'Improve drainage and remove standing water.', 'Provide shade and fresh water.'] : [`Existing farm ${farm} service advice.`, `Existing farm ${farm} service advice.`],
      service_suggestions: legacySuggestions ? [{ type: 'Odor Control Request', reason: 'Legacy fixture only.' }, { type: 'Fly Control Request', reason: 'Legacy fixture only.' }] : [],
    }
    if (environmentalAdvice) insight.tips_fil = insight.tips.map((_, index) => `Filipino advice ${index + 1}`)
    const data = config.url.endsWith('insights') ? insight : structuredClone(farm === 2 ? payload(['Safe'], 'Safe', 2) : source)
    if (failed && config.url.endsWith('dashboard')) throw Error('Synthetic summary request failed')
    if (delayed && farm === 1) return new Promise(resolve => releases.push(() => resolve(response(data))))
    return response(data)
  }
  unexpected.push(config.url); throw Error('Unexpected fixture GET')
}
function Fixture() {
  const [selectedFarmId, update] = useState(1); setFarm = update
  const farms = [{ id: 1, farm_name: 'Synthetic Farm 1' }, { id: 2, farm_name: 'Synthetic Farm 2' }]
  return <FarmContext.Provider value={{ selectedFarmId, selectedFarm: farms.find(farm => farm.id === selectedFarmId), setSelectedFarmId: update, farmsLoading: false, farms }}><MemoryRouter><FarmerDashboard /></MemoryRouter></FarmContext.Provider>
}
const dashboard = () => document.querySelector('.fdb')
const overview = () => [...document.querySelectorAll('.fdb-overview tbody tr')]
const counts = () => [...document.querySelectorAll('.fdb-stat strong')].map(node => node.textContent)
async function render(data) { source = data; clearAllCache(); root.render(<Fixture key={++key} />); await wait(() => dashboard() && overview().length === data.house_monitoring.rows.filter(r => r.poultry_house_id != null).length); await sleep(70) }
try {
  setAuth('synthetic-summary-token', { id: 10, role: 'farm_owner', first_name: 'Synthetic', last_name: 'Farmer' })
  await render(mixed)
  assert(JSON.stringify(counts()) === JSON.stringify(['4', '1', '1', '1']), 'Four cards count registered houses including Inactive, and eligible Active states exactly')
  assert(overview()[0].textContent.includes('Ammonia is high') && overview()[1].textContent.includes('Manure moisture is high'), 'Main issues use the correct house primary statuses')
  assert(!dashboard().querySelector('select,[data-metric],canvas') && !dashboard().textContent.includes('40 ppm') && document.querySelector('.agb-farm-selector'), 'Dashboard has no house selector or detailed readings and preserves the existing farm selector')
  assert(document.querySelector('.fdb-priority').textContent.includes('House 1, House 2'), 'Critical is prioritized before Warning')
  assert(document.querySelectorAll('.fdb-recommendations li').length === 1 && document.querySelector('.fdb-recommendations').textContent.includes('Farm-level advice'), 'Existing service advice is deduplicated and not falsely house-attributed')
  assert(!dashboard().textContent.includes('View Farm Readings') && document.querySelector('.agb-sidebar nav').textContent.includes('Farm Readings'), 'The redundant readings card is removed while sidebar access remains')
  assert(document.querySelector('.annual-compliance').textContent.includes('Oct 02, 2027') && dashboard().textContent.includes('Last full clean-out: Oct 02, 2026'), 'Compliance keeps its own backend status/dates')
  passed.push('Summary layout, counts, main issues, Critical priority and honest farm-level recommendations')
  environmentalAdvice = true
  await render(mixed)
  const moreAdvice = () => [...document.querySelectorAll('button')].find(button => button.textContent === 'Show all recommendations').click()
  moreAdvice(); await sleep(30)
  const advice = document.querySelector('.fdb-recommendations').textContent
  assert(document.querySelectorAll('.fdb-recommendations li').length === 5 && advice.includes('ammonia') && advice.includes('wet litter') && advice.includes('ventilation') && advice.includes('drainage') && advice.includes('fresh water') && advice.includes('Filipino advice 5'), 'Keep all valid environmental/manure advice and translations')
  assert(!advice.includes('Odor Control Request') && !advice.includes('Fly Control Request'), 'Retired API suggestions do not appear as current Farmer actions')
  legacySuggestions = false
  await render(mixed); moreAdvice(); await sleep(30)
  assert(document.querySelector('.fdb-recommendations').textContent === advice, 'Removing only unused service_suggestions from a synthetic response does not change displayed advice or translations')
  environmentalAdvice = false; legacySuggestions = true
  passed.push('Valid environmental advice and translations are identical with and without retired API service suggestions')

  for (const [states, condition] of [[['Safe', 'Safe'], 'Safe'], [['Critical', 'Offline'], 'Critical'], [['Safe', 'Offline'], 'Incomplete Data'], [['Offline', 'Offline'], 'Offline'], [['Not Monitored'], 'Pending Setup'], [['No Readings Yet'], 'No Readings Yet'], [['Incomplete Data'], 'Incomplete Data'], [['Inactive'], 'Pending Setup'], [[], 'Pending Setup']]) {
    await render(payload(states, condition))
    assert(overview().length === states.length && document.querySelector('.fdb-condition').textContent.includes(condition === 'Incomplete Data' ? 'Incomplete Monitoring' : condition), 'Actual API condition stays authoritative: '+condition)
    if (states.includes('Offline')) assert(dashboard().textContent.includes(condition === 'Critical' ? 'Monitoring incomplete.' : condition === 'Offline' ? 'Current conditions are unknown.' : 'Some readings are missing.') && document.querySelector('.fdb-device-help').textContent.includes('power and connection'), 'Offline availability is explicit, separate from environmental advice')
    if (states.every(s => !['Safe', 'Critical', 'Warning', 'Incomplete Data'].includes(s))) assert(!document.querySelector('.fdb-recommendations li'), 'No current records means no current environmental advice')
    if (states.length === 1 && states[0] === 'Not Monitored') assert(JSON.stringify(counts()) === JSON.stringify(['1', '0', '0', '1']) && !dashboard().textContent.includes('Monitoring incomplete.') && !dashboard().textContent.includes('Incomplete Monitoring'), 'One unequipped house is Not Monitored, not an incomplete measurement or Safe')
  }
  passed.push('Safe, mixed severity, Offline, unmonitored, incomplete, awaiting readings and no Active houses')

  const legacy = payload([], 'Safe'); legacy.house_monitoring.inventory_status = 'unavailable'; legacy.house_monitoring.coverage.known = false
  legacy.house_monitoring.rows.push({ ...house(7, 'Safe'), poultry_house_id: null, house_name: 'House not recorded' })
  await render(legacy)
  assert(counts().every(v => v === '—') && overview().length === 0 && dashboard().textContent.includes('Historical farm-level readings remain') && !dashboard().textContent.includes('House records unavailable'), 'Unavailable inventory and legacy monitoring never invent House 1 or zero known houses, and explain unavailable inventory only once')
  assert(document.querySelector('.fdb-empty').textContent.includes('Farm Readings in the sidebar'), 'Unavailable inventory explains access to existing farm-level history')
  passed.push('Unavailable and legacy inventories remain distinct from registered houses')

  clearAllCache(); delayed = true; releases = []; root.render(<Fixture key={++key} />)
  await wait(() => releases.length === 2); setFarm(2)
  await wait(() => dashboard()?.textContent.includes('Existing farm 2 service advice.'))
  for (const release of releases) release(); await sleep(150)
  assert(counts()[0] === '1' && !dashboard().textContent.includes('farm 1 service advice') && document.querySelector('.fdb-condition .fdb-badge').textContent === 'Safe', 'Late earlier-farm summary and recommendations cannot leak to selected farm')
  delayed = false
  passed.push('Both dashboard and insight requests reject late previous-farm results')

  failed = true; clearAllCache(); root.render(<Fixture key={++key} />)
  await wait(() => document.querySelector('.fdb-state[role="alert"]'))
  assert(!dashboard(), 'A failed summary is not replaced by fabricated values')
  failed = false; [...document.querySelectorAll('button')].find(b => b.textContent === 'Retry Dashboard').click()
  await wait(dashboard)
  assert(!unexpected.length && !errors.length && requests.every(r => r.method === 'get'), 'All verbs are intercepted and no runtime errors occur')
  passed.push('Failure/retry is explicit and every request stays read-only inside browser fixtures')
  window.farmerSummaryPreview = async (empty = false) => {
    const data = empty ? { ...payload([], 'Unavailable'), house_monitoring: { farm_id: 1, inventory_status: 'unavailable', coverage: { known: false }, rows: [] } } : mixed
    if (source !== data) await render(data)
    window.scrollTo(0, 0); await sleep(80)
  }
  window.farmerSummaryResults = { passed }
} catch (error) { window.farmerSummaryResults = { passed, error: error.stack, unexpected, errors } }
