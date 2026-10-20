import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

let server, Dashboard, dashboardStatus
before(async () => {
  server = await createServer({
    server: { middlewareMode: true }, appType: 'custom',
    plugins: [{
      name: 'dashboard-fixtures', enforce: 'pre',
      resolveId(source) {
        if (source.endsWith('/hooks/useCachedFetch')) return '\0dashboard-fetch'
        if (source.endsWith('/hooks/useSelectedFarm')) return '\0dashboard-selection'
        if (source.endsWith('/components/FarmerLayout')) return '\0dashboard-layout'
      },
      load(id) {
        if (id === '\0dashboard-fetch') return `export function useCachedFetch(url) {
          return { data: url?.includes('insights') ? globalThis.__dashboardFixture.insight : globalThis.__dashboardFixture.data,
            loading: false, error: '', refetch() {} }
        }`
        if (id === '\0dashboard-selection') return 'export function useSelectedFarm() { return { selectedFarmId: 1, farmsLoading: false } }'
        if (id === '\0dashboard-layout') return 'export default function Layout({children}) { return children }'
      },
    }],
  })
  Dashboard = (await server.ssrLoadModule('/src/pages/farmowner/Dashboard.jsx')).default
  dashboardStatus = (await server.ssrLoadModule('/src/utils/farmDashboardStatus.js')).farmDashboardStatus
})
after(async () => { await server?.close(); delete globalThis.__dashboardFixture })

const device = (changes = {}) => ({
  device_id: 1, device_name: 'AGB-D02', has_reading: true, connectivity: 'Online',
  last_reading_at: '2026-10-11T01:00:00Z',
  ammonia: 4, ammonia_status: 'Safe', moisture: 10, moisture_status: 'Safe', ...changes,
})
const render = (devices, extra = {}) => {
  globalThis.__dashboardFixture = {
    data: { farm_name: "Gly's Farm", health_status: 'Safe', alerting_metrics: ['ammonia', 'moisture'], devices, ...extra },
    insight: { tips: ['Improve ventilation.'] },
  }
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Dashboard)))
}

test('offline-only farm replaces the reassuring green banner and generic issue count', () => {
  const html = render([device({ connectivity: 'Offline' })])
  assert.ok(html.includes('Current farm condition unavailable'))
  assert.ok(html.includes('No recent readings. Last recorded conditions may be out of date.'))
  assert.ok(html.includes('1 device offline'))
  assert.ok(!html.includes('Your farm is doing well'))
  assert.ok(!html.includes('1 issue'))
  assert.ok(html.includes('Based on last recorded readings. Current conditions are unavailable.'))
})

test('old Critical conditions remain visible as historical, without becoming current Critical counts', () => {
  const html = render([device({ connectivity: 'Offline', ammonia: 80, ammonia_status: 'Critical' })])
  assert.ok(html.includes('Last recorded: Critical'))
  assert.ok(html.includes('For the last recorded conditions'))
  assert.ok(html.includes('1 device offline'))
  assert.ok(!html.includes('1 Critical condition'))
  assert.ok(!html.includes('Your farm needs attention now'))
})

test('partially reporting farms do not claim the whole farm is doing well', () => {
  const html = render([device(), device({ device_id: 2, connectivity: 'Offline', ammonia_status: 'Critical', ammonia: 80 })])
  assert.ok(html.includes('Farm monitoring is partial'))
  assert.ok(html.includes('Only 1 of 2 devices is reporting'))
  assert.ok(html.includes('Reporting devices show normal conditions'))
  assert.ok(!html.includes('Your farm is doing well'))
  assert.ok(!html.includes('1 Critical condition'))
})

test('current Critical and Warning counts stay separate from offline device counts', () => {
  const html = render([
    device({ ammonia: 80, ammonia_status: 'Critical', moisture: 30, moisture_status: 'Warning' }),
    device({ device_id: 2, connectivity: 'Offline' }),
  ])
  assert.ok(html.includes('Your farm needs attention now'))
  assert.ok(html.includes('Monitoring is partial'))
  for (const label of ['1 Critical condition', '1 Warning condition', '1 device offline']) assert.ok(html.includes(label))
})

test('fully reporting farms preserve Safe, Warning and Critical banners and existing metric rules', () => {
  for (const [status, title] of [
    ['Safe', 'Your farm is doing well'], ['Warning', 'Your farm needs attention'], ['Critical', 'Your farm needs attention now'],
  ]) {
    const html = render([device({ ammonia_status: status })])
    assert.ok(html.includes(title))
    assert.ok(!html.includes('monitoring is partial'))
    assert.ok(!html.includes('device offline'))
    assert.ok(!html.includes('Based on last recorded readings'))
  }
  const state = dashboardStatus([device({ moisture_status: 'Critical' })], ['ammonia'])
  assert.equal(state.hero.title, 'Your farm is doing well', 'advisory classifications do not drive the banner')
  assert.deepEqual(state.badges, [])
})

test('no devices and installed devices awaiting their first reading have distinct empty states', () => {
  const empty = render([])
  assert.ok(empty.includes('Farm setup pending'))
  assert.ok(!empty.includes('Your farm is doing well'))
  const waiting = render([device({ has_reading: false, last_reading_at: null })])
  assert.ok(waiting.includes('Current farm condition unavailable'))
  assert.ok(waiting.includes('1 device awaiting readings'))
  assert.ok(waiting.includes('This device has not sent a reading yet'))
})

test('counts use conditions and devices explicitly, support plurals, and prioritize current breaches', () => {
  const devices = [
    device({ connectivity: 'Offline', ammonia_status: 'Critical', ammonia: 80 }),
    device({ device_id: 2, connectivity: 'Offline' }),
    device({ device_id: 3, ammonia_status: 'Warning', moisture_status: 'Warning', moisture: 30 }),
  ]
  const state = dashboardStatus(devices, ['ammonia', 'moisture'])
  assert.deepEqual(state.badges.map(b => b.label), ['2 Warning conditions', '2 devices offline'])
  assert.equal(state.attention[0].device_id, 3)
  assert.equal(devices[0].device_id, 1, 'presentation does not reorder source records')
})

test('reconnecting a device restores the current banner and removes offline and stale-reading labels', () => {
  assert.ok(render([device({ connectivity: 'Offline' })]).includes('Current farm condition unavailable'))
  const connected = render([device()])
  assert.ok(connected.includes('Your farm is doing well'))
  assert.ok(!connected.includes('device offline'))
  assert.ok(!connected.includes('Current conditions are unavailable'))
})
