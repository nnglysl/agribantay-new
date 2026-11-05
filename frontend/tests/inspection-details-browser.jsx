import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import '../src/index.css'
import AdminInspections from '../src/pages/admin/Inspections'
import SuperAdminInspections from '../src/pages/superadmin/Inspections'
import FarmerInspections from '../src/pages/farmowner/Inspections'
import InspectionDetailsModal from '../src/components/InspectionDetailsModal'
import FarmContext from '../src/context/FarmContext'
import api from '../src/api/axios'
import { setAuth } from '../src/utils/auth'
import { formatDate, formatDateTime, DISPLAY_TIME_ZONE } from '../src/utils/formatDate'

// Every API request is intercepted; this fixture never uses operational records.
const completed = {
  id: 899, inspection_number: 'INS-899', status: 'Completed', farm_name: 'Sample Poultry Farm',
  owner_name: 'Sample Owner', inspection_type: 'General Inspection', scheduled_by_name: 'Sample Staff',
  scheduled_by: 'Sample Staff', scheduled_at: '2026-09-29T17:00:00Z', completed_at: '2026-09-30T14:11:00Z',
  findings: 'General inspection completed.\nVentilation and records reviewed.', notes: 'Original inspection notes.\nSecond note line.',
}
const records = [completed,
  { ...completed, id: 900, inspection_number: 'INS-900', status: 'Cancelled', completed_at: null, findings: '', notes: '', cancellation_reason: 'Owner requested cancellation.', reschedule_reason: 'Original reschedule reason.' },
  { ...completed, id: 901, inspection_number: 'INS-901', status: 'Scheduled', scheduled_at: '2099-09-30T01:00:00Z', completed_at: null, findings: '   ', notes: '' },
  { ...completed, id: 902, inspection_number: 'INS-902', status: 'Scheduled', completed_at: null, findings: null, notes: '' },
]
const now = new Date()
const calendarInspection = { ...completed, id: 903, inspection_number: 'INS-903', scheduled_at: new Date(now.getFullYear(), now.getMonth(), 15, 12).toISOString() }
const requests = [], unexpected = [], runtimeErrors = []
window.addEventListener('error', event => runtimeErrors.push(event.message))
window.addEventListener('unhandledrejection', event => runtimeErrors.push(String(event.reason)))
api.defaults.adapter = async config => {
  requests.push({ method: config.method, url: config.url })
  let data
  if (config.method !== 'get') {
    unexpected.push(`${config.method} ${config.url}`)
    throw Error('Mutations are forbidden in this UI fixture')
  }
  if (config.url === '/admin/inspections' || config.url === '/farmer/inspections') {
    data = config.params?.query_key
      ? { items: structuredClone(records), total: records.length, page: 1, last_page: 1, counts: { upcoming: 2 }, query_key: config.params.query_key }
      : { calendar: [calendarInspection], summary: { total: 4, follow_up: 0, active_inspections: [], farm_options: [], staff_options: [] } }
  } else if (config.url === '/admin/farms') data = [{ id: 1, farm_name: completed.farm_name }]
  else if (config.url === '/notifications') {
    return { data: { data: [], total_count: 0, unread_count: 0 }, status: 200, statusText: 'OK', headers: {}, config }
  } else {
    unexpected.push(`${config.method} ${config.url}`)
    throw Error('Unexpected fixture request')
  }
  return { data: { data }, status: 200, statusText: 'OK', headers: {}, config }
}

const root = createRoot(document.querySelector('#root'))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const assert = (condition, message) => { if (!condition) throw Error(message) }
const wait = async predicate => {
  for (let i = 0; i < 150; i++) { if (predicate()) return; await sleep(20) }
  throw Error('Inspection fixture timed out')
}
const modal = () => document.querySelector('dialog[open]')
const close = () => document.querySelector('.inspection-details-close')
const view = (index = 0) => [...document.querySelectorAll('tbody button')].filter(button => button.textContent === 'View')[index]
let revision = 0
async function render(role, tab = 'history') {
  setAuth('isolated-inspection-ui-fixture', { id: 999, role, name: 'UI Fixture' })
  const Page = role === 'admin' ? AdminInspections : role === 'super_admin' ? SuperAdminInspections : FarmerInspections
  const previous = view()
  const currentRevision = ++revision
  root.render(<StrictMode><MemoryRouter key={currentRevision}><div data-fixture-revision={currentRevision}>
    <FarmContext.Provider value={{ selectedFarmId: 1, farms: [{ id: 1, farm_name: completed.farm_name }], farmsLoading: false }}>
      <Page />
    </FarmContext.Provider>
  </div></MemoryRouter></StrictMode>)
  await wait(() => document.querySelector(`[data-fixture-revision="${currentRevision}"]`))
  await wait(() => document.querySelector('.agb-ui-tab') || (view() && view() !== previous))
  if (role !== 'farm_owner' && tab === 'history') {
    const history = [...document.querySelectorAll('.agb-ui-tab')].find(element => element.textContent === 'History')
    history.click()
  }
  await wait(() => !modal() && (tab === 'calendar' ? document.querySelector('.inspection-details-trigger') : view() && view() !== previous))
}
async function open(index = 0) {
  const trigger = view(index)
  trigger.focus()
  trigger.click()
  await wait(modal)
  return trigger
}
function value(label) {
  return [...modal().querySelectorAll('dt')].find(element => element.textContent === label)?.nextElementSibling.textContent
}

