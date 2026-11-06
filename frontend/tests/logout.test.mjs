import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createContext, runInContext } from 'node:vm'
import { parse } from '@babel/parser'
import axios from 'axios'

// Run the real logout handler, auth/cache functions and Axios interceptors.
// The adapter below is the only transport: no server, database or network.
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8')
function moduleCode(text, defaultExport) {
  const ast = parse(text, { sourceType: 'module' })
  return ast.program.body.map(node => {
    if (node.type === 'ImportDeclaration') return ''
    if (node.type === 'ExportDefaultDeclaration') return `globalThis.${defaultExport} = ${text.slice(node.declaration.start, node.declaration.end)}`
    const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node
    return text.slice(declaration.start, declaration.end)
  }).join('\n')
}
const authCode = moduleCode(source('../src/utils/auth.js'))
const clientCode = moduleCode(source('../src/api/axios.js'), 'testApi')
  .replace('import.meta.env.VITE_API_URL', 'undefined')
const cacheSource = source('../src/hooks/useCachedFetch.js')
const cacheAst = parse(cacheSource, { sourceType: 'module' })
const clearCacheNode = cacheAst.program.body.find(node => node.type === 'ExportNamedDeclaration'
  && node.declaration?.id?.name === 'clearAllCache').declaration
const cacheCode = cacheSource.slice(clearCacheNode.start, clearCacheNode.end)
const layoutSource = source('../src/components/DashboardLayout.jsx')
const layoutAst = parse(layoutSource, { sourceType: 'module', plugins: ['jsx'] })
const layout = layoutAst.program.body.find(node => node.type === 'ExportDefaultDeclaration').declaration
const handler = layout.body.body.find(node => node.type === 'VariableDeclaration'
  && node.declarations.some(item => item.id.name === 'handleLogout'))
const handlerCode = layoutSource.slice(handler.start, handler.end)

function findDashboard(node) {
  if (!node || typeof node !== 'object') return null
  if (node.type === 'JSXOpeningElement' && node.name.name === 'DashboardLayout') return node
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      const found = findDashboard(child)
      if (found) return found
    }
  }
  return null
}
function destination(role) {
  const name = role === 'vet' ? 'VetLayout' : role === 'farm_owner' ? 'FarmerLayout' : 'AdminLayout'
  const ast = parse(source(`../src/components/${name}.jsx`), { sourceType: 'module', plugins: ['jsx'] })
  return findDashboard(ast).attributes.find(attribute => attribute.name?.name === 'logoutRedirect').value.value
}
function storage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    snapshot: () => Object.fromEntries(values),
  }
}
function deferred() {
  let resolve
  const promise = new Promise(accept => { resolve = accept })
  return { promise, resolve }
}

function fixture(role, remember) {
  const localStorage = storage(), sessionStorage = storage()
  const redirects = [], navigations = [], alerts = []
  const window = { location: { pathname: '/some-dashboard', replace: path => redirects.push(path) },
    alert: message => alerts.push(message) }
  const context = createContext({ localStorage, sessionStorage, window, FormData, axios })
  runInContext('const cache = new Map(); const inflight = new Map(); let cacheGeneration = 0;', context)
  runInContext(cacheCode, context)
  runInContext(authCode, context)
  const auth = runInContext('({ setAuth, getToken, getUser, getRole, isRemembered, clearAuth, clearAuthForToken })', context)
  const cache = runInContext('({ cache, inflight, get generation() { return cacheGeneration } })', context)
  const token = `synthetic-${role}-${remember}`
  const user = { id: 41, role, first_name: 'Synthetic', last_name: 'Session' }
  auth.setAuth(token, user, remember)
  cache.cache.set('protected-response', { synthetic: true })
  cache.inflight.set('protected-request', Promise.resolve())
  runInContext(clientCode, context)
  const api = context.testApi
  const requests = [], started = deferred(), response = deferred()
  api.defaults.adapter = async config => {
    requests.push(config)
    started.resolve(config)
    const reply = await response.promise
    if (reply.failure) throw new axios.AxiosError(reply.failure, reply.code, config)
    const result = { config, status: reply.status ?? 200, statusText: '', headers: {}, data: reply.data ?? {} }
    if (result.status >= 400) throw new axios.AxiosError('Synthetic HTTP failure', 'ERR_BAD_REQUEST', config, null, result)
    return result
  }
  const state = { loggingOut: false, showLogoutConfirm: true }
  context.api = api
  context.logoutInFlight = { current: false }
  context.setLoggingOut = value => { state.loggingOut = value }
  context.setShowLogoutConfirm = value => { state.showLogoutConfirm = value }
  context.logoutRedirect = destination(role)
  context.navigate = (path, options) => navigations.push({ path, replace: options?.replace })
  runInContext(handlerCode, context)
  const logout = runInContext('handleLogout', context)
  const logoutSession = runInContext('logoutSession', context)
  return { auth, api, cache, token, user, state, requests, started, response, logout, logoutSession,
    redirects, navigations, alerts, window, localStorage, sessionStorage,
    snapshot: () => ({ local: localStorage.snapshot(), session: sessionStorage.snapshot() }) }
}

