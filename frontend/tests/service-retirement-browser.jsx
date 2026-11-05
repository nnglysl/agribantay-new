import './control-documents-browser.jsx'

// Reuse the isolated Phase 6 transport/farm fixtures and actual routed pages.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
for (let i = 0; i < 500 && !window.phase6Results; i++) await sleep(20)
const passed = []
const assert = (condition, message) => { if (!condition) throw Error(message) }
try {
  assert(window.phase6Results && !window.phase6Results.error, window.phase6Results?.error || 'Phase 6 fixture must pass first')
  const { render, click, button, wait, text, requests, legacy, unexpected, runtimeErrors } = window.phase7Harness
  const tab = label => { const target = [...document.querySelectorAll('.agb-ui-tab')].find(element => element.textContent.trim() === label); assert(target, 'Missing tab '+label); target.click() }
  const mainRows = () => document.querySelector('tbody')?.textContent || ''
  const field = (selector, value) => { const element = document.querySelector(selector); Object.getOwnPropertyDescriptor(element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })) }

  await render({ page: 'manure' })
  assert(document.querySelector('h1').textContent === 'Manure Management', 'Rename page title')
  assert([...document.querySelectorAll('.mr-tab-btn')].map(element => element.textContent.trim()).join('|') === 'Clean-out Records|Control Documents', 'Exactly two main manure tabs')
  assert([...document.querySelectorAll('.agb-nav-item')].some(element => element.textContent.trim() === 'Manure Management') && [...document.querySelectorAll('.agb-nav-item')].some(element => element.textContent.toLowerCase().includes('service requests')), 'Keep valid Vet navigation and rename the existing manure item')
  passed.push('Manure Management keeps its bookmarked route, two main tabs and valid Farmer service navigation')

  click('+ Log a Clean-out'); await wait(() => button('Save log')); click('Cancel')
  click('Disposal Records'); await wait(() => button('+ Log a Disposal Record')); click('+ Log a Disposal Record'); await wait(() => document.querySelector('textarea')); click('Cancel')
  click('Control Documents'); await wait(() => document.querySelectorAll('.cd-table[aria-label="Current farm documents"] tbody tr').length === 2)
  assert(text().includes('odor-control-plan.pdf') && text().includes('fly-control-record.pdf'), 'Existing secure document records remain available')
  passed.push('clean-out and disposal record actions and Phase 6 documents remain accessible')

  await render({ page: 'services', prefill: 'Odor Control Request' })
  assert([...document.querySelectorAll('.agb-ui-tab')].map(element => element.textContent.trim()).join('|') === 'My Requests|Past Records', 'Farmer service UI has exactly two current tabs')
  tab('Past Records'); await sleep(50)
  assert(!text().includes('Odor Control') && !text().includes('Fly Control'), 'No retired rows in Farmer past history')
  tab('My Requests'); await wait(() => mainRows().includes('Farm Biosecurity'))
  assert(!button('Submit Request'), 'Retired bookmarked prefill must not open a request form')
  click('+ Request a Service'); await wait(() => document.querySelector('select option[value="Farm Biosecurity Request"]'))
  const options = [...document.querySelectorAll('select')].find(element => [...element.options].some(option => option.value === 'Farm Biosecurity Request')).options
  assert([...options].filter(option => option.value).map(option => option.value).join('|') === 'Farm Biosecurity Request|Blood Test Request', 'Only current Vet services may be requested')
  click('Cancel')
  passed.push('old Odor/Fly prefills and new-request forms cannot expose retired creation options')

  click('+ Request a Service'); await wait(() => button('Submit Request'))
  const requestSelect = [...document.querySelectorAll('select')].find(element => [...element.options].some(option => option.value === 'Farm Biosecurity Request'))
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(requestSelect, 'Blood Test Request'); requestSelect.dispatchEvent(new Event('change', { bubbles: true }))
  await sleep(20); click('Submit Request'); await wait(() => !button('Submit Request'))
  const created = requests.filter(request => request.method === 'POST' && request.url === '/farmer/service-requests').at(-1)
  assert(created?.body.service_type === 'Blood Test Request' && created.body.farm_id === 1, 'Valid Vet request keeps selected-farm contract')
  assert(mainRows().includes('Farm Biosecurity') && !mainRows().includes('Odor Control'), 'Farmer active table contains valid Vet work only')
  passed.push('valid Farmer Vet requests remain available and use the existing selected-farm API')

  await render({ role: 'admin', page: 'services' })
  assert(document.querySelector('h1').textContent === 'Service Requests' && text().includes('No service requests are available'), 'Staff bookmark is a safe empty route')
  assert(!text().includes('Odor Control') && !text().includes('Fly Control') && !text().includes('Farm Biosecurity'), 'Staff bookmark does not expose retired or unauthorized Vet records')
  assert(![...document.querySelectorAll('.agb-nav-item')].some(element => element.textContent.trim() === 'Service Requests'), 'Remove only the Staff service sidebar item')
  assert(![...document.querySelectorAll('button')].some(element => /accept|decline|reschedule|complete|cancel request/i.test(element.textContent)), 'No Staff operational actions on history')
  passed.push('Staff old routes expose neither retired workflows nor unauthorized Vet records')

  await render({ role: 'super_admin', page: 'services' })
  assert(mainRows().includes('Farm Biosecurity') && !mainRows().includes('Odor Control'), 'Super Admin pending queue excludes retired records')
  assert([...document.querySelectorAll('.agb-ui-tab')].map(element => element.textContent.trim()).join('|') === 'Pending|Scheduled|Overdue|History', 'Exactly four current request tabs')
  assert(!text().includes('Legacy') && !text().includes('not an active appointment'), 'Remove obsolete tab and explanatory copy')
  const originalRetired = JSON.stringify(legacy.filter(row => ['Odor Control Request','Fly Control Request'].includes(row.service_type)))
  for (const [id, service_type, status, scheduled_at] of [[301,'Farm Biosecurity Request','Scheduled','2099-11-01T01:00:00Z'],[302,'Farm Biosecurity Request','Scheduled','2020-11-01T01:00:00Z'],[303,'Farm Biosecurity Request','Completed',null],[304,'Vaccine Request','Completed',null]]) legacy.push({ id, service_type, status, scheduled_at, created_at: '2026-10-10T01:00:00Z' })
  for (const label of ['Scheduled','Overdue','History','Pending']) {
    tab(label); await wait(() => mainRows().includes('Farm Biosecurity'))
    assert(!mainRows().includes('Odor Control') && !mainRows().includes('Fly Control'), label+' excludes retired requests')
  }
  click('Filter'); await wait(() => document.querySelector('select option[value="Farm Biosecurity Request"]'))
  assert(!document.querySelector('select option[value="Odor Control Request"], select option[value="Fly Control Request"]'), 'No retired filter choices')
  click('Apply')
  const beforeBookmark = requests.length
  await render({ role: 'super_admin', page: 'services', query: '?tab=legacy' })
  assert(requests.slice(beforeBookmark).filter(request => request.url === '/admin/service-requests').every(request => request.params.tab === 'pending'), 'Old legacy deep link defaults to a current queue')
  for (let i = 0; i < 21; i++) legacy.push({ id: 400 + i, service_type: 'Farm Biosecurity Request', status: 'Pending', request_number: i === 20 ? 'Needle current record' : 'SR-current-'+i, created_at: '2026-10-10T01:00:00Z' })
  const pendingTotal = legacy.filter(row => !['Odor Control Request','Fly Control Request'].includes(row.service_type) && row.status === 'Pending').length
  await render({ role: 'super_admin', page: 'services' }); await wait(() => text().includes(`Showing 1–10 of ${pendingTotal}`))
  document.querySelector('[aria-label="Next"]').click(); await wait(() => text().includes(`Showing 11–20 of ${pendingTotal}`))
  field('[aria-label="Search request, farm, or owner"]', 'Needle'); await wait(() => text().includes('Showing 1–1 of 1'))
  assert(mainRows().includes('Needle current record'), 'Current request search and pagination remain functional')
  assert(JSON.stringify(legacy.filter(row => ['Odor Control Request','Fly Control Request'].includes(row.service_type))) === originalRetired, 'Retired fixture rows and attachments remain byte-identical')
  passed.push('Super Admin keeps four current tabs, valid filters, pagination and safe old deep links without retired records')

  const beforeDashboard = requests.length
  await render({ role: 'admin', page: 'dashboard' })
  assert(!text().includes('Pending Service Requests') && ![...document.querySelectorAll('button')].some(element => element.textContent.trim() === 'Service Requests'), 'No retired workload or map request controls')
  assert(!requests.slice(beforeDashboard).some(request => request.url === '/admin/service-requests'), 'Dashboard must not fetch a retired working queue')
  passed.push('Staff dashboard and monitoring map no longer advertise retired queues or schedules')

  await render({ page: 'services', prefill: 'Farm Biosecurity Request' })
  await wait(() => button('Submit Request'))
  assert([...document.querySelectorAll('select')].some(element => element.value === 'Farm Biosecurity Request'), 'Valid existing Vet prefill remains supported')
  click('Cancel')
  passed.push('valid Vet deep links remain functional while retired deep links stay nonoperational')
  await sleep(250)
  assert(unexpected.length === 0 && runtimeErrors.length === 0, 'No requests or runtime errors escaped the synthetic fixture: '+unexpected.join(',')+runtimeErrors.join(','))
  passed.push('all interactions remain isolated with no unexpected API calls or browser errors')

  window.phase7Preview = async options => {
    await render(options)
    if (options.form) { click('+ Request a Service'); await wait(() => button('Submit Request')) }
    window.scrollTo(0, 0)
  }
  window.phase7Results = { passed }
} catch (error) { window.phase7Results = { passed, error: error.stack } }
