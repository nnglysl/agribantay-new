import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createContext, runInContext } from 'node:vm'
import { parse } from '@babel/parser'
import { isValidPhoneNumber, PHONE_VALIDATION_MESSAGE } from '../src/utils/phoneValidation.js'

// Execute the actual auth functions and profile-save handlers in isolation.
// No React mounting, Axios imports, Vite server, database, or network is used.
const authSource = readFileSync(new URL('../src/utils/auth.js', import.meta.url), 'utf8')
const authAst = parse(authSource, { sourceType: 'module' })
const authCode = authAst.program.body.map(node => {
  if (node.type === 'ImportDeclaration') return ''
  const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node
  return authSource.slice(declaration.start, declaration.end)
}).join('\n')

const settings = new Map(['admin', 'vet', 'farmowner'].map(directory => {
  const source = readFileSync(new URL(`../src/pages/${directory}/Settings.jsx`, import.meta.url), 'utf8')
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] })
  const component = ast.program.body.find(node => node.type === 'ExportDefaultDeclaration').declaration
  const declarations = ['loadProfile', 'handleProfileSave'].map(name => {
    const declaration = component.body.body.find(node => node.type === 'VariableDeclaration'
      && node.declarations.some(item => item.id.name === name))
    assert.ok(declaration, `${directory}: ${name} must be found in the real component`)
    return source.slice(declaration.start, declaration.end)
  })
  const authImport = ast.program.body.find(node => node.type === 'ImportDeclaration' && node.source.value.endsWith('/utils/auth'))
  return [directory, { code: declarations.join('\n'), authNames: authImport.specifiers.map(node => node.imported.name) }]
}))

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
  let resolve, reject
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}

function fixture(role, remember, { emailChanged = false, phone = '09900000001' } = {}) {
  const localStorage = storage(), sessionStorage = storage()
  const authContext = createContext({ localStorage, sessionStorage, clearAllCache() {} })
  runInContext(authCode, authContext)
  const auth = runInContext('({ setAuth, getToken, getUser, getRole, isRemembered, clearAuth })', authContext)
  const originalUser = { id: 41, role, first_name: 'Before', last_name: 'Save',
    must_change_password: false, legal_acknowledged_at: '2026-10-01T00:00:00Z' }
  const token = `synthetic-${role}-${remember}`
  auth.setAuth(token, originalUser, remember)

  const post = deferred(), reload = deferred(), otp = deferred()
  const postStarted = deferred(), reloadStarted = deferred(), otpStarted = deferred()
  const calls = []
  const updated = { first_name: 'After', last_name: 'Update', email: 'before@example.test', mobile_number: phone }
  const api = {
    post(url, body, options) {
      calls.push({ method: 'POST', url, body, options })
      if (url === '/settings/email/otp/request') { otpStarted.resolve(); return otp.promise }
      assert.equal(url, '/settings/profile', 'No unexpected API request is allowed')
      postStarted.resolve()
      return post.promise
    },
    get(url) {
      calls.push({ method: 'GET', url })
      assert.equal(url, '/settings', 'No unexpected API request is allowed')
      reloadStarted.resolve()
      return reload.promise
    },
  }
  const state = { profile: { ...updated, first_name: 'Before', last_name: 'Save' },
    firstName: updated.first_name, lastName: updated.last_name, mobileNumber: phone,
    email: emailChanged ? 'after@example.test' : updated.email, isEditing: true }
  const bindings = { ...state, api, FormData, isValidPhoneNumber, PHONE_VALIDATION_MESSAGE }
  for (const name of ['Profile', 'FirstName', 'LastName', 'Email', 'MobileNumber',
    'ProfileError', 'ProfileSuccess', 'ProfileLoading', 'IsEditing', 'PendingEmail']) {
    const key = name[0].toLowerCase() + name.slice(1)
    bindings[`set${name}`] = value => { state[key] = value }
  }
  const page = settings.get(role === 'farm_owner' ? 'farmowner' : role === 'super_admin' ? 'admin' : role)
  for (const name of page.authNames) bindings[name] = auth[name]
  const context = createContext(bindings)
  runInContext(page.code, context)
  const save = runInContext('handleProfileSave', context)
  const snapshot = () => ({ local: localStorage.snapshot(), session: sessionStorage.snapshot() })
  return { auth, originalUser, token, post, reload, otp, postStarted, reloadStarted, otpStarted,
    updated, calls, state, snapshot, save: () => save({ preventDefault() {} }) }
}

function assertPreserved(f, remember) {
  assert.equal(f.auth.getToken(), f.token)
  assert.equal(f.auth.getRole(), f.originalUser.role)
  assert.equal(f.auth.isRemembered(), remember)
  const saved = JSON.parse((remember ? f.snapshot().local : f.snapshot().session).user)
  assert.deepEqual(saved, { ...f.originalUser, first_name: 'After', last_name: 'Update' })
  assert.deepEqual(remember ? f.snapshot().session : f.snapshot().local, {})
}

