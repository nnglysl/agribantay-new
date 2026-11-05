import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasCurrentPrimaryReading, isReadingValue, monitoringCondition } from '../src/components/farm-details/farmMonitoringState.js'

const online = { id: 1, connectivity: 'Online', has_reading: true, ammonia: 5, moisture: 12, ammonia_status: 'Safe', moisture_status: 'Safe' }

test('an unassigned farm cannot inherit its persisted Safe condition', () => {
  assert.equal(monitoringCondition({ display_status: 'Safe' }, []), 'Pending Setup')
})

test('a new assignment ignores previous values when no reading exists in that visit', () => {
  const rotated = { ...online, has_reading: false, ammonia: 999, moisture: 99 }
  assert.equal(monitoringCondition({ display_status: 'Safe' }, [rotated]), 'No Readings Yet')
  assert.equal(hasCurrentPrimaryReading(rotated), false)
})

test('offline readings do not produce a current Safe or Critical assessment', () => {
  for (const display_status of ['Safe', 'Critical']) {
    assert.equal(monitoringCondition({ display_status }, [{ ...online, connectivity: 'Offline' }]), 'Offline')
  }
})

test('primary completeness stays separate from valid severity with partial device coverage', () => {
  const devices = [online, { ...online, id: 2, connectivity: 'Offline', ammonia_status: 'Critical' }]
  assert.equal(monitoringCondition({ display_status: 'Safe' }, devices), 'Incomplete Data')
  assert.equal(monitoringCondition({}, [{ ...online, ammonia_status:'Critical' }]), 'Critical')
  assert.equal(monitoringCondition({ monitoring_assessment:{condition:'Warning'} }, [online]), 'Warning')
})

test('valid zero measurements are preserved and malformed values do not become zero', () => {
  for (const value of [0, '0', '0.00', 42.5]) assert.equal(isReadingValue(value), true)
  for (const value of [null, undefined, '', '  ', 'unknown', NaN, Infinity, false]) assert.equal(isReadingValue(value), false)
  assert.equal(hasCurrentPrimaryReading({ ...online, ammonia: 0, moisture: 0 }), true)
})

test('environmental values alone cannot manufacture a current primary condition', () => {
  const contextOnly = { ...online, ammonia: null, moisture: '', temperature: 28, humidity: 60 }
  assert.equal(monitoringCondition({ display_status: 'Safe' }, [contextOnly]), 'No Readings Yet')
})