export function LongPreview() {
  const [visible, setVisible] = useState(false)
  return <><button type="button" onClick={() => setVisible(true)}>View long inspection</button>{visible && <InspectionDetailsModal
    inspectionNumber="INS-899" status="Completed" badgeStyle={{ color: '#1c3c2b', backgroundColor: '#eaf3ec' }}
    fields={[
      { label: 'Farm', value: 'A'.repeat(180) }, { label: 'Farm Owner', value: completed.owner_name },
      { label: 'Inspection Type', value: completed.inspection_type }, { label: 'Assigned Staff', value: completed.scheduled_by },
      { label: 'Scheduled Date and Time', value: formatDateTime(completed.scheduled_at) },
      { label: 'Completed Date and Time', value: formatDateTime(completed.completed_at) },
    ]}
    findings={Array.from({ length: 100 }, (_, index) => `Finding ${index + 1}: ${'Long readable inspection findings. '.repeat(3)}`).join('\n')}
    onClose={() => setVisible(false)}
  />}</>
}

const passed = []
try {
  for (const role of ['admin', 'super_admin', 'farm_owner']) {
    await render(role)
    let trigger = await open()
    assert(document.activeElement === close(), role + ': X receives focus')
    assert(modal().querySelector('h2').textContent === 'Inspection Details', 'Modal has a descriptive title')
    assert(document.getElementById(modal().getAttribute('aria-describedby')).textContent.includes('INS-899'), 'Accessible description identifies the record')
    assert(modal().querySelectorAll('button').length === 1 && !modal().querySelector('footer'), 'X is the only button; no footer')
    assert([...modal().querySelectorAll('.inspection-details-text')].at(-1).textContent.includes('General inspection completed.\nVentilation'), 'Findings preserve original line breaks')
    assert(getComputedStyle(modal().querySelector('.inspection-details-text')).whiteSpace === 'pre-wrap', 'Findings render line breaks')
    assert(!modal().querySelector('svg, img'), 'No decorative icons')
    const scheduled = role === 'farm_owner'
      ? new Date(completed.scheduled_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: DISPLAY_TIME_ZONE })
      : formatDateTime(completed.scheduled_at)
    assert(value('Scheduled Date and Time') === scheduled, role + ': original scheduled formatting preserved')
    assert(value('Assigned Staff') === completed.scheduled_by, 'Responsible staff unchanged')
    assert(value(role === 'farm_owner' ? 'Completed Date' : 'Completed Date and Time') === (role === 'farm_owner' ? formatDate(completed.completed_at) : formatDateTime(completed.completed_at)), 'Original completed formatting preserved')
    if (role !== 'farm_owner') {
      assert(value('Farm') === completed.farm_name && value('Farm Owner') === completed.owner_name, 'Farm and owner retained')
      assert(modal().textContent.includes(completed.notes), 'Separate notes retained')
    }
    // A native modal prevents focus from moving into the background.
    trigger.focus()
    assert(document.activeElement !== trigger && modal().contains(document.activeElement), 'Background is inert')
    close().click()
    await wait(() => !modal())
    assert(document.activeElement === trigger, role + ': X restores opener focus')
    assert(document.body.style.overflow !== 'hidden', 'Page scrolling restored')
    passed.push(role + ': shared presentation, original dates/data, inert background and X focus return')

    trigger = await open(1)
    assert(modal().querySelector('.inspection-details-record').textContent.includes('Cancelled'), 'Cancelled status preserved')
    assert(modal().textContent.includes('No findings recorded.'), 'Empty findings handled')
    if (role === 'admin') assert(value('Cancellation Reason') === records[1].cancellation_reason, 'Admin cancellation reason retained')
    if (role === 'farm_owner') assert(value('Reschedule Reason') === records[1].reschedule_reason, 'Farmer reschedule reason retained')
    modal().querySelector('.inspection-details-content').click()
    assert(modal(), 'Click inside stays open')
    modal().click()
    await wait(() => !modal())
    assert(document.activeElement === trigger, 'Backdrop dismissal restores opener focus')
    await open(2)
    assert(modal().textContent.includes('No findings recorded.'), 'Whitespace-only findings handled')
    close().click(); await wait(() => !modal())
    await open(3)
    assert(modal().querySelector('.inspection-details-record').textContent.includes(role === 'farm_owner' ? 'Scheduled' : 'Overdue'), 'Existing role-specific derived status preserved')
    close().click(); await wait(() => !modal())
    passed.push(role + ': cancelled, scheduled, overdue and empty states retain role-specific behavior')
  }
  assert(!unexpected.length && !runtimeErrors.length && requests.every(request => request.method === 'get'), 'No mutations or unexpected requests/errors')
  window.inspectionDetails = {
    render, open,
    calendar: async role => { await render(role, 'calendar'); document.querySelector('.inspection-details-trigger').focus() },
    preview: async () => { await render('admin'); await open(); await document.fonts.ready },
    longPreview: async () => {
      root.render(<StrictMode><LongPreview key={++revision} /></StrictMode>)
      await wait(() => document.querySelector('#root > button')?.textContent === 'View long inspection')
      const trigger = document.querySelector('#root > button')
      trigger.focus(); trigger.click(); await wait(modal)
    },
  }
  window.inspectionDetailsResults = { passed }
} catch (error) { window.inspectionDetailsResults = { passed, error: error.stack, unexpected, runtimeErrors } }
