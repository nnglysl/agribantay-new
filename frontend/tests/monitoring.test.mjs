import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let server, Row, Summary, formatPeriod
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  Row = (await server.ssrLoadModule('/src/components/MonitoringDeviceRow.jsx')).default
  Summary = (await server.ssrLoadModule('/src/components/ReadingsSummaryCard.jsx')).default
  formatPeriod = (await server.ssrLoadModule('/src/utils/deploymentPeriod.js')).formatDeploymentPeriod
})
after(async () => { await server?.close() })

const device = {
  id: 1, device_name: 'AGB-TEST', has_reading: true, connectivity: 'Online',
  last_recorded_condition: 'Safe', last_reading_at: '2026-09-25T16:00:00Z',
  ammonia: 4, ammonia_status: 'Safe', moisture: 10, moisture_status: 'Safe',
  temperature: 24, humidity: 60,
}
const renderRow = changes => renderToStaticMarkup(React.createElement(Row, {
  device: { ...device, ...changes }, alerting: ['ammonia', 'moisture'], cellStyle: {}, pillStyle: {},
}))
const lastCell = html => [...html.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].at(-1)[1]

test('assignment dates use Manila, explicit months, actual end dates and Present', () => {
  assert.equal(formatPeriod('2026-09-25T01:00:00Z', null, true), 'Sep 25, 2026 \u2013 Present')
  assert.equal(formatPeriod('2026-09-25T01:00:00Z', '2026-09-30T01:00:00Z'), 'Sep 25 \u2013 Sep 30, 2026')
  assert.equal(formatPeriod('2026-09-30T01:00:00Z', '2026-10-02T01:00:00Z'), 'Sep 30 \u2013 Oct 2, 2026')
  assert.equal(formatPeriod('2026-12-31T01:00:00Z', '2027-01-02T01:00:00Z'), 'Dec 31, 2026 \u2013 Jan 2, 2027')
  assert.equal(formatPeriod('2026-09-25T16:00:00Z', null, true), 'Sep 26, 2026 \u2013 Present')
  assert.equal(formatPeriod(null, null), 'Assignment dates unavailable')
  assert.equal(formatPeriod(null, null, true), 'Start date unavailable \u2013 Present')
  assert.equal(formatPeriod('invalid', null), 'Assignment dates unavailable')
})

test('online devices display the recorded Safe, Warning or Critical condition', () => {
  for (const status of ['Safe', 'Warning', 'Critical']) {
    const html = renderRow({ last_recorded_condition: status })
    assert.ok(lastCell(html).includes(`>${status}</span>`))
    assert.ok(html.includes('Latest reading:'))
    assert.ok(!html.includes('Last recorded:'))
    assert.ok(html.includes('4 ppm'))
  }
})

test('offline devices show Offline and separate historical values and condition', () => {
  for (const status of ['Safe', 'Critical']) {
    const html = renderRow({ connectivity: 'Offline', last_recorded_condition: status })
    assert.ok(lastCell(html).includes('>Offline</span>'))
    assert.ok(lastCell(html).includes(`Last condition: ${status}`))
    assert.ok(html.includes('Last recorded:'))
    assert.ok(html.includes('September 26, 2026'))
    assert.ok(!html.includes('Latest reading:'))
    assert.ok(html.includes('4 ppm'))
  }
})

test('devices with no readings do not inherit a Safe condition or stale values', () => {
  const html = renderRow({ has_reading: false, connectivity: 'Offline', last_recorded_condition: null })
  assert.ok(lastCell(html).includes('No readings yet'))
  assert.ok(!html.includes('4 ppm'))
  assert.ok(!html.includes('Last condition:'))
  assert.ok(!html.includes('>Safe<'))
})

