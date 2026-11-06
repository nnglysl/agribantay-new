import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { test } from 'node:test'
import { createContext, runInContext } from 'node:vm'
import { parse } from '@babel/parser'
import axios from 'axios'
import { createServer } from 'vite'

// Execute the actual modules and form handler with memory storage and an
// Axios adapter. No application backend or operational database is contacted.
const source = name => readFileSync(new URL(name, import.meta.url), 'utf8')
const ast = text => parse(text, { sourceType: 'module', plugins: ['jsx'] })
function moduleCode(text) {
  return ast(text).program.body.map(node => {
    if (node.type === 'ImportDeclaration' || node.type === 'ExportDefaultDeclaration') return ''
    const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node
    return text.slice(declaration.start, declaration.end)
  }).join('\n')
}
const authCode = moduleCode(source('../src/utils/auth.js'))
const apiCode = moduleCode(source('../src/api/axios.js')).replace('import.meta.env.VITE_API_URL', 'undefined')
const page = source('../src/pages/ChangePassword.jsx')
const component = ast(page).program.body.find(node => node.type === 'ExportDefaultDeclaration').declaration
const handler = component.body.body.find(node => node.declarations?.some(item => item.id.name === 'handleSubmit'))
const handlerCode = page.slice(handler.start, handler.end)
function storage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) }
}
const settle = () => new Promise(resolve => setImmediate(resolve))
function fixture(role, remember, forced = true) {
  const localStorage = storage(), sessionStorage = storage(), redirects = [], navigations = []
  const location = { pathname: '/change-password', search: '', replace: target => { redirects.push(target); location.search = new URL(target, 'http://isolated.test').search } }
  let clears = 0
  const context = createContext({ localStorage, sessionStorage, FormData, URLSearchParams, window: { location }, axios, clearAllCache: () => { clears++ } })
  runInContext(authCode, context)
  const auth = runInContext('({setAuth,getUser,getToken,getRole,isRemembered,clearAuth,getAuthSnapshot,isCurrentAuth,getLoginRememberPreference,getAuthRevision})', context)
  const user = { id: 41, role, must_change_password: forced, requires_fresh_login: false, legal_acknowledged_at: '2026-11-01T00:00:00Z' }
  auth.setAuth('synthetic-original', user, remember)
  runInContext(apiCode, context)
  const client = runInContext('({api,refreshSession,logoutSession,requirePasswordLogin})', context)
  const requests = []
  client.api.defaults.adapter = config => new Promise((resolve, reject) => {
    requests.push({ config, reply(reply) {
      if (reply.failure) return reject(new axios.AxiosError('Synthetic failure', reply.failure, config))
      const response = { config, data: reply.data ?? {}, status: reply.status ?? 200, statusText: '', headers: {} }
      if (response.status >= 400) reject(new axios.AxiosError('Synthetic HTTP failure', 'ERR_BAD_REQUEST', config, null, response))
      else resolve(response)
    } })
  })
  const state = { loading: false, error: '' }
  Object.assign(context, { allValid: true, newPassword: 'Permanent!456', confirmPassword: 'Permanent!456', saving: { current: false },
    setError: value => { state.error = value }, setLoading: value => { state.loading = value }, navigate: (to, options) => navigations.push({ to, replace: options?.replace }) })
  runInContext(handlerCode, context)
  const submit = runInContext('handleSubmit', context)
  return { auth, ...client, state, requests, user, localStorage, sessionStorage, location, redirects, navigations,
    submit: () => submit({ preventDefault() {} }), get clears() { return clears } }
}