for (const role of ['farm_owner', 'admin', 'super_admin', 'vet']) {
  for (const remember of [false, true]) {
    const label = `${role} ${remember ? 'remembered' : 'unremembered'}`
    const path = '/'
    for (const [outcome, reply, warning] of [
      ['success', { status: 200 }, false],
      ['invalid/expired token', { status: 401 }, false],
      ['network failure', { failure: 'Synthetic offline', code: 'ERR_NETWORK' }, true],
      ['timeout', { failure: 'Synthetic timeout', code: 'ECONNABORTED' }, true],
      ['server failure', { status: 500 }, true],
    ]) {
      test(`${label}: ${outcome} completes logout at the public landing page`, async () => {
        const f = fixture(role, remember), generation = f.cache.generation
        const pending = f.logout()
        const config = await f.started.promise
        assert.equal(config.url, '/logout')
        assert.equal(config.method, 'post')
        assert.equal(config.headers.get('Authorization'), `Bearer ${f.token}`)
        assert.equal(config.timeout, 5000)
        assert.equal(f.auth.getToken(), f.token, 'Credentials must remain available during revocation')
        assert.equal(f.auth.isRemembered(), remember)
        assert.equal(f.auth.getUser().id, f.user.id)
        assert.equal(f.auth.getRole(), role)
        assert.equal(f.state.loggingOut, true)
        assert.equal(f.navigations.length, 0)
        f.response.resolve(reply)
        await pending
        assert.deepEqual(f.snapshot(), { local: {}, session: {} })
        assert.equal(f.cache.cache.size, 0)
        assert.equal(f.cache.inflight.size, 0)
        assert.equal(f.cache.generation, generation + 1)
        assert.deepEqual(f.navigations, [{ path, replace: true }])
        assert.deepEqual(f.redirects, [], 'Logout 401 must not trigger an expired-session redirect')
        assert.equal(f.state.loggingOut, false)
        assert.equal(f.state.showLogoutConfirm, false)
        assert.equal(f.alerts.length, warning ? 1 : 0)
        if (warning) assert.match(f.alerts[0], /revocation could not be confirmed/)
      })
    }

    test(`${label}: repeated clicks send one request`, async () => {
      const f = fixture(role, remember)
      const pending = [f.logout(), f.logout(), f.logout()]
      await f.started.promise
      assert.equal(f.requests.length, 1)
      f.response.resolve({ status: 200 })
      await Promise.all(pending)
      assert.equal(f.requests.length, 1)
      assert.equal(f.navigations.length, 1)
    })

    test(`${label}: a concurrent polling 401 leaves logout in control of navigation`, async () => {
      const f = fixture(role, remember), polling = assert.rejects(f.api.get('/notifications'))
      await f.started.promise
      const pending = f.logout()
      f.response.resolve({ status: 401 })
      await Promise.all([polling, pending])
      assert.equal(f.requests.filter(config => config.url === '/logout').length, 1)
      assert.deepEqual(f.snapshot(), { local: {}, session: {} })
      assert.deepEqual(f.navigations, [{ path, replace: true }])
      assert.deepEqual(f.redirects, [])
    })

    for (const status of [200, 401, 'network']) {
      for (const timing of ['before dispatch', 'after dispatch']) {
        test(`${label}: late ${status} logout preserves a newer login (${timing})`, async () => {
          const f = fixture(role, remember), pending = f.logout()
          if (timing === 'after dispatch') await f.started.promise
          f.auth.setAuth('synthetic-new-login', { id: 99, role: 'vet' }, !remember)
          f.cache.cache.set('new-session-response', { retained: true })
          const generation = f.cache.generation, snapshot = f.snapshot()
          const config = await f.started.promise
          assert.equal(config.headers.get('Authorization'), `Bearer ${f.token}`, 'Never revoke the newer token')
          f.response.resolve(status === 'network' ? { failure: 'Synthetic offline', code: 'ERR_NETWORK' } : { status })
          await pending
          assert.deepEqual(f.snapshot(), snapshot)
          assert.equal(f.cache.cache.has('new-session-response'), true)
          assert.equal(f.cache.generation, generation)
          assert.deepEqual(f.navigations, [])
          assert.deepEqual(f.redirects, [])
          assert.deepEqual(f.alerts, [])
        })
      }
    }
  }
}

