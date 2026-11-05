import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import Devices from '../src/pages/admin/Devices'
import DeviceAssignmentDialog from '../src/components/DeviceAssignmentDialog'
import api from '../src/api/axios'
import { setAuth } from '../src/utils/auth'
import '../src/index.css'

const root = createRoot(document.querySelector('#root'))
const requests = [], passed = [], unexpected = [], runtimeErrors = []
window.addEventListener('error', event => runtimeErrors.push(event.message))
window.addEventListener('unhandledrejection', event => runtimeErrors.push(String(event.reason)))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const assert = (condition, message) => { if (!condition) throw Error(message) }
const wait = async predicate => { for (let i = 0; i < 200; i++) { if (predicate()) return; await sleep(20) } throw Error('Assignment fixture timed out') }
const farms = [1, 2, 3, 4].map(id => ({ id, farm_name: `Fixture Farm ${id}` }))
const devices = [{ id: 7, device_name: 'AGB-D01', farm_id: 1, farm_name: farms[0].farm_name, status: 'Active', connectivity: 'Offline', assignment_version: 10, device_key: 'PRIVATE-FIXTURE-KEY' }]
const house = (id, number, status = 'Active', assigned_devices = []) => ({ id, name: `House ${number}`, house_number: number, status, assigned_devices })
const inventory = new Map([[1, [house(11, 1, 'Active', [{ id: 8, device_name: 'AGB-D02', status: 'Active' }]), house(12, 2), house(13, 3), house(14, 4, 'Inactive')]], [2, [house(21, 1)]], [3, []], [4, [house(41, 1, 'Inactive')]]])
let loseResponse = false, rejectStale = false, delayFirstFarm = false, dummyApproved = false, releaseFirstFarm, renderKey = 0, edges = 0, lastPayload
api.defaults.adapter = async config => {
  const body = JSON.parse(config.data || '{}')
  requests.push({ method: config.method, url: config.url, body })
  const response = data => ({ data, status: 200, statusText: 'OK', headers: {}, config })
  if (config.url === '/admin/sensors') return response({ data: structuredClone(devices) })
  if (config.url === '/admin/farms') return response({ data: structuredClone(farms) })
  if (config.url === '/notifications') return response({ data: [], unread_count: 0, total_count: 0 })
  const match = config.url.match(/^\/farms\/(\d+)\/poultry-houses$/)
  if (match) {
    const farmId = Number(match[1])
    const data = { farm_id: farmId, available: true, inventory_status: farmId === 3 ? 'unverified' : 'verified', can_manage: farmId !== 3, houses: structuredClone(inventory.get(farmId)) }
    if (dummyApproved && farmId === 2) { data.inventory_status = 'dummy_approved'; data.message = 'User-approved dummy data; not a physically verified inventory.' }
    if (delayFirstFarm && farmId === 1) return new Promise(resolve => { releaseFirstFarm = () => resolve(response({ data })) })
    return response({ data })
  }
  if (config.method === 'patch' && config.url === '/admin/sensors/7/assign') {
    if (rejectStale) { const error = Error('This device assignment changed. Refresh the device and explicitly select the farm and house again.'); error.response = { status: 409, data: { message: error.message } }; throw error }
    assert(body.farm_id && body.poultry_house_id && Number.isInteger(body.expected_assignment_version), 'Every assignment requires an explicit complete versioned destination')
    if (JSON.stringify(body) !== lastPayload) {
      edges++; devices[0].assignment_version++; lastPayload = JSON.stringify(body)
      devices[0].farm_id = body.farm_id; devices[0].farm_name = farms.find(farm => farm.id === body.farm_id).farm_name
      devices[0].poultry_house_id = body.poultry_house_id; devices[0].house_name = inventory.get(body.farm_id).find(house => house.id === body.poultry_house_id).name
    }
    if (loseResponse) { loseResponse = false; throw Error('Synthetic lost success response') }
    return response({ data: structuredClone(devices[0]) })
  }
  unexpected.push(`${config.method} ${config.url}`); throw Error('Unexpected fixture request')
}
const dialog = () => document.querySelector('.device-assignment-dialog')
const farmSelect = () => document.querySelector('#device-assignment-farm')
const houseSelect = () => document.querySelector('#device-assignment-house')
const save = () => dialog()?.querySelector('[type=submit]')
const review = async () => {
  const writes = requests.filter(request => request.method === 'patch').length
  save().click()
  await wait(() => dialog()?.querySelector('[aria-label="Confirm device assignment"]'))
  assert(requests.filter(request => request.method === 'patch').length === writes, 'Review never writes before explicit confirmation')
  assert(dialog().textContent.includes('Earlier readings and alerts keep their recorded location'), 'Confirmation explains history preservation')
}
const button = text => [...document.querySelectorAll('button')].find(button => button.textContent === text)
const choose = async (element, value) => { element.value = String(value); element.dispatchEvent(new Event('change', { bubbles: true })); await sleep(30) }
const open = async () => { button('Change Assignment').click(); await wait(dialog) }
const close = async () => { button('Cancel').click(); await wait(() => !dialog()); await sleep(40) }
const select = async (farm, house) => { await choose(farmSelect(), farm); await wait(() => !houseSelect().disabled); if (house) await choose(houseSelect(), house) }
async function render(role = 'admin') {
  setAuth('synthetic-assignment-token', { id: 900, role, name: 'Synthetic Staff' })
  root.render(<MemoryRouter key={++renderKey}><Devices /></MemoryRouter>)
  await wait(() => button('Change Assignment') && !dialog())
}
try {
  await render()
  assert(document.body.textContent.includes('House not selected (legacy)') && !document.body.textContent.includes(devices[0].device_key), 'Legacy farm assignment never invents a house or reveals a key')
  await open()
  assert(farmSelect().value === '' && houseSelect().value === '' && save().disabled, 'Both choices start empty even for an assigned farm')
  await select(1)
  assert(houseSelect().value === '' && save().disabled, 'Fetching inventory never automatically selects House 1')
  assert(![...houseSelect().options].some(option => option.value === '14'), 'Inactive houses are excluded')
  assert([...houseSelect().options].find(option => option.value === '11').disabled, 'An occupied Active slot cannot be selected for an Active device')
  passed.push('Legacy identity stays masked; farm and Active house choices are explicit and occupancy-aware')

  await choose(houseSelect(), 12); await review(); save().click(); save()?.click()
  await wait(() => !dialog() && document.querySelector('tbody').textContent.includes('House 2'))
  assert(edges === 1 && requests.filter(request => request.method === 'patch').length === 1, 'Duplicate clicks issue one assignment')
  const first = requests.find(request => request.method === 'patch').body
  assert(first.farm_id === 1 && first.poultry_house_id === 12 && first.expected_assignment_version === 10, 'Save the chosen tuple and frozen device version')
  await open(); await select(1, 13); await review(); save().click(); await wait(() => !dialog())
  await open(); await select(2, 21); await review(); save().click(); await wait(() => !dialog() && document.querySelector('tbody').textContent.includes('Fixture Farm 2'))
  assert(edges === 3 && devices[0].device_key === 'PRIVATE-FIXTURE-KEY', 'Same-farm moves and cross-farm rotation retain physical identity')
  passed.push('Devices interface supports same-farm and cross-farm moves without duplicate submission or identity changes')

  await open(); await select(1, 12); await review(); loseResponse = true; save().click()
  await wait(() => button('Retry Assignment'))
  assert(farmSelect().disabled && houseSelect().disabled, 'An uncertain result freezes its destination for safe replay')
  const previous = requests.filter(request => request.method === 'patch').at(-1).body
  save().click(); await wait(() => !dialog())
  const replay = requests.filter(request => request.method === 'patch').at(-1).body
  assert(JSON.stringify(previous) === JSON.stringify(replay) && edges === 4, 'Lost-response retry preserves exact version and destination without another edge')
  passed.push('Lost success responses retain the exact assignment and allow a safe replay')

  await open(); await select(2, 21); await review(); rejectStale = true; save().click()
  await wait(() => dialog()?.textContent.includes('assignment changed'))
  assert(save().disabled && farmSelect().disabled, 'Stale versions cannot be silently resubmitted')
  await close(); rejectStale = false
  await open(); await choose(farmSelect(), 3); await wait(() => !dialog().textContent.includes('Loading verified'))
  assert(houseSelect().disabled && save().disabled && !houseSelect().value, 'Unverified inventory cannot be assigned or fabricated')
  assert(dialog().textContent.includes('No poultry houses are registered for this farm yet.') && houseSelect().options.length === 1, 'Empty inventory explains setup without a fake House 1')
  await choose(farmSelect(), 4); await wait(() => !houseSelect().disabled)
  assert(houseSelect().options.length === 1 && save().disabled, 'No Active houses means no assignment')
  await close()
  passed.push('Stale versions, unverified inventories and farms without Active houses block submission')

  await open(); delayFirstFarm = true; await choose(farmSelect(), 1); await wait(() => releaseFirstFarm)
  await choose(farmSelect(), 2); await wait(() => [...houseSelect().options].some(option => option.value === '21'))
  releaseFirstFarm(); await sleep(80)
  assert(farmSelect().value === '2' && ![...houseSelect().options].some(option => option.value === '12'), 'Late responses from another farm cannot cross the selection boundary')
  delayFirstFarm = false; await close()
  passed.push('Changing farms resets house selection and ignores obsolete inventory responses')

  dummyApproved = true
  await open(); await select(2)
  assert(houseSelect().value === '' && save().disabled && dialog().textContent.includes('not a physically verified inventory'), 'Approved dummy inventory remains explicitly selected and visibly distinguished from physical verification')
  await choose(houseSelect(), 21)
  assert(!save().disabled, 'An explicitly approved dummy house can be selected without fabricating assignment')
  await review()
  assert(dialog().textContent.includes('Fixture Farm 2 · House 1'), 'Confirmation identifies the exact farm and house')
  button('Back').click(); await wait(() => !dialog().querySelector('[aria-label="Confirm device assignment"]'))
  assert(!farmSelect().disabled && !houseSelect().disabled, 'Back permits explicit reselection without a write')
  await close(); dummyApproved = false
  passed.push('Approved dummy inventory is labelled as an assumption and never automatically selected')

  root.render(<DeviceAssignmentDialog key={++renderKey} device={{ ...devices[0], status: 'Inactive' }} farms={farms} onClose={() => {}} onSuccess={() => {}} />)
  await wait(() => dialog() && !farmSelect().value); await select(1)
  assert(![...houseSelect().options].find(option => option.value === '11').disabled && dialog().textContent.includes('Activation requires a free Active-device slot'), 'Inactive associations remain possible with an explicit activation constraint')
  assert(!unexpected.length && !runtimeErrors.length, 'Every API verb is intercepted and no browser errors occur')
  passed.push('Inactive association semantics are clear and every browser API operation uses synthetic data')
  window.housePhase4Preview = async () => {
    if (!dialog().querySelector('[aria-label="Confirm device assignment"]')) { await choose(houseSelect(), 12); await review() }
    await sleep(60); window.scrollTo(0, 0)
  }
  window.housePhase4Results = { passed }
} catch (error) { window.housePhase4Results = { passed, error: error.stack, unexpected, runtimeErrors } }