for (const role of ['admin', 'super_admin', 'vet', 'farm_owner']) {
  for (const remember of [false, true]) {
    const label = `${role} ${remember ? 'remembered' : 'unremembered'}`

    test(`${label}: profile save preserves storage, token, identity and role`, async () => {
      const f = fixture(role, remember), pending = f.save()
      await f.postStarted.promise
      assert.deepEqual([...f.calls[0].body.entries()], [
        ['first_name', 'After'], ['last_name', 'Update'], ['mobile_number', '09900000001'],
      ])
      assert.equal(f.calls[0].options.params._method, 'PUT')
      f.post.resolve({})
      await f.reloadStarted.promise
      f.reload.resolve({ data: { data: f.updated } })
      await pending
      assertPreserved(f, remember)
      assert.equal(f.state.profileSuccess, 'Profile updated successfully.')
      assert.equal(f.state.isEditing, false)
      assert.equal(f.state.profileLoading, false)
    })

    for (const stage of ['save', 'reload']) {
      test(`${label}: failed ${stage} leaves authentication unchanged`, async () => {
        const f = fixture(role, remember), before = f.snapshot(), pending = f.save()
        await f.postStarted.promise
        const failure = { response: { data: { message: 'Synthetic save failure' } } }
        if (stage === 'save') f.post.reject(failure)
        else {
          f.post.resolve({})
          await f.reloadStarted.promise
          f.reload.reject(failure)
        }
        await pending
        assert.deepEqual(f.snapshot(), before)
        assert.equal(f.state.profileError, 'Synthetic save failure')
        assert.equal(f.state.profileLoading, false)
      })
    }

    for (const stage of ['save', 'reload']) {
      for (const replacement of ['logout', 'same-account login', 'different-account login']) {
        test(`${label}: ignores ${stage} response after ${replacement}`, async () => {
          const f = fixture(role, remember), pending = f.save()
          await f.postStarted.promise
          if (stage === 'reload') { f.post.resolve({}); await f.reloadStarted.promise }
          if (replacement === 'logout') f.auth.clearAuth()
          else {
            const user = replacement === 'same-account login' ? f.originalUser
              : { ...f.originalUser, id: 99, role: role === 'vet' ? 'farm_owner' : 'vet', first_name: 'New login' }
            f.auth.setAuth('synthetic-newer-login-token', user, !remember)
          }
          const current = f.snapshot()
          if (stage === 'save') f.post.resolve({})
          // Also resolve the reload for the old implementation to expose its stale write.
          f.reload.resolve({ data: { data: f.updated } })
          await pending
          assert.deepEqual(f.snapshot(), current)
          assert.equal(f.state.profile.first_name, 'Before', 'Stale profile data must not replace current UI state')
          assert.equal(f.state.profileSuccess, '')
          if (stage === 'save') assert.equal(f.calls.filter(call => call.method === 'GET').length, 0)
        })
      }
    }

    test(`${label}: email verification flow preserves the session choice`, async () => {
      const f = fixture(role, remember, { emailChanged: true }), pending = f.save()
      await f.otpStarted.promise
      f.otp.resolve({})
      await f.postStarted.promise
      f.post.resolve({})
      await f.reloadStarted.promise
      f.reload.resolve({ data: { data: f.updated } })
      await pending
      assertPreserved(f, remember)
      assert.equal(f.state.pendingEmail, 'after@example.test')
    })

    test(`${label}: logout during email OTP prevents a later profile request`, async () => {
      const f = fixture(role, remember, { emailChanged: true }), pending = f.save()
      await f.otpStarted.promise
      f.auth.clearAuth()
      const current = f.snapshot()
      f.otp.resolve({})
      f.post.resolve({})
      f.reload.resolve({ data: { data: f.updated } })
      await pending
      assert.deepEqual(f.snapshot(), current)
      assert.equal(f.calls.length, 1)
    })

    test(`${label}: invalid phone still prevents profile submission`, async () => {
      const f = fixture(role, remember, { phone: 'invalid' }), before = f.snapshot()
      await f.save()
      assert.equal(f.calls.length, 0)
      assert.deepEqual(f.snapshot(), before)
      assert.equal(f.state.profileError, PHONE_VALIDATION_MESSAGE)
    })
  }
}

test('setAuth keeps its existing remembered default', () => {
  const f = fixture('admin', false)
  f.auth.setAuth(f.token, f.originalUser)
  assert.equal(f.auth.isRemembered(), true)
  assert.deepEqual(f.snapshot().session, {})
})
