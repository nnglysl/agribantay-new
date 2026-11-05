import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import PoultryHouses from '../src/components/PoultryHouses'
import { FarmEntry as AdminEntry } from '../src/pages/admin/Farms'
import { FarmEntry as SuperEntry } from '../src/pages/superadmin/Farms'
import { registerOwnerWithFarms } from '../src/utils/farmRegistration'
import api from '../src/api/axios'
import '../src/index.css'

const root = createRoot(document.querySelector('#root'))
const requests = [], passed = [], unexpected = [], runtimeErrors = []
window.addEventListener('error', event => runtimeErrors.push(event.message))
window.addEventListener('unhandledrejection', event => runtimeErrors.push(String(event.reason)))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const assert = (condition, message) => { if (!condition) throw Error(message) }
const wait = async predicate => { for (let i = 0; i < 200; i++) { if (predicate()) return; await sleep(20) } throw Error('House browser fixture timed out') }
const original = [
  { id: 11, house_number: 1, name: 'House 1', status: 'Active', assigned_devices: [{ id: 7, device_name: 'AGB-D01', status: 'Active' }, { id: 8, device_name: 'Repair D02', status: 'Inactive' }] },
  { id: 12, house_number: 2, name: 'House 2', status: 'Inactive', assigned_devices: [] },
]
const houses = new Map([[1, structuredClone(original)], [2, [{ id: 21, house_number: 1, name: 'House 1', status: 'Active', assigned_devices: [{ id: 9, device_name: 'Second Farm Device', status: 'Active' }] }]]])
const created = new Map()
let role = 'manager', loseAcknowledgement = false, delayFirstFarm = false, failRead = false, releaseFirstFarm, renderKey = 0
api.defaults.adapter = async config => {
  const body = config.data instanceof FormData ? Object.fromEntries(config.data) : JSON.parse(config.data || '{}')
  requests.push({ method: config.method, url: config.url, body })
  const response = data => ({ data, status: 200, statusText: 'OK', headers: {}, config })
  if (config.url === '/admin/farms-map') return response({ data: [] })
  if (config.url === '/admin/farms/check-location') return response({ data: { status: 'verified', ok: true } })
  if (config.url === '/admin/farm-owners') return response({ id: 901, delivered: true })
  const match = config.url.match(/^\/farms\/(\d+)\/poultry-houses(?:\/(\d+)\/(deactivate|reactivate))?$/)
  if (!match) { unexpected.push(config.url); throw Error('Unexpected fixture request') }
  const farmId = Number(match[1]), houseId = Number(match[2])
  const inventory = houses.get(farmId) || []
  if (config.method === 'get') {
    if (failRead) {
      const error = Error('Synthetic inventory refresh failed. Please refresh.')
      error.response = { status: 500, data: { message: error.message } }
      throw error
    }
    const data = { farm_id: farmId, available: farmId !== 4,
      inventory_status: farmId === 3 ? 'unverified' : farmId === 4 ? 'unavailable' : 'verified',
      can_manage: role === 'manager' && farmId < 3, houses: structuredClone(inventory),
      message: farmId === 3 ? 'House inventory has not been verified. Existing farm monitoring remains available.'
        : farmId === 4 ? 'Poultry house records are not available yet. Existing farm monitoring remains available.' : null }
    if (delayFirstFarm && farmId === 1) return new Promise(resolve => { releaseFirstFarm = () => resolve(response({ data })) })
    return response({ data })
  }
  if (config.method === 'post') {
    assert(role === 'manager' && farmId < 3, 'Only a manager with verified inventory may add a house')
    assert(/^[a-f0-9-]{36}$/.test(body.request_id), 'Each Add House request has a UUID')
    const key = farmId + ':' + body.request_id
    let house = created.get(key)
    const replayed = !!house
    if (!house) {
      const number = Math.max(...inventory.map(item => item.house_number)) + 1
      house = { id: 100 + number, house_number: number, name: `House ${number}`, status: 'Active', assigned_devices: [] }
      inventory.push(house); created.set(key, house)
    }
    if (loseAcknowledgement) { loseAcknowledgement = false; throw Error('Synthetic lost response after successful creation') }
    return response({ data: { house, replayed } })
  }
  if (config.method === 'patch') {
    const house = inventory.find(item => item.id === houseId)
    if (house.assigned_devices.length) {
      const error = Error('Explicitly unassign every Active and Inactive device first. No devices were unassigned.')
      error.response = { status: 422, data: { message: error.message } }
      throw error
    }
    house.status = match[3] === 'deactivate' ? 'Inactive' : 'Active'
    return response({ data: { house, replayed: false } })
  }
  throw Error('Unsupported fixture operation')
}

