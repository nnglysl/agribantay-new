import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateOwnerDetails, registerOwnerWithFarms, addFarmsToOwner } from '../src/utils/farmRegistration.js'

const owner = { first_name: 'Fixture', last_name: 'Owner', mobile_number: '09920000001', address: 'Fixture address' }
const farms = [
  { farm_name: 'One', farm_size: 'Small', house_count: 1, barangay: 'Calansayan', latitude: 13.855, longitude: 121.093 },
  { farm_name: 'Two', farm_size: 'Medium', house_count: 3, barangay: 'Calansayan', latitude: 13.855, longitude: 121.103 },
]

test('the owner step only calls validation and does not create an account', async () => {
  const calls = []
  await validateOwnerDetails({ post: async (...args) => calls.push(args) }, owner, null)
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], '/admin/farm-owners/validate')
  assert.equal(calls[0][1].get('mobile_number'), owner.mobile_number)
})

test('the final new-owner save submits all farms and the photo in one request', async () => {
  const calls = []
  const photo = new Blob(['isolated photo fixture'], { type: 'image/png' })
  await registerOwnerWithFarms({ post: async (...args) => calls.push(args) }, owner, photo, farms)
  assert.equal(calls.length, 1)
  const [url, body] = calls[0]
  assert.equal(url, '/admin/farm-owners')
  assert.equal(body.get('first_name'), 'Fixture')
  assert.equal(body.get('farms[0][farm_name]'), 'One')
  assert.equal(body.get('farms[1][farm_name]'), 'Two')
  assert.equal(body.get('farms[1][longitude]'), '121.103')
  assert.equal(body.get('farms[0][house_count]'), '1')
  assert.equal(body.get('farms[1][house_count]'), '3')
  assert.equal(body.get('profile_photo').size, photo.size)
})

test('adding multiple farms to an existing owner is one batch with no new owner fields', async () => {
  const calls = []
  await addFarmsToOwner({ post: async (...args) => calls.push(args) }, 42, farms.map(f => ({ ...f, user_id: 999, localId: 'client' })))
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], '/admin/farms')
  assert.equal(calls[0][1].farm_owner_id, 42)
  assert.deepEqual(calls[0][1].farms, farms)
  assert.equal(calls[0][1].first_name, undefined)
})

test('a failed save propagates once without falling back to independent farm requests', async () => {
  let calls = 0
  const error = new Error('Second farm rejected')
  await assert.rejects(registerOwnerWithFarms({ post: async () => { calls++; throw error } }, owner, null, farms), error)
  assert.equal(calls, 1)
})
