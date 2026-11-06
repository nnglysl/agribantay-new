import React, { Children } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AppRouter from '../src/routes/AppRouter'
import ChangePassword from '../src/pages/ChangePassword'
import Login from '../src/pages/Login'
import DashboardLayout from '../src/components/DashboardLayout'
import api from '../src/api/axios'
import { setAuth, getToken, getRole, getUser, isRemembered, clearAuth, savePasswordLoginPreference } from '../src/utils/auth'

// Only use the actual guard from the router, with inert business pages. All
// transport uses the adapter below; no backend or live records are reachable.
const routes = Children.toArray(AppRouter().props.children.props.children.props.children)
const ProtectedRoute = routes.find(route => route.props.path === '/vet/dashboard').props.element.type
const landing = routes.find(route => route.props.path === '/').props.element
const passed = []
const check = (condition, message) => { if (!condition) throw Error(message) }
const waitFor = async predicate => {
  for (let i = 0; i < 150; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)) }
  throw Error('Browser condition timed out: ' + document.body.textContent.slice(0, 180))
}
const dashboard = role => `/${role === 'farm_owner' ? 'farmowner' : role === 'super_admin' ? 'superadmin' : role}/dashboard`
let root
function mount(role, entry = dashboard(role), realLogin = false) {
  if (root) flushSync(() => root.unmount())
  root = createRoot(document.getElementById('root'))
  flushSync(() => root.render(<React.StrictMode><MemoryRouter initialEntries={[entry]}><React.Suspense fallback={<span>Loading</span>}><Routes>
    <Route path="/" element={landing} />
    <Route path="/login" element={realLogin ? <Login /> : <span id="login">Login required</span>} />
    <Route path="/change-password" element={<ProtectedRoute passwordChange><ChangePassword /></ProtectedRoute>} />
    <Route path={dashboard(role)} element={<ProtectedRoute role={role}><DashboardLayout roleLabel={role} logoutRedirect="/"><span id="secured">Protected resource</span></DashboardLayout></ProtectedRoute>} />
    <Route path="/inherited-admin" element={<ProtectedRoute role="admin"><span id="inherited">Inherited admin access</span></ProtectedRoute>} />
  </Routes></React.Suspense></MemoryRouter></React.StrictMode>))
}
function user(role, forced) { return { id: 41, role, first_name: 'Synthetic', must_change_password: forced, requires_fresh_login: false, legal_acknowledged_at: null } }
function formValue(input, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function run() {
  for (const role of ['farm_owner', 'admin', 'super_admin', 'vet']) {
    for (const remember of [false, true]) {
      let serverUser = user(role, true), changes = 0, reads = 0
      const token = `isolated-browser-${role}-${remember}`
      api.defaults.adapter = async config => {
        check(config.headers.get('Authorization') === `Bearer ${token}`, 'Captured token must remain unchanged')
        if (config.url === '/me') { reads++; return { config, status: 200, data: serverUser, headers: {}, statusText: 'OK' } }
        if (config.url === '/notifications') return { config, status: 200, data: { data: [], unread_count: 0 }, headers: {}, statusText: 'OK' }
        if (config.url === '/logout') return { config, status: 200, data: { message: 'Synthetic logout success' }, headers: {}, statusText: 'OK' }
        check(config.url === '/change-password', 'Unexpected transport: ' + config.url)
        changes++
        serverUser = { ...serverUser, must_change_password: false }
        return { config, status: 200, data: { success: true, user: serverUser }, headers: {}, statusText: 'OK' }
      }
      // A manually edited false flag cannot open a business page before /me.
      setAuth(token, user(role, false), remember)
      mount(role)
      check(!document.getElementById('secured'), 'Do not mount protected content before session verification')
      await waitFor(() => document.querySelector('form'))
      check(reads > 0 && !document.getElementById('secured'), 'Server flag overrides browser flag')
      passed.push(`${role}/${remember}: direct route restricted`)
      const inputs = [...document.querySelectorAll('input')]
      formValue(inputs[0], 'Permanent!456')
      formValue(inputs[1], 'Permanent!456')
      await waitFor(() => !document.querySelector('button[type="submit"]').disabled)
      document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await waitFor(() => document.getElementById('secured'))
      check(changes === 1 && getToken() === token && getRole() === role && isRemembered() === remember && getUser().must_change_password === false, 'Completion preserves identity, token and persistence')
      check(reads < 8, 'No session-check or redirect loop')
      passed.push(`${role}/${remember}: completion preserved session`)
      mount(role, '/change-password')
      await waitFor(() => document.getElementById('secured'))
      check(changes === 1, 'Completed account is not asked to change twice')
      passed.push(`${role}/${remember}: completed route resumes dashboard`)
      document.querySelector('.agb-logout').click()
      await waitFor(() => [...document.querySelectorAll('button')].some(button => button.textContent === 'Log out'))
      ;[...document.querySelectorAll('button')].find(button => button.textContent === 'Log out').click()
      await waitFor(() => document.body.textContent.includes('Continuous Sensor Monitoring'))
      check(getToken() === null, 'Explicit logout must clear this session and reach the public landing page')
      passed.push(`${role}/${remember}: actual secure logout reaches landing`)
    }
  }
  for (const remember of [false, true]) {
    clearAuth()
    savePasswordLoginPreference(remember)
    history.replaceState(null, '', '/password-test?reauth=password')
    let logins = 0
    api.defaults.adapter = async config => {
      if (config.url === '/login') {
        const body = JSON.parse(config.data)
        check(body.remember === remember, 'Actual fresh-login form must retain the previous persistence choice')
        logins++
        return { config, status: 200, data: { token: 'fresh-browser-token', user: user('admin', true) }, headers: {}, statusText: 'OK' }
      }
      check(config.url === '/me', 'Fresh login must never silently create another token')
      return { config, status: 200, data: user('admin', true), headers: {}, statusText: 'OK' }
    }
    mount('admin', '/login', true)
    await waitFor(() => document.querySelector('form'))
    const inputs = [...document.querySelectorAll('form input')]
    formValue(inputs[0], 'synthetic@example.test')
    formValue(inputs[1], 'Temporary!123')
    await new Promise(resolve => setTimeout(resolve, 10))
    document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await waitFor(() => document.body.textContent.includes('Set a New Password'))
    check(logins === 1 && isRemembered() === remember && getToken() === 'fresh-browser-token', 'Fresh login retains the chosen storage and requires password change')
    passed.push(`Fresh login preserves Remember Me=${remember}`)
  }
  setAuth('isolated-offline', user('vet', false), false)
  api.defaults.adapter = async () => { throw Error('Synthetic offline session check') }
  mount('vet')
  await waitFor(() => document.body.textContent.includes('Unable to verify your session'))
  check(!document.getElementById('secured') && getToken() === 'isolated-offline', 'Failed verification must not grant content or erase credentials')
  passed.push('Session verification fails closed on network failure')
  // Simulate storage notifications from a login in another browser tab.
  // The actual browser storage event reaches the real auth subscription.
  const crossTab = user('vet', false)
  api.defaults.adapter = async config => ({ config, status: 200, data: crossTab, headers: {}, statusText: 'OK' })
  localStorage.setItem('token', 'isolated-other-tab')
  localStorage.setItem('user', JSON.stringify(crossTab))
  localStorage.setItem('role', 'vet')
  window.dispatchEvent(new StorageEvent('storage', { key: 'token' }))
  await waitFor(() => document.getElementById('secured'))
  check(getToken() === 'isolated-other-tab' && getRole() === 'vet', 'New login in another tab must become the current verified session')
  passed.push('Cross-tab login refreshes the current session')
  history.replaceState(null, '', '/password-test')
  setAuth('isolated-super', user('super_admin', false), false)
  api.defaults.adapter = async config => ({ config, status: 200, data: user('super_admin', false), headers: {}, statusText: 'OK' })
  mount('super_admin', '/inherited-admin')
  await waitFor(() => document.getElementById('inherited'))
  passed.push('Super Admin inheritance preserved')
  clearAuth()
  mount('vet', '/vet/dashboard')
  await waitFor(() => document.getElementById('login'))
  passed.push('Logged-out protected pages require authentication')
  mount('vet', '/')
  await waitFor(() => document.body.textContent.includes('Continuous Sensor Monitoring'))
  passed.push('Landing page remains public')
  root.unmount()
  window.passwordSecurityResults = { passed }
}
run().catch(error => { window.passwordSecurityResults = { error: error.stack, passed } })
