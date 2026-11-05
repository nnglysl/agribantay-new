import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { dashboardSummary, houseMainIssue } from '../src/utils/farmDashboardSummary.js'

let server, Dashboard
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', plugins: [{ name: 'dashboard-fixtures', enforce: 'pre',
    resolveId(source) {
      if (source.endsWith('/hooks/useCachedFetch')) return '\0dashboard-fetch'
      if (source.endsWith('/hooks/useSelectedFarm')) return '\0dashboard-selection'
      if (source.endsWith('/components/FarmerLayout')) return '\0dashboard-layout'
    },
    load(id) {
      if (id === '\0dashboard-fetch') return `export function useCachedFetch(url) { return { data: url?.includes('insights') ? globalThis.__dashboardFixture.insight : globalThis.__dashboardFixture.data, loading: false, error: '', refetch() {} } }`
      if (id === '\0dashboard-selection') return 'export function useSelectedFarm() { return { selectedFarmId: 1, farmsLoading: false } }'
      if (id === '\0dashboard-layout') return 'export default function Layout({children}) { return children }'
    },
  }] })
  Dashboard = (await server.ssrLoadModule('/src/pages/farmowner/Dashboard.jsx')).default
})
after(async () => { await server?.close(); delete globalThis.__dashboardFixture })

// Synthetic payloads stay exclusively in this test file.
const row = (id, state, changes = {}) => ({ key: 'house:'+id, poultry_house_id: id, house_name: 'House '+id, house_status: 'Active', device_id: id, device_status: 'Active', assignment_verified: true,
  state, connectivity: ['Safe', 'Warning', 'Critical', 'Incomplete Data'].includes(state) ? 'Online' : state === 'Offline' ? 'Offline' : 'Awaiting first reading',
  primary_assessment: { available_primary_metrics: ['ammonia', 'moisture'], incomplete_data: state === 'Incomplete Data' },
  current_reading: ['Safe', 'Warning', 'Critical', 'Incomplete Data'].includes(state) ? { ammonia: state === 'Critical' ? 40 : state === 'Warning' ? 30 : 4, ammonia_status: state === 'Incomplete Data' ? 'Safe' : state, moisture: 10, moisture_status: 'Safe', temperature: 45, temperature_status: 'Critical', humidity: 90, humidity_status: 'Critical', recorded_at: '2026-11-02T03:50:00Z' } : null, ...changes })
const data = (rows, condition = 'Safe', extra = {}) => ({ farm_id: 1, farm_name: 'Synthetic Farm', monitoring_assessment: { condition, reporting_devices: rows.filter(r => r.current_reading).length, incomplete_data: false },
  house_monitoring: { farm_id: 1, inventory_status: 'verified', rows, coverage: { known: true }, farm_assessment: { condition } },
  cleanout_compliance: { status: 'Compliant', due_date: 'Nov 02, 2027', last_full_cleanout_date: 'Nov 02, 2026' }, ...extra })
const render = (payload, insight = { available: true, tips: ['Existing service advice.'] }) => {
  globalThis.__dashboardFixture = { data: payload, insight }
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Dashboard)))
}

