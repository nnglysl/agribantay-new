import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import '../src/index.css'
import Inspections from '../src/pages/admin/Inspections'
import api from '../src/api/axios'
import { setAuth } from '../src/utils/auth'

// Synthetic records and intercepted requests only, including every mutation.
const original = {
  id: 905, inspection_number: 'INS-905', farm_name: 'Sample Poultry Farm', owner_name: 'Sample Owner',
  status: 'Scheduled', inspection_type: 'General Inspection', scheduled_by_name: 'Sample Staff',
  scheduled_at: '2099-11-05T01:00:00Z', completed_at: null,
}
let record = { ...original }, pending = null, revision = 0
const requests = [], unexpected = [], runtimeErrors = []
window.addEventListener('error', event => runtimeErrors.push(event.message))
window.addEventListener('unhandledrejection', event => runtimeErrors.push(String(event.reason)))
api.defaults.adapter = async config => {
  const entry = { method: config.method, url: config.url, payload: config.data ? JSON.parse(config.data) : null }
  requests.push(entry)
  const response = data => ({ data, status: 200, statusText: 'OK', headers: {}, config })
  if (config.method === 'patch' && ['/admin/inspections/905/complete', '/admin/inspections/905/reschedule', '/admin/inspections/905/cancel'].includes(config.url)) {
    if (pending) throw Error('Unexpected duplicate fixture request')
    return new Promise((resolve, reject) => { pending = { resolve, reject, response, entry } })
  }
  if (config.method === 'get' && config.url === '/admin/inspections') {
    return response({ data: config.params?.query_key
      ? { items: record.status === 'Scheduled' ? [{ ...record }] : [], total: record.status === 'Scheduled' ? 1 : 0, page: 1, last_page: 1, query_key: config.params.query_key }
      : { calendar: [], summary: { total: 1, follow_up: 0, active_inspections: [] } } })
  }
  if (config.method === 'get' && config.url === '/admin/farms') return response({ data: [{ id: 1, farm_name: record.farm_name }] })
  if (config.method === 'get' && config.url === '/notifications') return response({ data: [], total_count: 0, unread_count: 0 })
  unexpected.push(`${config.method} ${config.url}`)
  throw Error('Unexpected fixture request; no operational access is allowed')
}

const root = createRoot(document.querySelector('#root'))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const assert = (condition, message) => { if (!condition) throw Error(message) }
const wait = async predicate => {
  for (let i = 0; i < 150; i++) { if (predicate()) return; await sleep(20) }
  throw Error('Inspection action fixture timed out')
}
const modal = () => document.querySelector('dialog[open]')
const close = () => document.querySelector('.inspection-details-close')
const trigger = (label = 'Complete') => [...document.querySelectorAll('tbody button')].find(element => element.textContent === label)
const patches = () => requests.filter(request => request.method === 'patch')
const submit = () => modal().querySelector('form').requestSubmit()
async function fill(value, selector = 'textarea') {
  const element = modal().querySelector(selector)
  const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(20)
}
async function render(longName = false, ownerName = original.owner_name) {
  assert(!pending, 'Finish each mocked request before remounting')
  record = { ...original, owner_name: ownerName, ...(longName ? { farm_name: 'Long farm name ' + 'A'.repeat(160) } : {}) }
  setAuth('isolated-inspection-action-fixture', { id: 999, role: 'admin', name: 'UI Fixture' })
  const current = ++revision
  root.render(<StrictMode><MemoryRouter key={current}><div data-action-fixture={current}><Inspections /></div></MemoryRouter></StrictMode>)
  await wait(() => document.querySelector(`[data-action-fixture="${current}"] .agb-ui-tab`))
  ;[...document.querySelectorAll('.agb-ui-tab')].find(element => element.textContent === 'Scheduled').click()
  await wait(() => trigger() && !modal())
}
async function open(label = 'Complete') {
  const element = trigger(label)
  element.focus(); element.click()
  await wait(modal)
}
async function rejectRequest(data) {
  const request = pending
  pending = null
  request.reject(data ? { response: { status: 422, data } } : Error('Fixture network failure'))
  await wait(() => !modal().querySelector('button[type="submit"]').disabled)
}
async function resolveRequest() {
  const request = pending
  pending = null
  record.status = request.entry.url.endsWith('/cancel') ? 'Cancelled' : 'Completed'
  request.resolve(request.response({ data: { ...record } }))
  await wait(() => !modal())
}

