import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

let server, auth
const storage = () => {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  }
}

before(async () => {
  globalThis.localStorage = storage()
  globalThis.sessionStorage = storage()
  server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  auth = await server.ssrLoadModule('/src/utils/auth.js')
})

after(async () => {
  await server?.close()
  delete globalThis.localStorage
  delete globalThis.sessionStorage
})

test('authenticated roles retain their own dashboard destinations', () => {
  for (const [role, destination] of [
    ['farm_owner', '/farmowner/dashboard'],
    ['admin', '/admin/dashboard'],
    ['super_admin', '/superadmin/dashboard'],
    ['vet', '/vet/dashboard'],
  ]) {
    auth.setAuth('isolated-session-fixture', { role }, false)
    assert.equal(auth.isAuthenticated(), true)
    assert.equal(auth.getUser().role, role)
    assert.equal(auth.dashboardPathForRole(auth.getRole()), destination)
    auth.clearAuth()
    assert.equal(auth.isAuthenticated(), false)
  }
})

test('switching from a remembered staff session to a farmer session clears the earlier role', () => {
  auth.setAuth('isolated-staff-fixture', { role: 'admin' }, true)
  assert.equal(auth.isRemembered(), true)
  auth.setAuth('isolated-farmer-fixture', { role: 'farm_owner' }, false)
  assert.equal(auth.isRemembered(), false)
  assert.equal(auth.getRole(), 'farm_owner')
  assert.equal(localStorage.getItem('role'), null)
  assert.equal(auth.dashboardPathForRole(auth.getRole()), '/farmowner/dashboard')
  auth.clearAuth()
})
