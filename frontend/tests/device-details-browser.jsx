import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import '../src/index.css'
import Devices from '../src/pages/admin/Devices'
import DeviceKeyField from '../src/components/DeviceKeyField'
import api from '../src/api/axios'
import { setAuth } from '../src/utils/auth'

// Synthetic inventory only. The adapter intercepts every API verb.
const devices = [
  { id: 1, device_name: 'AGB-D01', farm_id: 1, farm_name: 'Fixture Farm', connectivity: 'Offline', status: 'Active', installed_at: 'Sep 24, 2026', last_seen_at: 'Oct 31, 2026, 1:43 AM', device_key: 'FIXTURE-DEVICE-KEY-ONE' },
  { id: 2, device_name: 'AGB-D02', farm_id: null, farm_name: null, connectivity: 'Online', status: 'Inactive', installed_at: null, last_seen_at: null, device_key: 'FIXTURE-DEVICE-KEY-TWO' },
]
const requests = [], unexpected = [], runtimeErrors = [], copied = []
window.addEventListener('error', event => runtimeErrors.push(event.message))
window.addEventListener('unhandledrejection', event => runtimeErrors.push(String(event.reason)))
api.defaults.adapter = async config => {
  requests.push({ method: config.method, url: config.url })
  let data
  if (config.method === 'get' && config.url === '/admin/sensors') data = { data: structuredClone(devices) }
  else if (config.method === 'get' && config.url === '/admin/farms') data = { data: [{ id: 1, farm_name: 'Fixture Farm' }] }
  else if (config.method === 'get' && config.url === '/notifications') data = { data: [], total_count: 0, unread_count: 0 }
  else { unexpected.push(`${config.method} ${config.url}`); throw Error('Unexpected fixture request') }
  return { data, status: 200, statusText: 'OK', headers: {}, config }
}
Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => copied.push(value) } })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const assert = (condition, message) => { if (!condition) throw Error(message) }
const wait = async predicate => { for (let i = 0; i < 100; i++) { if (predicate()) return; await sleep(20) } throw Error('Device fixture timed out') }
const root = createRoot(document.querySelector('#root'))
const modal = () => document.querySelector('[role="dialog"]')
const close = () => document.querySelector('[aria-label="Close Device Details"]')
const view = (index = 0) => [...document.querySelectorAll('tbody button')].filter(button => button.textContent === 'View')[index]
const key = (value, shiftKey = false) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true }))
const open = async (index = 0) => { const trigger = view(index); trigger.focus(); trigger.click(); await wait(modal); return trigger }
const render = async (role = 'admin') => {
  const previous = view()
  setAuth('isolated-device-fixture', { id: 900, role, name: 'UI Fixture' })
  root.render(<StrictMode><MemoryRouter key={role}><Devices /></MemoryRouter></StrictMode>)
  await wait(() => view() && view() !== previous && !modal())
}
const passed = []
try {
  await render()
  let trigger = await open()
  assert(close() && document.activeElement === close(), 'Header X must receive initial focus')
  assert([...modal().querySelectorAll('button')].map(button => button.textContent).join('|') === '×|Show|Copy', 'Only the header X and original key controls are visible')
  for (const value of ['Device Details', 'AGB-D01', 'Assigned Farm', 'Fixture Farm', 'Device State', 'Offline', 'Active', 'Installed', 'Sep 24, 2026', 'Last Seen', 'Oct 31, 2026, 1:43 AM']) {
    assert(modal().textContent.includes(value), 'Retain device information: '+value)
  }
  assert(modal().querySelectorAll('.device-details-badge').length === 1 && modal().querySelector('.device-details-header [aria-label="Connectivity: Offline"]'), 'The header has exactly one connectivity badge')
  assert([...modal().querySelectorAll('dt')].map(field => field.textContent).join('|') === 'Assigned Farm|Poultry House|Device State|Installed|Last Seen', 'Device State is plain information and connectivity is not repeated')
  assert(!modal().textContent.includes(devices[0].device_key), 'The Device Key stays masked by default')
  const box = close().getBoundingClientRect()
  assert(box.width >= 44 && box.height >= 44, 'Header X has a comfortable clickable area')
  close().click(); await wait(() => !modal())
  assert(document.activeElement === trigger, 'X dismissal returns focus to the same View button')
  passed.push('Header X is the only closing control, with a 44px target and retained device fields')

  trigger = await open()
  key('Escape'); await wait(() => !modal())
  assert(document.activeElement === trigger, 'Escape returns focus to View')
  assert(document.body.style.overflow !== 'hidden', 'Closing restores page scrolling')
  trigger = await open()
  modal().click(); await sleep(25)
  assert(modal(), 'Clicking inside the modal must keep it open')
  modal().parentElement.click(); await wait(() => !modal())
  assert(document.activeElement === trigger, 'Outside-click dismissal returns focus to View')
  passed.push('Escape and existing outside-click dismissal restore View focus and page scrolling')

  trigger = await open()
  key('Tab', true)
  assert(document.activeElement.getAttribute('aria-label') === 'Copy Device Key', 'Shift+Tab stays inside the modal')
  key('Tab')
  assert(document.activeElement === close(), 'Tab cycles back to the header X')
  assert(getComputedStyle(close()).outlineColor === 'rgb(107, 119, 112)', 'Keyboard focus uses a neutral outline instead of green')
  document.querySelector('[aria-label="Show Device Key"]').click(); await wait(() => modal().textContent.includes(devices[0].device_key))
  document.querySelector('[aria-label="Hide Device Key"]').click(); await wait(() => !modal().textContent.includes(devices[0].device_key))
  document.querySelector('[aria-label="Copy Device Key"]').click(); await wait(() => copied.length === 1)
  assert(copied[0] === devices[0].device_key, 'Copy keeps the original selected-device key')
  close().focus()
  devices[0].connectivity = 'Online'
  document.dispatchEvent(new Event('visibilitychange'))
  await wait(() => modal().querySelector('[aria-label="Connectivity: Online"]'))
  assert(modal().querySelector('.device-details-grid > div:nth-child(3) dd').textContent === 'Active' && document.activeElement === close(), 'Connectivity refresh keeps registration state separate and preserves keyboard focus')
  devices[0].connectivity = 'Offline'
  document.dispatchEvent(new Event('visibilitychange'))
  await wait(() => modal().querySelector('[aria-label="Connectivity: Offline"]'))
  close().click(); await wait(() => !modal())
  await open(1)
  assert(modal().textContent.includes('Online') && modal().textContent.includes('Inactive') && modal().textContent.includes('Unassigned') && modal().textContent.includes('Never'), 'Each device retains its actual connectivity, state and empty dates')
  assert(!modal().textContent.includes(devices[1].device_key), 'Reopening defaults to a masked key')
  close().click(); await wait(() => !modal())
  passed.push('Keyboard containment, live Online/Offline data and original masked Show/Hide/Copy controls remain functional')

  await render('super_admin')
  trigger = await open()
  assert(document.querySelector('[aria-label="Show Device Key"]') && document.querySelector('[aria-label="Copy Device Key"]'), 'Super Admin retains the existing key controls')
  close().click(); await wait(() => !modal())
  assert(document.activeElement === trigger, 'Super Admin dismissal restores its View focus')
  assert(!unexpected.length && !runtimeErrors.length && requests.every(request => request.method === 'get'), 'No unexpected requests, mutations or browser errors')
  passed.push('Staff and Super Admin keep their existing inventory and key permissions without mutations')

  // Exercise the shared key component alone; these roles do not visit Devices.
  for (const role of ['farm_owner', 'vet']) {
    setAuth('isolated-key-fixture', { id: 901, role, name: 'Key Fixture' })
    root.render(<DeviceKeyField key={role} deviceKey="FIXTURE-UNAUTHORIZED-KEY" variant="details" label="" />)
    await wait(() => !view() && document.querySelector('.device-key-details'))
    assert(!document.querySelector('button') && !document.body.textContent.includes('FIXTURE-UNAUTHORIZED-KEY'), 'Unauthorized roles cannot reveal or copy the masked key')
  }
  passed.push('The shared Device Key remains masked without Show or Copy controls for unauthorized roles')
  await render('super_admin')

  window.deviceDetailsPreview = async () => { if (modal()) { close().click(); await wait(() => !modal()) } await open(); window.scrollTo(0, 0); await sleep(60) }
  window.deviceDetailsResults = { passed }
} catch (error) { window.deviceDetailsResults = { passed, error: error.stack, unexpected, runtimeErrors } }