const passed = []
try {
  await render(); await open()
  assert(modal().querySelector('h2').textContent === 'Complete Inspection', 'Title is retained')
  assert(modal().textContent.includes('INS-905 — Sample Poultry Farm'), 'Record ID and farm are secondary information')
  assert(document.activeElement === modal().querySelector('textarea'), 'Initial focus goes to Findings')
  const field = modal().querySelector('textarea')
  assert(field.required && modal().querySelector('label').htmlFor === field.id, 'Required Findings label is associated')
  assert(field.placeholder === 'e.g. All systems normal. No violations observed.', 'Original placeholder retained')
  assert(!modal().querySelector('svg, img'), 'No decorative icons')
  close().click(); await wait(() => !modal())
  assert(document.activeElement === trigger(), 'X returns focus to Complete')
  await open(); modal().querySelector('.inspection-action-secondary').click(); await wait(() => !modal())
  assert(document.activeElement === trigger(), 'Cancel returns focus to Complete')
  await open(); modal().click(); await wait(() => !modal())
  assert(document.activeElement === trigger(), 'Safe backdrop dismissal returns focus')
  passed.push('Accessible header, required field, focused entry and safe X/Cancel/backdrop dismissal')

  await open()
  submit(); await wait(() => modal().querySelector('[role="alert"]'))
  assert(!patches().length && modal().textContent.includes('Please enter your findings for this inspection.'), 'Empty findings use existing validation without a request')
  await fill('  \n '); submit(); await sleep(30)
  assert(!patches().length && modal().querySelector('textarea').value === '  \n ', 'Whitespace fails validation without losing entered text')
  assert(document.activeElement === modal().querySelector('textarea') && modal().querySelector('textarea').getAttribute('aria-invalid') === 'true', 'Invalid field is focused and marked')
  passed.push('Blank and whitespace validation retain original messages and entered findings')

  const findings = '  Original findings.\nSecond line remains intact.  '
  await fill(findings)
  const opener = trigger()
  submit(); submit()
  // Exercise dismissals in the same event cycle, before disabled UI paints.
  close().click(); modal().click()
  await wait(() => pending && modal()?.querySelector('button[type="submit"]').disabled)
  assert(patches().length === 1 && patches()[0].url === '/admin/inspections/905/complete', 'One request at the original endpoint')
  assert(JSON.stringify(patches()[0].payload) === JSON.stringify({ findings }), 'Payload preserves whitespace and line breaks exactly')
  assert([...modal().querySelectorAll('button')].every(button => button.disabled) && modal().querySelector('textarea').readOnly, 'Saving disables dismissal/submission and locks the submitted findings')
  modal().querySelector('.inspection-action-secondary').click(); close().click(); modal().click()
  assert(modal() && modal().textContent.includes('Saving'), 'Pending completion cannot be dismissed')
  await rejectRequest({ message: 'The given data was invalid.', errors: { findings: ['Please provide more detail.'] } })
  assert(modal().querySelector('textarea').value === findings && modal().textContent.includes('Please provide more detail.'), 'Backend validation preserves findings and exposes the field message')
  const described = document.getElementById(modal().querySelector('textarea').getAttribute('aria-describedby'))
  assert(described?.textContent === 'Please provide more detail.', 'Field validation is announced accessibly')
  submit(); await wait(() => pending)
  await rejectRequest()
  assert(modal().querySelector('textarea').value === findings && modal().textContent.includes('Failed to complete inspection.'), 'Existing network error fallback preserves findings for retry')
  const readsBeforeSuccess = requests.filter(request => request.method === 'get' && request.url === '/admin/inspections').length
  submit(); await wait(() => pending)
  await resolveRequest()
  await wait(() => document.querySelector('.inspection-completion-feedback'))
  assert(document.querySelector('.inspection-completion-feedback').getAttribute('role') === 'status', 'Successful completion is announced')
  assert(document.querySelector('.inspection-completion-feedback').textContent === 'INS-905 marked as completed.', 'Clear success feedback identifies the record')
  await wait(() => requests.filter(request => request.method === 'get' && request.url === '/admin/inspections').length > readsBeforeSuccess)
  assert(patches().length === 3 && !opener.disabled, 'Retries are allowed after errors; the existing refresh callback runs after success')
  passed.push('Synchronous duplicate guard, pending dismissal lock, exact API payload, validation/network recovery and success refresh')

  await render(); await open('Reschedule')
  assert(modal().querySelector('h2').textContent === 'Reschedule Inspection', 'Related form uses the shared action dialog')
  submit(); await wait(() => modal().textContent.includes('Please select a new date.'))
  await fill('Owner requested a new visit date.')
  await fill('2099-11-06', 'input[type="date"]')
  await fill('10:30', 'input[type="time"]')
  submit(); submit(); await wait(() => pending)
  assert(patches().length === 4 && pending.entry.url === '/admin/inspections/905/reschedule', 'Related form also prevents duplicates')
  assert(JSON.stringify(pending.entry.payload) === JSON.stringify({ scheduled_at: '2099-11-06 10:30:00', reason: 'Owner requested a new visit date.' }), 'Rescheduling API contract is unchanged')
  await rejectRequest()
  assert(modal().querySelector('textarea').value === 'Owner requested a new visit date.' && modal().querySelector('input[type="date"]').value === '2099-11-06', 'Rescheduling retains input on failure')
  close().click(); await wait(() => !modal())
  assert(document.activeElement === trigger('Reschedule'), 'Related form restores its opener')
  passed.push('Reschedule shares the minimalist layout and accessibility while preserving its original fields, validations and payload')

  const beforeCancellation = patches().length
  await render(); await open('Cancel')
  assert(modal().querySelector('h2').textContent === 'Cancel Inspection', 'Cancellation title retained')
  assert(modal().querySelector('.inspection-action-subtitle').textContent.includes('Cancel INS-905 for Sample Owner?'), 'Confirmation identifies the inspection and farm owner')
  assert(modal().textContent.includes("farm owner's AgriBantay cancellation notification") && !/SMS|email/.test(modal().textContent), 'Confirmation references only the existing in-app notification')
  assert(document.activeElement === modal().querySelector('textarea'), 'Cancellation reason receives initial focus')
  const cancellationField = modal().querySelector('textarea')
  assert(cancellationField.required && modal().querySelector('label').htmlFor === cancellationField.id, 'Required reason has an associated label')
  assert(cancellationField.placeholder === 'Why is this inspection being cancelled?', 'Requested cancellation placeholder')
  assert(modal().querySelector('button[type="submit"]').disabled, 'Blank reason keeps the destructive action disabled')
  assert(!modal().querySelector('svg, img'), 'Cancellation has no decorative icons')
  close().click(); await wait(() => !modal())
  assert(document.activeElement === trigger('Cancel'), 'Cancellation X restores focus')
  await open('Cancel')
  assert(modal().querySelector('.inspection-action-secondary').textContent === 'Keep Inspection', 'Clear secondary button label')
  modal().querySelector('.inspection-action-secondary').click(); await wait(() => !modal())
  assert(document.activeElement === trigger('Cancel') && patches().length === beforeCancellation, 'Keep Inspection dismisses without a request')
  await open('Cancel'); modal().click(); await wait(() => !modal())
  assert(document.activeElement === trigger('Cancel'), 'Cancellation backdrop restores focus')
  await render(false, ''); await open('Cancel')
  assert(modal().querySelector('.inspection-action-subtitle').textContent.includes('for Sample Poultry Farm?'), 'Missing owner uses existing farm identity')
  close().click(); await wait(() => !modal())
  passed.push('Cancel Inspection shares header/input styling, identifies the owner, and safely dismisses with X/Keep Inspection/backdrop')

  await render(); await open('Cancel')
  submit(); await wait(() => modal().querySelector('[role="alert"]'))
  assert(patches().length === beforeCancellation && modal().textContent.includes('A cancellation reason is required.'), 'Original cancellation validation is retained')
  await fill(' \n '); submit(); await sleep(30)
  assert(patches().length === beforeCancellation && modal().querySelector('textarea').value === ' \n ', 'Whitespace-only reason fails without losing text')
  await fill('  a  '); submit(); await wait(() => pending)
  assert(pending.entry.payload.reason === 'a', 'Reason trimming matches the original contract; minimum length remains server validated')
  await rejectRequest({ message: 'The given data was invalid.', errors: { reason: ['Please give a slightly longer reason.'] } })
  assert(modal().querySelector('textarea').value === '  a  ', 'Server validation preserves exact entered text')
  assert(modal().querySelector('textarea').nextElementSibling?.textContent === 'Please give a slightly longer reason.', 'Validation appears directly below the textarea')
  assert(document.getElementById(modal().querySelector('textarea').getAttribute('aria-describedby'))?.textContent === 'Please give a slightly longer reason.', 'Cancellation field error is described accessibly')
  const cancellationReason = '  Owner requested cancellation.\nPlease retain this second line.  '
  await fill(cancellationReason)
  assert(!modal().querySelector('[role="alert"]'), 'Editing clears the previous cancellation error as before')
  submit(); submit(); close().click(); modal().click()
  await wait(() => pending && modal()?.querySelector('button[type="submit"]').disabled)
  assert(patches().length === beforeCancellation + 2, 'Repeated cancellation submission sends one pending request')
  assert(pending.entry.url === '/admin/inspections/905/cancel' && JSON.stringify(pending.entry.payload) === JSON.stringify({ reason: cancellationReason.trim() }), 'Cancellation endpoint and trimmed payload are unchanged')
  assert([...modal().querySelectorAll('button')].every(button => button.disabled) && modal().querySelector('textarea').readOnly && modal().textContent.includes('Cancelling'), 'Cancellation shows loading and locks editing/dismissal')
  await rejectRequest()
  assert(modal().textContent.includes('Could not cancel this inspection. Please try again.') && modal().querySelector('textarea').value === cancellationReason, 'Original error fallback retains the reason for retry')
  submit(); await wait(() => pending)
  await rejectRequest({ message: 'This inspection has already been cancelled.' })
  assert(modal().querySelector('textarea').nextElementSibling?.textContent === 'This inspection has already been cancelled.' && record.status === 'Scheduled', 'Server refusal is shown below the field without a local status change')
  const readsBeforeCancellation = requests.filter(request => request.method === 'get' && request.url === '/admin/inspections').length
  submit(); await wait(() => pending); await resolveRequest()
  await wait(() => document.querySelector('.inspection-completion-feedback')?.textContent === 'INS-905 cancelled.')
  await wait(() => requests.filter(request => request.method === 'get' && request.url === '/admin/inspections').length > readsBeforeCancellation)
  assert(record.status === 'Cancelled' && patches().length === beforeCancellation + 4, 'Confirmed success closes, announces cancellation and refreshes the list')
  assert(!unexpected.length && !runtimeErrors.length, 'No unexpected calls or runtime errors')
  passed.push('Cancellation retains required/server validation, trimmed API payload, entered reasons, retry behavior and success refresh with duplicate protection')

  window.inspectionActions = {
    preview: async () => { await render(); await open(); await document.fonts.ready },
    begin: async () => { await fill('Pending completion findings.'); submit(); await wait(() => pending && modal().querySelector('button[type="submit"]').disabled) },
    reject: () => rejectRequest(),
    count: () => patches().length,
    previewCancel: async () => { await render(); await open('Cancel'); await document.fonts.ready },
    beginCancel: async () => { await fill('Pending cancellation reason.'); submit(); await wait(() => pending && modal().querySelector('button[type="submit"]').disabled) },
    longCancellationError: async () => {
      await render(false, 'Long Owner ' + 'A'.repeat(100)); await open('Cancel'); await fill('Entered cancellation reason.'); submit(); await wait(() => pending)
      await rejectRequest({ message: 'The given data was invalid.', errors: { reason: ['Detailed cancellation feedback. '.repeat(80)] } })
    },
    longError: async () => {
      await render(true); await open(); await fill('Entered findings remain available.'); submit(); await wait(() => pending)
      await rejectRequest({ message: 'The given data was invalid.', errors: { findings: ['Detailed validation feedback. '.repeat(80)] } })
    },
  }
  window.inspectionActionsResults = { passed }
} catch (error) { window.inspectionActionsResults = { passed, error: error.stack, unexpected, runtimeErrors } }
