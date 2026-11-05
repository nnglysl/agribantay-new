import './service-retirement-browser.jsx'
import { invalidateCache } from '../src/hooks/useCachedFetch'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
for (let i = 0; i < 1500 && !window.phase7Results; i++) await sleep(20)
const passed = []
const assert = (condition, message) => { if (!condition) throw Error(message) }
try {
  assert(window.phase7Results && !window.phase7Results.error, window.phase7Results?.error || 'Phase 7 correction must pass first')
  const { render, click, button, wait, text, selectFarm, setMaintenanceDelay, setDashboardFixture, unexpected, runtimeErrors } = window.phase7Harness
  const compliance = () => document.querySelector('.annual-compliance')?.textContent || ''
  await render({ page: 'manure' }); await wait(() => compliance().includes('Oct 10, 2027'))
  assert(compliance().includes('every 12 months') && compliance().includes('344') && !text().includes('Based on your farm size'), 'Annual fields replace size frequency')
  passed.push('Farmer annual status shows actual full clean-out, due date and remaining days')
  await selectFarm(2); await wait(() => compliance().includes('Non-Compliant'))
  assert(compliance().includes('Oct 30, 2026') && compliance().includes('No recorded full clean-out') && !compliance().includes('Oct 10, 2027'), 'Second farm must not inherit first farm dates or history')
  passed.push('multi-farm selection has independent annual dates, no invented clean-out history')
  click('+ Log a Clean-out'); await wait(() => button('Save log')); await selectFarm(1)
  await wait(() => compliance().includes('Oct 10, 2027')); assert(!button('Save log'), 'An old farm form must close on farm change')
  passed.push('farm switching clears clean-out form state and prevents cross-farm submission')
  setMaintenanceDelay(160); invalidateCache('/farmer/maintenance'); await selectFarm(2)
  await wait(() => compliance().includes('Non-Compliant')); await sleep(200)
  assert(!compliance().includes('Oct 10, 2027'), 'Late old responses must not overwrite selected-farm compliance'); setMaintenanceDelay(5)
  passed.push('delayed old-farm responses cannot replace the selected farm compliance')
  click('Control Documents'); await wait(() => document.querySelector('.cd-empty'))
  assert(text().includes('Second Owner Farm'), 'Control Documents retains the selected farm')
  await selectFarm(1); await wait(() => document.querySelector('.control-documents')?.textContent.includes('odor-control-plan.pdf'))
  passed.push('Phase 6 secure documents remain intact and keep their active tab across farm changes')
  for (const role of ['admin', 'super_admin']) {
    await render({ role }); await wait(() => compliance().includes('Oct 10, 2027'))
    assert(compliance().includes('Jun 12, 2026') && compliance().includes('every 12 months') && !compliance().includes('Grace'), 'LGU roles share the same authoritative fields')
    assert(button('View Clean-out History') && document.querySelectorAll('.cd-table[aria-label="Current farm documents"] tbody tr').length === 2, 'History and secure document tables remain available')
    assert(document.querySelector('.annual-compliance h2')?.textContent === 'Annual Clean-out Compliance' && [...document.querySelectorAll('.annual-compliance dt')].map(field => field.textContent).join('|') === 'Farm Registration Date|Last Full Clean-out|Next Clean-out Due|Days Remaining', 'One annual card contains the four essential authoritative fields')
  }
  passed.push('Staff and Super Admin Compliance tabs use identical annual fields with history and documents')
  await render({ role: 'admin', page: 'dashboard' })
  const summary = label => document.querySelector(`.staff-dashboard-stat[aria-label="${label}"]`)
  assert(document.querySelectorAll('.staff-dashboard-stat').length === 3 && !document.querySelector('.annual-compliance'), 'Staff dashboard has three green summaries without a separate compliance card')
  assert(summary('Total Farms').querySelector('.staff-dashboard-stat-value').textContent === '2' && summary('Scheduled Inspections').querySelector('.staff-dashboard-stat-value').textContent === '0', 'Existing totals use actual farm and scheduled-inspection data')
  assert([...summary('Annual Clean-out Compliance').querySelectorAll('dd')].map(field => field.textContent).join('|') === '1|1' && !summary('Annual Clean-out Compliance').textContent.includes('Undetermined'), 'Zero undetermined counts stay hidden')
  setDashboardFixture({ total_farms: 37, cleanout_compliance: { compliant: 29, non_compliant: 5, undetermined: 3, total_farms: 37 } }, [
    { id: 101, status: 'Scheduled', farm_name: 'Fixture Inspection Farm', scheduled_at: '2099-11-02T01:00:00Z', inspection_type: 'General' },
    { id: 102, status: 'Scheduled', farm_name: 'Fixture Follow-up Farm', scheduled_at: '2099-11-03T01:00:00Z', inspection_type: 'Follow-up' },
    { id: 103, status: 'Completed', farm_name: 'Completed Fixture Farm', scheduled_at: '2026-10-01T01:00:00Z', inspection_type: 'General' },
  ])
  invalidateCache('/admin/dashboard'); invalidateCache('/admin/inspections')
  await wait(() => summary('Annual Clean-out Compliance').textContent.includes('Undetermined: 3') && summary('Scheduled Inspections').querySelector('.staff-dashboard-stat-value').textContent === '2')
  assert(summary('Total Farms').querySelector('.staff-dashboard-stat-value').textContent === '37' && [...summary('Annual Clean-out Compliance').querySelectorAll('dd')].map(field => field.textContent).join('|') === '29|5', 'Refreshed server counts replace the summary without recalculation')
  click('Inspections'); await wait(() => text().includes('Fixture Inspection Farm') && text().includes('Fixture Follow-up Farm'))
  assert(!text().includes('Completed Fixture Farm') && text().includes('Upcoming Inspections'), 'Existing right-side inspection panel keeps its scheduled records')
  click('Alerts'); await wait(() => text().includes('Critical Alerts'))
  setDashboardFixture({ total_farms: 2, cleanout_compliance: { compliant: 1, non_compliant: 1, undetermined: 0, total_farms: 2 } })
  await render({ role: 'admin', page: 'overdue' })
  assert(text().includes('Oct 30, 2026') && text().includes('No recorded full clean-out') && !text().includes('Grace'), 'Overdue list has annual due date and no grace state')
  await render({ role: 'admin', page: 'maintenance-details' })
  assert([...document.querySelectorAll('input')].some(el => el.value === '12 Calendar Months') && !text().includes('Grace Period'), 'Details show the annual interval and no grace field')
  passed.push('Overdue Maintenance keeps its route and displays annual due dates and current Non-Compliant status')
  await render({ page: 'services' })
  assert([...document.querySelectorAll('.agb-ui-tab')].map(el => el.textContent.trim()).join('|') === 'My Requests|Past Records', 'Part A remains intact')
  assert(unexpected.length === 0 && runtimeErrors.length === 0, unexpected.join(',')+runtimeErrors.join(','))
  passed.push('annual dashboard totals and corrected Farmer services remain consistent without runtime/API errors')
  window.phase8Preview = async options => {
    if (options.page === 'dashboard') setDashboardFixture({ total_farms: options.undetermined ? 5 : 2, cleanout_compliance: { compliant: 1, non_compliant: 1, undetermined: options.undetermined ? 3 : 0, total_farms: options.undetermined ? 5 : 2 } })
    await render(options)
    if (options.page === 'manure') await wait(() => compliance().includes(options.farmId === 2 ? 'Non-Compliant' : 'Oct 10, 2027'))
    window.scrollTo(0, 0)
  }
  window.phase8Results = { passed }
} catch (error) { window.phase8Results = { passed, error: error.stack } }
