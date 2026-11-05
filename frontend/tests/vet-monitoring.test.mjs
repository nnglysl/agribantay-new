import assert from 'node:assert/strict'
import { test } from 'node:test'
import { vetCurrentReading, vetHistorySamples, vetSampleHighlights, vetSourceLabel } from '../src/utils/vetMonitoring.js'

test('Vet current cards cannot use stale Offline, Inactive or unmonitored values', () => {
  for (const state of ['Offline', 'Inactive', 'Not Monitored', 'Pending Setup', 'Unavailable']) {
    assert.equal(vetCurrentReading({ connectivity: 'Online', state, current_reading: { ammonia: 999 } }), null)
  }
  assert.equal(vetCurrentReading({ connectivity: 'Offline', state: 'Safe', current_reading: { ammonia: 999 } }), null)
  assert.equal(vetCurrentReading({ connectivity: 'Online', state: 'Safe', device_status: 'Inactive', current_reading: { ammonia: 999 } }), null)
  assert.equal(vetCurrentReading({ connectivity: 'Online', state: 'Safe', poultry_house_id: 1, assignment_verified: false, current_reading: { ammonia: 999 } }), null)
  assert.equal(vetCurrentReading({ connectivity: 'Online', state: 'Safe', current_reading: { ammonia: 0 } }).ammonia, 0)
  assert.equal(vetSourceLabel({ device_name: 'Recorded unit' }), 'House not recorded · Recorded unit')
})

test('Vet history keeps real finite samples in the selected range and device, never creates house attribution', () => {
  const now = Date.parse('2026-11-03T04:00:00Z')
  const point = (ago, ammonia) => ({ t: new Date(now - ago * 3600000).toISOString(), ammonia, moisture: null, temperature: false, humidity: 'bad' })
  const data = { hours: 24, devices: [{ sensor_id: 7, device_name: 'Recorded unit', points: [point(48, 88), point(2, 0), point(1, '4.2'), point(-1, 99)] }] }
  const before = structuredClone(data)
  const series = vetHistorySamples(data, 24, '7', now)
  assert.deepEqual(series[0].points.map(p => p.ammonia), [0, 4.2])
  assert.ok(series[0].points.every(p => p.moisture === null && p.temperature === null && p.humidity === null && !Object.hasOwn(p, 'poultry_house_id')))
  assert.deepEqual(vetHistorySamples(data, 72, '', now), [])
  assert.deepEqual(vetHistorySamples(data, 24, '99', now), [])
  assert.deepEqual(data, before)
  const highlights = vetSampleHighlights(series)
  assert.deepEqual([highlights[0].min, highlights[0].max, highlights[0].count], [0, 4.2, 2])
  assert.equal(highlights[1].count, 0)
  assert.ok(highlights.every(metric => !Object.hasOwn(metric, 'condition') && !Object.hasOwn(metric, 'severity')))
})