test('token-specific cleanup preserves unrelated stored credentials and a newer cache', () => {
  const f = fixture('admin', false)
  // An independent localStorage credential takes precedence over the old tab session.
  f.localStorage.setItem('token', 'synthetic-independent-token')
  f.localStorage.setItem('user', JSON.stringify({ id: 99, role: 'vet' }))
  f.localStorage.setItem('role', 'vet')
  const independent = f.localStorage.snapshot(), generation = f.cache.generation
  assert.equal(f.auth.clearAuthForToken(f.token), false)
  assert.deepEqual(f.sessionStorage.snapshot(), {})
  assert.deepEqual(f.localStorage.snapshot(), independent)
  assert.equal(f.cache.generation, generation)
  assert.equal(f.cache.cache.size, 1)
})

test('a late 401 from another old request cannot clear the newer login', async () => {
  const f = fixture('admin', false), pending = f.api.get('/notifications')
  await f.started.promise
  f.auth.setAuth('synthetic-new-login', { id: 99, role: 'vet' }, true)
  const snapshot = f.snapshot(), generation = f.cache.generation
  f.response.resolve({ status: 401 })
  await assert.rejects(pending)
  assert.deepEqual(f.snapshot(), snapshot)
  assert.equal(f.cache.generation, generation)
  assert.deepEqual(f.redirects, [])
})

for (const deactivated of [false, true]) {
  test(`normal current-session 401 retains existing handling (deactivated=${deactivated})`, async () => {
    const f = fixture('admin', false), pending = f.api.get('/notifications')
    await f.started.promise
    f.response.resolve({ status: 401, data: { message: deactivated ? 'Your account has been deactivated.' : 'Unauthenticated.' } })
    await assert.rejects(pending)
    assert.deepEqual(f.snapshot(), { local: {}, session: {} })
    assert.deepEqual(f.redirects, [deactivated ? '/login?expired=1&reason=deactivated' : '/login?expired=1'])
  })
}

test('a missing token completes local cleanup without sending an unauthenticated request', async () => {
  const f = fixture('farm_owner', false)
  f.auth.clearAuth()
  await f.logout()
  assert.equal(f.requests.length, 0)
  assert.deepEqual(f.navigations, [{ path: '/', replace: true }])
  assert.deepEqual(f.alerts, [])
})

test('a login between token cleanup and navigation is preserved', async () => {
  const f = fixture('admin', true)
  const shared = f.logoutSession(f.token)
  assert.equal(f.logoutSession(f.token), shared, 'Coalesce duplicate requests for the same token')
  shared.then(() => {
    f.auth.setAuth('synthetic-new-login', { id: 99, role: 'vet' }, false)
    f.cache.cache.set('new-session-response', { retained: true })
  })
  const pending = f.logout()
  await f.started.promise
  f.response.resolve({ status: 200 })
  await pending
  assert.equal(f.requests.length, 1)
  assert.equal(f.auth.getToken(), 'synthetic-new-login')
  assert.equal(f.auth.getRole(), 'vet')
  assert.equal(f.auth.isRemembered(), false)
  assert.equal(f.cache.cache.has('new-session-response'), true)
  assert.deepEqual(f.navigations, [])
  assert.deepEqual(f.redirects, [])
})

test('a normal 401 while on login clears credentials without a redirect loop', async () => {
  const f = fixture('admin', false)
  f.window.location.pathname = '/login'
  const pending = f.api.get('/notifications')
  await f.started.promise
  f.response.resolve({ status: 401 })
  await assert.rejects(pending)
  assert.deepEqual(f.snapshot(), { local: {}, session: {} })
  assert.deepEqual(f.redirects, [])
})

test('ordinary permission errors do not clear authentication or redirect', async () => {
  const f = fixture('admin', false), snapshot = f.snapshot(), pending = f.api.get('/restricted')
  await f.started.promise
  f.response.resolve({ status: 403 })
  await assert.rejects(pending)
  assert.deepEqual(f.snapshot(), snapshot)
  assert.deepEqual(f.redirects, [])
})