test('Dashboard has exactly four neutral house summary cards and no detailed monitoring controls', () => {
  const html = render(data([row(1, 'Critical'), row(2, 'Warning'), row(3, 'Not Monitored', { device_id: null, device_status: null, assignment_verified: false })], 'Critical'))
  assert.equal((html.match(/class="fdb-card fdb-stat"/g) || []).length, 4)
  for (const label of ['Poultry Houses', 'Critical', 'Warning', 'Not Monitored', 'Poultry House Overview', 'Current Condition', 'Main Issue', 'Farm Care Tips']) assert.ok(html.includes(label))
  for (const forbidden of ['View Farm Readings', 'fdb-readings-link', 'data-metric', '<select', 'Current readings</option>', '°C', '85 ppm', 'Device Coverage', 'Worst valid']) assert.ok(!html.includes(forbidden), forbidden)
  assert.deepEqual(dashboardSummary(globalThis.__dashboardFixture.data).counts, { total: 3, Critical: 1, Warning: 1, unmonitored: 1 })
})
test('counts include registered Inactive houses but exclude them from current severity and Not Monitored', () => {
  const payload = data([row(1, 'Safe'), row(2, 'Inactive', { house_status: 'Inactive', device_status: null, assignment_verified: false, current_reading: null })])
  assert.deepEqual(dashboardSummary(payload).counts, { total: 2, Critical: 0, Warning: 0, unmonitored: 0 })
  assert.ok(render(payload).includes('Total registered · 1 Inactive'))
})
test('Offline remains distinct from Not Monitored, never counted as current Critical or given current values', () => {
  const stale = row(1, 'Offline', { current_reading: row(1, 'Critical').current_reading })
  const payload = data([stale, row(2, 'Not Monitored', { device_status: 'Inactive', assignment_verified: false })], 'Offline')
  const html = render(payload)
  assert.deepEqual(dashboardSummary(payload).counts, { total: 2, Critical: 0, Warning: 0, unmonitored: 1 })
  assert.ok(html.includes('1 house is') && html.includes('Offline') && html.includes('Monitoring help'))
  assert.ok(!html.includes('Ammonia is high') && !html.includes('>Safe<'))
  assert.ok(html.includes('Current environmental advice is unavailable'))
})
test('Critical priority and main issues follow each house primary records, never supporting metrics', () => {
  const payload = data([row(1, 'Warning'), row(2, 'Critical'), row(3, 'Safe')], 'Critical')
  const summary = dashboardSummary(payload)
  assert.deepEqual(summary.affected.map(r => r.house_name), ['House 2', 'House 1'])
  assert.equal(houseMainIssue(payload.house_monitoring.rows[0]), 'Ammonia is high')
  assert.equal(houseMainIssue(payload.house_monitoring.rows[2]), 'Primary readings within the safe range')
  const html = render(payload)
  assert.ok(html.includes('Check first: House 2, House 1.'))
  assert.ok(!html.includes('Temperature is high') && !html.includes('Humidity is high'))
})
test('unequipped houses are Not Monitored without changing existing backend farm severity', () => {
  const payload = data([row(1, 'Safe'), row(2, 'Not Monitored', { device_status: null, assignment_verified: false })])
  assert.equal(dashboardSummary(payload).condition, 'Safe')
  const html = render(payload)
  assert.ok(html.includes('fdb-badge--safe') && html.includes('Monitoring is incomplete for 1 house.'))
  assert.ok(html.includes('No eligible active monitoring device'))
  assert.ok(!html.includes('Current ammonia and manure moisture readings are within the safe range.'), 'A partial Safe assessment must not describe every house as safe')
  const unequipped = render(data([row(1, 'Not Monitored', { device_id: null, device_status: null, assignment_verified: false })], 'Pending Setup'))
  assert.deepEqual(dashboardSummary(globalThis.__dashboardFixture.data).counts, { total: 1, Critical: 0, Warning: 0, unmonitored: 1 })
  assert.ok(unequipped.includes('>Pending Setup</span>') && !unequipped.includes('Incomplete Monitoring') && !unequipped.includes('Monitoring incomplete.'))
})
test('Critical and Warning remain returned severities alongside gaps; incomplete does not become Safe', () => {
  for (const condition of ['Critical', 'Warning', 'Incomplete Data', 'No Readings Yet', 'Pending Setup', 'Unavailable']) {
    const html = render(data([row(1, condition), row(2, 'Offline')], condition))
    if (condition === 'Incomplete Data') assert.ok(html.includes('Some readings are missing'))
    if (condition === 'No Readings Yet') assert.ok(html.includes('Waiting for valid current readings'))
    if (condition === 'Unavailable') assert.ok(html.includes('Current farm condition is unavailable'))
    if (condition === 'Critical' || condition === 'Warning') assert.ok(html.includes('1 poultry house needs attention.'))
    assert.ok(html.includes(condition === 'Incomplete Data' ? '>Incomplete Monitoring</span>' : `>${condition}</span>`))
    assert.ok(html.includes('1 house is offline.'))
    assert.ok(!html.includes('>Safe</span>'))
  }
})
test('missing or foreign inventory returns unknown counts instead of fabricated zero houses', () => {
  const payload = data([], 'Safe')
  payload.house_monitoring.inventory_status = 'unavailable'
  assert.equal(dashboardSummary(payload).counts.total, null)
  payload.house_monitoring.rows = [row(77, 'Critical')]
  const unavailable = render(payload)
  assert.ok(unavailable.includes('Poultry house inventory unavailable'))
  assert.ok(unavailable.includes('Farm Readings in the sidebar'))
  assert.ok(!unavailable.includes('House 77'), 'Unavailable inventory cannot populate house records or priorities')
  payload.house_monitoring = { ...payload.house_monitoring, farm_id: 2, rows: [row(77, 'Critical')] }
  assert.deepEqual(dashboardSummary(payload).houses, [])
  assert.ok(!render(payload).includes('House 77'))
})
test('legacy readings never create House 1, and unavailable states never show current environmental advice', () => {
  const payload = data([row(null, 'Offline', { poultry_house_id: null, house_name: 'House not recorded' })], 'Offline')
  payload.monitoring_assessment.reporting_devices = 0
  payload.house_monitoring.inventory_status = 'unavailable'
  const html = render(payload)
  assert.ok(html.includes('Historical farm-level readings remain in Farm Readings'))
  assert.ok(!html.includes('House records unavailable'))
  assert.ok(!html.includes('<th scope="row">House 1'))
  assert.ok(!html.includes('Existing service advice.'))
})
test('recommendations retain service wording, deduplicate and stay explicitly farm-level', () => {
  const html = render(data([row(1, 'Critical')], 'Critical'), { available: true, tips: ['Existing service advice.', 'Existing service advice.', 'Second service action.'], tips_fil: ['Salin.', 'Salin.', 'Ikalawa.'] })
  assert.equal((html.match(/Existing service advice\./g) || []).length, 1)
  assert.ok(html.includes('Farm-level advice. No specific poultry house is identified'))
  assert.ok(html.includes('Salin.'))
  assert.ok(!html.includes('Improve ventilation') && !html.includes('Remove wet manure'))
})
test('clean-out compliance and its actual dates remain separate from sensor severity', () => {
  const html = render(data([row(1, 'Critical')], 'Critical'))
  assert.ok(html.includes('Manure Clean-out Compliance') && html.includes('Compliant') && html.includes('Nov 02, 2027'))
  assert.ok(!html.includes('Nov 02, 2026'), 'The compact dashboard panel shows the next due date, not clean-out history')
  assert.ok(html.includes('fdb-badge--critical'))
})