for (const role of ['farm_owner', 'admin', 'super_admin', 'vet']) {
  for (const remember of [false, true]) {
    const label = `${role} remembered=${remember}`
    test(`${label}: forced completion preserves the captured token, role and persistence`, async () => {
      const f = fixture(role, remember), pending = f.submit()
      await settle()
      const config = f.requests[0].config
      assert.equal(config.headers.get('Authorization'), 'Bearer synthetic-original')
      assert.equal(f.auth.getToken(), 'synthetic-original')
      f.requests[0].reply({ data: { user: { ...f.user, must_change_password: false } } })
      await pending
      assert.equal(f.auth.getToken(), 'synthetic-original')
      assert.equal(f.auth.getRole(), role)
      assert.equal(f.auth.isRemembered(), remember)
      assert.equal(f.auth.getUser().must_change_password, false)
      assert.deepEqual(f.navigations, [{ to: `/${role === 'farm_owner' ? 'farmowner' : role === 'super_admin' ? 'superadmin' : role}/dashboard`, replace: true }])
    })
    test(`${label}: duplicate password submits coalesce`, async () => {
      const f = fixture(role, remember), first = f.submit(), second = f.submit()
      await settle()
      assert.equal(f.requests.length, 1)
      f.requests[0].reply({ data: { user: { ...f.user, must_change_password: false } } })
      await Promise.all([first, second])
      assert.equal(f.navigations.length, 1)
    })
    for (const replacement of ['logout', 'new-login']) {
      test(`${label}: ${replacement} during password submission is preserved`, async () => {
        const f = fixture(role, remember), pending = f.submit()
        if (replacement === 'logout') f.auth.clearAuth()
        else f.auth.setAuth('synthetic-new', { id: 99, role: 'vet', must_change_password: true }, !remember)
        const snapshot = f.auth.getAuthSnapshot()
        await settle()
        assert.equal(f.requests[0].config.headers.get('Authorization'), 'Bearer synthetic-original')
        f.requests[0].reply({ data: { user: { ...f.user, must_change_password: false } } })
        await pending
        assert.equal(f.auth.getToken(), snapshot.token)
        assert.equal(f.auth.getRole(), snapshot.role)
        assert.equal(f.auth.getAuthRevision(), snapshot.revision)
        assert.deepEqual(f.navigations, [])
      })
    }
    for (const failure of ['ERR_NETWORK', 'ECONNABORTED', 422]) {
      test(`${label}: ${failure} preserves the forced session`, async () => {
        const f = fixture(role, remember), snapshot = f.auth.getAuthSnapshot(), pending = f.submit()
        await settle()
        f.requests[0].reply(typeof failure === 'number' ? { status: failure, data: { message: 'Synthetic validation failure' } } : { failure })
        await pending
        assert.equal(f.auth.isCurrentAuth(snapshot), true)
        assert.equal(f.auth.getUser().must_change_password, true)
        assert.deepEqual(f.navigations, [])
      })
    }
    for (const mode of ['me', 'change']) {
      test(`${label}: ${mode} requires fresh login without upgrading the old token`, async () => {
        const f = fixture(role, remember)
        const pending = mode === 'me' ? f.refreshSession() : f.submit()
        await settle()
        f.requests[0].reply(mode === 'me' ? { data: { ...f.user, requires_fresh_login: true } }
          : { status: 401, data: { code: 'PASSWORD_REAUTHENTICATION_REQUIRED' } })
        await pending
        assert.equal(f.auth.getToken(), null)
        assert.deepEqual(f.redirects, ['/login?reauth=password'])
        assert.equal(f.auth.getLoginRememberPreference(), remember)
        assert.equal(f.requests.length, 1, 'Never silently login or replace tokens')
        f.location.search = ''
        assert.equal(f.auth.getLoginRememberPreference(), false, 'Ordinary login remains opt-in')
      })
    }
    test(`${label}: coded 403 restricts only the current session and leaves its persistence intact`, async () => {
      const f = fixture(role, remember, false)
      f.location.pathname = '/some-dashboard'
      const pending = assert.rejects(f.api.get('/notifications'))
      await settle()
      f.requests[0].reply({ status: 403, data: { code: 'PASSWORD_CHANGE_REQUIRED' } })
      await pending
      assert.equal(f.auth.getToken(), 'synthetic-original')
      assert.equal(f.auth.isRemembered(), remember)
      assert.equal(f.auth.getRole(), role)
      assert.equal(f.auth.getUser().must_change_password, true)
      assert.deepEqual(f.redirects, ['/change-password'])
    })
  }
}

test('same-token delayed restriction cannot undo a completed password change', async () => {
  const f = fixture('admin', false)
  const old = assert.rejects(f.api.get('/notifications'))
  await settle()
  const change = f.submit()
  await settle()
  f.requests[1].reply({ data: { user: { ...f.user, must_change_password: false } } })
  await change
  f.requests[0].reply({ status: 403, data: { code: 'PASSWORD_CHANGE_REQUIRED' } })
  await old
  assert.equal(f.auth.getUser().must_change_password, false)
  assert.deepEqual(f.redirects, [])
})

test('same-token delayed session information cannot restore the completed flag', async () => {
  const f = fixture('admin', true), old = f.refreshSession()
  await settle()
  const change = f.submit()
  await settle()
  f.requests[1].reply({ data: { user: { ...f.user, must_change_password: false } } })
  await change
  const revision = f.auth.getAuthRevision()
  f.requests[0].reply({ data: { ...f.user, must_change_password: true } })
  await old
  assert.equal(f.auth.getAuthRevision(), revision)
  assert.equal(f.auth.getUser().must_change_password, false)
  assert.deepEqual(f.redirects, [])
})

test('a same-token completion in another tab is protected before its storage event arrives', async () => {
  const f = fixture('vet', true), pending = assert.rejects(f.api.get('/notifications'))
  await settle()
  f.localStorage.setItem('user', JSON.stringify({ ...f.user, must_change_password: false }))
  f.requests[0].reply({ status: 403, data: { code: 'PASSWORD_CHANGE_REQUIRED' } })
  await pending
  assert.equal(f.auth.getUser().must_change_password, false)
  assert.deepEqual(f.redirects, [])
})