function summaryProps() {
  const rows = Array.from({ length: 11 }, (_, index) => ({
    date: `2026-09-${String(30 - index).padStart(2, '0')}`,
    ammonia_avg: index === 0 ? 0 : 11.7, ammonia_peak: 26,
    moisture_avg: index === 0 ? null : 25, moisture_peak: 45,
    reading_count: 3, alerts_raised: 999, status: 'Critical',
  }))
  return {
    data: { deployments: [
      { assignment_key: '1:10', sensor_id: 1, device_name: 'AGB-TEST', is_current: false,
        assigned_at: '2026-09-20T01:00:00Z', unassigned_at: '2026-09-30T01:00:00Z',
        days_covered: 11, total_readings: 33, data_coverage_percent: 25, rows },
      { assignment_key: '1:20', sensor_id: 1, device_name: 'AGB-TEST', is_current: true,
        assigned_at: '2026-10-01T01:00:00Z', unassigned_at: null,
        days_covered: 1, total_readings: 0, data_coverage_percent: 0, rows: [] },
    ] },
    loading: false, openSummary: '1:10', page: 1, pageSize: 10,
    onBack() {}, onOpen() {}, onPageChange() {}, onPageSizeChange() {}, isMobile: false,
  }
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null
  if (predicate(node)) return node
  for (const child of React.Children.toArray(node.props?.children)) {
    const match = find(child, predicate)
    if (match) return match
  }
  return null
}

test('daily columns, missing metrics and pagination remain intact', () => {
  const props = summaryProps()
  const html = renderToStaticMarkup(React.createElement(Summary, props))
  assert.deepEqual([...html.matchAll(/<th\b[^>]*>(.*?)<\/th>/g)].map(match => match[1]),
    ['Date', 'Ammonia Avg', 'Ammonia Peak', 'Moisture Avg', 'Moisture Peak', 'Readings', 'Status'])
  for (const value of ['0 ppm', '11.7 ppm', '26 ppm', '25%', '45%', '25% data coverage', 'Showing 1\u201310 of 11']) {
    assert.ok(html.includes(value), value)
  }
  assert.ok(/<td[^>]*>\u2014<\/td>/.test(html))
  assert.ok(!/<td[^>]*>999<\/td>/.test(html))
  const second = renderToStaticMarkup(React.createElement(Summary, { ...props, page: 2 }))
  assert.ok(second.includes('Showing 11\u201311 of 11'))
  assert.equal((second.match(/<tbody>[\s\S]*?<\/tbody>/)[0].match(/<tr\b/g) ?? []).length, 1)
})

test('View selects an assignment key, and Back and paging callbacks still work', () => {
  const props = summaryProps()
  let opened, backed = false, page, size
  const list = Summary({ ...props, openSummary: null, onOpen: key => { opened = key } })
  find(list, node => node.type === 'button' && node.props.children === 'View').props.onClick()
  assert.equal(opened, '1:10')
  const tree = Summary({ ...props, onBack: () => { backed = true }, onPageChange: value => { page = value }, onPageSizeChange: value => { size = value } })
  find(tree, node => node.type === 'button' && node.props.children === '\u2190 Back').props.onClick()
  const footer = find(tree, node => node.props.totalPages === 2)
  footer.props.onPageChange(2)
  footer.props.onPageSizeChange(25)
  assert.equal(backed, true)
  assert.equal(page, 2)
  assert.equal(size, 25)
})

test('coverage list keeps current/offline assignments and empty periods accessible', () => {
  const props = summaryProps()
  const html = renderToStaticMarkup(React.createElement(Summary, { ...props, openSummary: null }))
  assert.ok(html.includes('Data Coverage'))
  assert.ok(!html.includes('Uptime'))
  assert.ok(html.includes('Currently installed'))
  assert.ok(html.includes('Previously installed'))
  assert.ok(html.includes('Present'))
  assert.ok(!html.includes('(day:'))
  const empty = renderToStaticMarkup(React.createElement(Summary, { ...props, openSummary: '1:20' }))
  assert.ok(empty.includes('0 readings'))
  assert.ok(empty.includes('0% data coverage'))
})
