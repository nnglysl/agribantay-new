import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import '../src/index.css'
import Devices from '../src/pages/admin/Devices'
import api from '../src/api/axios'
import { setAuth } from '../src/utils/auth'

// Every API verb is intercepted. All identities and inventory are synthetic.
const devices = [
  { id: 7, device_name: 'AGB-D01', farm_id: 1, farm_name: 'First Fixture Farm', connectivity: 'Offline', status: 'Active', assignment_version: 41, device_key: 'FIXTURE-KEY-ONE' },
  { id: 9, device_name: 'AGB-D02', farm_id: 2, farm_name: 'Second Fixture Farm', connectivity: 'Online', status: 'Active', assignment_version: 41, device_key: 'FIXTURE-KEY-TWO' },
]
const requests = [], pending = [], unexpected = [], runtimeErrors = []
window.addEventListener('error', event => runtimeErrors.push(event.message))
window.addEventListener('unhandledrejection', event => runtimeErrors.push(String(event.reason)))
api.defaults.adapter = async config => {
  requests.push({ method: config.method, url: config.url, body: config.data })
  const response = data => ({ data, status: 200, statusText: 'OK', headers: {}, config })
  if (config.method === 'get' && config.url === '/admin/sensors') return response({ data: structuredClone(devices) })
  if (config.method === 'get' && config.url === '/admin/farms') return response({ data: devices.map(device => ({ id: device.farm_id, farm_name: device.farm_name })) })
  if (config.method === 'get' && config.url === '/notifications') return response({ data: [], total_count: 0, unread_count: 0 })
  const match = config.url.match(/^\/admin\/sensors\/(7|9)\/unassign$/)
  if (config.method === 'patch' && match) return new Promise((resolve, reject) => pending.push({
    succeed() {
      const device = devices.find(device => device.id === Number(match[1]))
      device.farm_id = null; device.farm_name = null
      resolve(response({ data: structuredClone(device) }))
    },
    fail() { const error = new Error('Fixture unassignment failed.'); error.response = { data: { message: error.message } }; reject(error) },
  }))
  unexpected.push(`${config.method} ${config.url}`)
  throw Error('Unexpected fixture request')
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const assert = (condition, message) => { if (!condition) throw Error(message) }
const wait = async predicate => { for (let i = 0; i < 100; i++) { if (predicate()) return; await sleep(20) } throw Error('Unassign fixture timed out') }
const root = createRoot(document.querySelector('#root'))
const modal = () => document.querySelector('[role="alertdialog"]')
const close = () => document.querySelector('[aria-label="Close Unassign Device"]')
const cancel = () => document.querySelector('[data-unassign-cancel]')
const confirm = () => document.querySelector('.unassign-device-confirm')
const row = index => document.querySelectorAll('tbody tr')[index]
const trigger = (index = 0) => [...(row(index)?.querySelectorAll('button') || [])].find(button => button.textContent === 'Unassign')
const patches = () => requests.filter(request => request.method === 'patch')
const key = (value, shiftKey = false) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true }))
const open = async (index = 0) => { const button = trigger(index); button.focus(); button.click(); await wait(modal); return button }
const render = async role => {
  const previous = document.querySelector('tbody')
  setAuth('isolated-unassign-fixture', { id: 900, role, name: 'UI Fixture' })
  root.render(<StrictMode><MemoryRouter key={role}><Devices /></MemoryRouter></StrictMode>)
  await wait(() => document.querySelector('tbody') !== previous && trigger() && !modal())
}
const passed = []
try {
  await render('admin')
  let original = await open()
  assert(document.querySelector('#unassign-device-message').textContent === 'Unassign AGB-D01 from First Fixture Farm?', 'Confirmation uses the exact question with selected device and farm')
  assert(document.querySelector('#unassign-device-support').textContent === 'Previous readings will remain with this farm.', 'Use the exact reassurance sentence')
  assert(document.querySelector('#unassign-device-title').textContent === 'Unassign Device?', 'Use the exact title')
  assert(!modal().querySelector('svg,img') && !/Are you sure|will become|no longer contribute|Readings already collected|Device Name|Device Key|firmware|reflash/i.test(modal().textContent), 'Old confirmation copy and technical explanations must not render')
  assert([...modal().querySelectorAll('strong')].map(element => element.textContent).join('|') === 'AGB-D01|First Fixture Farm', 'Only dynamic device and farm names are emphasized')
  assert([...modal().querySelectorAll('.unassign-device-actions button')].map(button => button.textContent).join('|') === 'Cancel|Unassign', 'Use the short action labels')
  assert(getComputedStyle(confirm()).backgroundColor === 'rgb(35, 74, 53)', 'Unassign uses standardized dark green')
  assert(document.activeElement === cancel(), 'Initial focus stays on the safe Cancel action')
  passed.push('Compact confirmation uses dynamic names, exact short copy and icon-free actions')

  cancel().click(); await wait(() => !modal())
  assert(document.activeElement === original && !patches().length, 'Cancel only dismisses and restores focus')
  original = await open(); close().click(); await wait(() => !modal())
  assert(document.activeElement === original && !patches().length, 'X only dismisses and restores focus')
  original = await open(); key('Escape'); await wait(() => !modal())
  assert(document.activeElement === original && !patches().length, 'Escape only dismisses and restores focus')
  original = await open(); modal().click(); await sleep(20)
  assert(modal(), 'Content clicks must not dismiss')
  modal().parentElement.click(); await wait(() => !modal())
  assert(document.activeElement === original && !patches().length && document.body.style.overflow !== 'hidden', 'Backdrop dismissal restores focus and scrolling without requests')
  passed.push('Cancel, X, Escape and backdrop close without unassignment and return focus to the row action')

  await open(1)
  assert(document.querySelector('#unassign-device-message').textContent.includes('AGB-D02 from Second Fixture Farm'), 'Opening another row uses its own names')
  close().focus(); key('Tab', true)
  assert(document.activeElement === confirm(), 'Shift+Tab stays in the confirmation')
  key('Tab'); assert(document.activeElement === close(), 'Tab wraps within the dialog')
  confirm().click(); confirm().click()
  await wait(() => pending.length === 1 && confirm().disabled)
  assert(patches().length === 1 && [...modal().querySelectorAll('button')].every(button => button.disabled), 'Rapid duplicate clicks issue only one request and disable processing controls')
  key('Escape'); modal().parentElement.click(); await sleep(20)
  assert(modal() && patches().length === 1, 'Processing cannot be dismissed or resubmitted')
  pending.shift().fail()
  await wait(() => !confirm().disabled && document.body.textContent.includes('Fixture unassignment failed.'))
  assert(modal() && devices[1].farm_id === 2, 'A failed request retains the dialog and selected assignment')
  passed.push('Duplicate submission is blocked while processing and the existing error notification allows retry')

  confirm().click(); await wait(() => pending.length === 1)
  pending.shift().succeed()
  await wait(() => !modal() && row(1).textContent.includes('Unassigned'))
  assert(patches().length === 2 && patches().every(request => request.url === '/admin/sensors/9/unassign' && JSON.parse(request.body).expected_assignment_version === 41), 'Only explicit confirmations use the original selected-device PATCH with its unchanged assignment version')
  assert(document.body.textContent.includes('AGB-D02 is now unassigned.'), 'Preserve the existing success notification')
  assert(row(0).textContent.includes('First Fixture Farm') && row(1).textContent.includes('Assign Device') && devices[1].device_key === 'FIXTURE-KEY-TWO', 'Refresh the affected row without changing another assignment or device identity')
  passed.push('Confirmed Unassign keeps the existing endpoint, success notice and inventory refresh')

  await render('super_admin')
  original = await open(); cancel().click(); await wait(() => !modal())
  assert(document.activeElement === original && patches().length === 2 && !unexpected.length && !runtimeErrors.length, 'Super Admin retains the same confirmation without unexpected calls or browser errors')
  passed.push('Staff and Super Admin retain the same confirmation behavior with every API verb intercepted')

  window.unassignDevicePreview = async () => { if (modal()) { cancel().click(); await wait(() => !modal()) } await open(); window.scrollTo(0, 0); await sleep(60) }
  window.unassignDeviceResults = { passed }
} catch (error) { window.unassignDeviceResults = { passed, error: error.stack, unexpected, runtimeErrors } }