test('late session checks and fresh-login errors cannot clear a newer login', async () => {
  for (const response of [{ data: { id: 41, role: 'admin', must_change_password: true, requires_fresh_login: true } },
    { status: 401, data: { code: 'PASSWORD_REAUTHENTICATION_REQUIRED' } }]) {
    const f = fixture('admin', true), pending = f.refreshSession().catch(() => null)
    f.auth.setAuth('synthetic-new', { id: 99, role: 'vet', must_change_password: false }, false)
    const snapshot = f.auth.getAuthSnapshot()
    await settle()
    assert.equal(f.requests[0].config.headers.get('Authorization'), 'Bearer synthetic-original')
    f.requests[0].reply(response)
    await pending
    assert.equal(f.auth.isCurrentAuth(snapshot), true)
    assert.deepEqual(f.redirects, [])
  }
})

test('password restriction and reauthentication responses never override pending secure logout', async () => {
  for (const response of [{ status: 403, data: { code: 'PASSWORD_CHANGE_REQUIRED' } },
    { status: 401, data: { code: 'PASSWORD_REAUTHENTICATION_REQUIRED' } }]) {
    const f = fixture('admin', true), old = assert.rejects(f.api.get('/notifications'))
    await settle()
    const logout = f.logoutSession('synthetic-original')
    await settle()
    f.requests[0].reply(response)
    await old
    assert.deepEqual(f.redirects, [])
    assert.equal(f.requests[1].config.timeout, 5000)
    f.requests[1].reply({})
    const result = await logout
    assert.equal(result.wasCurrent, true)
    assert.equal(f.auth.getToken(), null)
  }
})

test('ordinary permission errors keep existing handling', async () => {
  const f = fixture('vet', true, false), snapshot = f.auth.getAuthSnapshot()
  const pending = assert.rejects(f.api.get('/forbidden'))
  await settle()
  f.requests[0].reply({ status: 403, data: { message: 'Forbidden' } })
  await pending
  assert.equal(f.auth.isCurrentAuth(snapshot), true)
  assert.deepEqual(f.redirects, [])
})

test('fresh-login cleanup preserves an unrelated session revealed in the other storage', () => {
  const f = fixture('admin', true)
  f.sessionStorage.setItem('token', 'synthetic-independent')
  f.sessionStorage.setItem('user', JSON.stringify({ id: 99, role: 'vet', must_change_password: false }))
  f.sessionStorage.setItem('role', 'vet')
  assert.equal(f.requirePasswordLogin(f.auth.getAuthSnapshot()), false)
  assert.equal(f.auth.getToken(), 'synthetic-independent')
  assert.equal(f.auth.getRole(), 'vet')
  assert.equal(f.auth.isRemembered(), false)
  assert.deepEqual(f.redirects, [])
  assert.equal(f.sessionStorage.getItem('password_change_remember'), null)
})

test('actual React route guards and password page work in an isolated browser', { timeout: 60000 }, async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'agribantay-password-vite-'))
  const server = await createServer({ cacheDir, plugins: [{ name: 'password-test-page', configureServer(server) {
    server.middlewares.use('/password-test', async (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml('/password-test', '<div id="root"></div><script type="module" src="/tests/force-password-change-browser.jsx"></script>')) })
  } }], server: { host: '127.0.0.1', port: 0, hmr: false } })
  await server.listen()
  const profile = await mkdtemp(path.join(tmpdir(), 'agribantay-password-browser-'))
  const browser = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'about:blank'],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  let socket
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Browser startup timeout')), 15000)
      let stderr = ''
      browser.on('error', error => { clearTimeout(timer); reject(error) })
      browser.stderr.on('data', data => { stderr += data; const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]) } })
    })
    const targets = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json()
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
    let id = 0
    const pending = new Map()
    socket.onmessage = event => { const msg = JSON.parse(event.data); if (pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) } }
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const key = ++id
      const timer = setTimeout(() => { pending.delete(key); reject(Error('DevTools timeout')) }, 15000)
      pending.set(key, response => { clearTimeout(timer); response.error ? reject(Error(JSON.stringify(response.error))) : resolve(response.result) })
      socket.send(JSON.stringify({ id: key, method, params }))
    })
    await send('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}/password-test` })
    let result
    for (let attempt = 0; attempt < 400; attempt++) {
      const value = await send('Runtime.evaluate', { expression: 'window.passwordSecurityResults', returnByValue: true })
      result = value.result.value
      if (result) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(result, 'Browser fixture must finish')
    assert.equal(result.error, undefined, result.error)
    assert.equal(result.passed.length, 39)
    console.log('Browser checks:', result.passed.join('; '))
  } finally {
    socket?.close()
    browser.kill()
    await server.close()
  }
})