const section = () => document.querySelector('.ph-section')
const button = text => [...document.querySelectorAll('button')].find(element => element.textContent === text)
const row = number => [...document.querySelectorAll('.ph-section tbody tr')].find(element => element.cells[0].textContent === `House ${number}`)
const action = (number, text) => [...row(number).querySelectorAll('button')].find(element => element.textContent === text)
async function renderHouses(farmId = 1, selectedRole = 'manager') {
  role = selectedRole
  const previous = section()
  root.render(<PoultryHouses key={++renderKey} farmId={farmId} readOnly={selectedRole !== 'manager'} />)
  await wait(() => section() && section() !== previous && !section().textContent.includes('Loading houses'))
}
function EntryForm({ Entry }) {
  const [farm, setFarm] = useState({ localId: 'browser-farm', farm_name: 'Synthetic registration farm', farm_size: 'Small', house_count: 1,
    barangay: 'Calansayan', lot_number: '', street: '', landmark: '', latitude: 13.855, longitude: 121.093 })
  return <form onSubmit={event => { event.preventDefault(); registerOwnerWithFarms(api, { first_name: 'Synthetic', last_name: 'Owner', mobile_number: '09940000001', address: 'Synthetic address' }, null, [farm]) }}>
    <Entry index={0} farm={farm} isMobile={false} canRemove={false} onChange={(field, value) => setFarm(previous => ({ ...previous, [field]: value }))} />
    <button type="submit">Submit Fixture Registration</button>
  </form>
}
try {
  await renderHouses()
  assert(section().textContent.includes('Registered Poultry Houses: 2') && [...section().querySelectorAll('th')].some(element => element.textContent === 'Monitoring'), 'Registered count comes from actual inventory rows, with monitoring separate from lifecycle')
  assert(['House', 'Assigned Device', 'Status', 'Actions'].every(label => [...document.querySelectorAll('th')].some(element => element.textContent === label)), 'Use the requested compact columns')
  assert(row(1).textContent.includes('AGB-D01') && row(1).textContent.includes('Repair D02') && row(2).textContent.includes('No assigned device'), 'Show only recorded assignments, including Inactive associated devices')
  assert(![...section().querySelectorAll('button')].some(element => /Rename|Delete|Assign Device/.test(element.textContent)), 'No rename, delete, or Phase 4 assignment action')
  action(1, 'Deactivate House').click(); await wait(() => button('Confirm Deactivate'))
  const before = requests.length
  button('Cancel').click(); await sleep(30)
  assert(requests.length === before, 'Cancel must not mutate anything')
  passed.push('Compact inventory shows reliable assignments and offers only approved actions; cancel is read-only')
  action(1, 'Deactivate House').click(); await wait(() => button('Confirm Deactivate'))
  button('Confirm Deactivate').click(); await wait(() => section().textContent.includes('Explicitly unassign'))
  assert(houses.get(1)[0].status === 'Active' && houses.get(1)[0].assigned_devices.length === 2, 'Blocked deactivation must not unassign devices')
  button('Cancel').click()
  houses.get(1)[0].assigned_devices = [] // Test-only simulation of a separate explicit administrative unassignment.
  button('Refresh').click(); await wait(() => row(1)?.textContent.includes('No assigned device'))
  assert(row(1).cells[3].textContent === 'Not Monitored', 'An Active house without a device is Not Monitored, never Safe')
  action(1, 'Deactivate House').click(); await wait(() => button('Confirm Deactivate'))
  button('Confirm Deactivate').click(); await wait(() => action(1, 'Reactivate House'))
  action(1, 'Reactivate House').click(); await wait(() => button('Confirm Reactivate'))
  assert(section().textContent.includes('Previous device assignments will not be restored'), 'Explain reactivation without restoring assignments')
  button('Confirm Reactivate').click(); await wait(() => action(1, 'Deactivate House'))
  assert(row(1).textContent.includes('No assigned device'), 'Reactivation must leave the house unassigned')
  passed.push('Active and Inactive device blockers remain visible; deactivation and reactivation never change assignments')
  loseAcknowledgement = true
  button('Add House').click(); await wait(() => button('Retry Add House') && !button('Retry Add House').disabled)
  assert(houses.get(1).length === 3, 'Synthetic server committed one house before losing its reply')
  button('Retry Add House').click(); await wait(() => row(3))
  const adds = requests.filter(request => request.method === 'post' && request.url.endsWith('/poultry-houses'))
  assert(adds.length === 2 && adds[0].body.request_id === adds[1].body.request_id && houses.get(1).length === 3, 'Retry reuses the UUID and creates no duplicate')
  passed.push('A lost Add House acknowledgement retries the same UUID without duplicating House 3')
  failRead = true
  button('Refresh').click(); await wait(() => section().textContent.includes('Synthetic inventory refresh failed'))
  assert(!row(1) && !button('Add House'), 'A failed refresh must not leave stale inventory or management controls')
  failRead = false
  button('Refresh').click(); await wait(() => row(1))
  passed.push('Failed inventory refreshes clear stale rows and management controls until a successful reload')
  for (const reader of ['farmer', 'vet']) {
    await renderHouses(1, reader)
    assert(row(1) && !button('Add House') && !button('Deactivate House') && !button('Reactivate House'), `${reader} view contains no management controls`)
  }
  houses.set(5, [{ id: 51, house_number: 1, name: 'House 1', status: 'Active', assigned_devices: [] }]) // Isolated approved-inventory response only.
  await renderHouses(5, 'farmer')
  assert(section().textContent.includes('Registered Poultry Houses: 1') && row(1).textContent.includes('No assigned device') && row(1).cells[3].textContent === 'Not Monitored', 'An initialized fixture renders its real sole House 1 without an inferred device')
  await renderHouses(3)
  assert(section().textContent.includes('not been verified') && !row(1) && !button('Add House'), 'An unknown legacy inventory is not automatically House 1')
  await renderHouses(4)
  assert(section().textContent.includes('not available yet') && !row(1) && !button('Add House'), 'Unmigrated compatibility remains a readable empty state')
  passed.push('Farmer and Vet are read-only; legacy and unavailable inventories never fabricate houses')
  delayFirstFarm = true
  role = 'farmer'
  root.render(<PoultryHouses key={++renderKey} farmId={1} readOnly />)
  await wait(() => releaseFirstFarm)
  await renderHouses(2, 'farmer')
  releaseFirstFarm(); await sleep(60)
  assert(section().textContent.includes('Second Farm Device') && !section().textContent.includes('House 3'), 'A late first-farm response must not overwrite the second farm')
  delayFirstFarm = false
  passed.push('Switching farms ignores a late response from the previously selected farm')
  for (const [name, Entry] of [['Staff', AdminEntry], ['Super Admin', SuperEntry]]) {
    const previous = document.querySelector('input[type="number"]')
    root.render(<EntryForm key={name} Entry={Entry} />)
    await wait(() => document.querySelector('input[type="number"]') && document.querySelector('input[type="number"]') !== previous)
    const input = document.querySelector('input[type="number"]')
    assert(input.value === '1' && input.min === '1' && input.step === '1' && input.required, `${name} registration defaults to one required whole house`)
    assert(document.querySelector(`label[for="${input.id}"]`).textContent.includes('Number of Poultry Houses'), 'The count input has an accessible label')
    const setValue = value => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })) }
    setValue('0'); await sleep(30); assert(!input.checkValidity(), 'Zero houses must fail native validation')
    setValue('1.5'); await sleep(30); assert(!input.checkValidity(), 'Fractional house counts must fail native validation')
    setValue('3'); await sleep(30); assert(input.checkValidity(), 'A positive whole count is valid')
    const beforeSaves = requests.filter(request => request.url === '/admin/farm-owners').length
    button('Submit Fixture Registration').click()
    await wait(() => requests.filter(request => request.url === '/admin/farm-owners').length === beforeSaves + 1)
    assert(requests.filter(request => request.url === '/admin/farm-owners').at(-1).body['farms[0][house_count]'] === '3', 'Registration submits the selected count atomically')
  }
  passed.push('Staff and Super Admin registration forms require whole house counts and submit them with the farm')
  assert(unexpected.length === 0 && runtimeErrors.length === 0, 'No unexpected calls or runtime errors')
  assert(!requests.some(request => /sensors.*(assign|unassign)|sensor-readings/.test(request.url)), 'No Phase 4 or Phase 5 writes')
  window.housePhase3Results = { passed, unexpected, runtimeErrors }
  window.housePhase3Preview = async () => { houses.set(1, structuredClone(original)); await renderHouses(1); return true }
} catch (error) {
  window.housePhase3Results = { error: error.stack, passed, unexpected, runtimeErrors }
}
