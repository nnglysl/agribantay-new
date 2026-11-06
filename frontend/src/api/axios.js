import axios from 'axios'
import { getToken, getUser, setAuth, clearAuth, clearAuthForToken, getAuthSnapshot, isCurrentAuth, savePasswordLoginPreference } from '../utils/auth'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Accept': 'application/json',
  },
})

const isLogoutRequest = config => config?.method?.toLowerCase() === 'post' && config?.url === '/logout'
const pendingLogouts = new Map()
const sessionChecks = new Map()

export const requirePasswordLogin = snapshot => {
  if (!isCurrentAuth(snapshot) || pendingLogouts.has(snapshot.token)) return false
  clearAuthForToken(snapshot.token)
  if (getToken()) return false
  savePasswordLoginPreference(snapshot.remember)
  window.location.replace('/login?reauth=password')
  return true
}

export const refreshSession = (snapshot = getAuthSnapshot()) => {
  if (!snapshot.token) return Promise.resolve(null)
  const key = `${snapshot.token}:${snapshot.revision}`
  if (sessionChecks.has(key)) return sessionChecks.get(key)
  const request = api.get('/me', { authSnapshot: snapshot, timeout: 5000 })
    .then(({ data: user }) => {
      if (!isCurrentAuth(snapshot) || pendingLogouts.has(snapshot.token)) return null
      if (user.must_change_password && user.requires_fresh_login) {
        requirePasswordLogin(snapshot)
        return null
      }
      const updated = { ...getUser(), ...user }
      if (JSON.stringify(updated) !== JSON.stringify(getUser())) setAuth(snapshot.token, updated, snapshot.remember)
      return { user: updated, snapshot: getAuthSnapshot() }
    })
    .finally(() => sessionChecks.delete(key))
  sessionChecks.set(key, request)
  return request
}

// Keep logout in charge of cleanup until revocation settles. Concurrent 401s
// from polling must not redirect away from the chosen logout destination.
export const logoutSession = token => {
  if (!token) {
    const wasCurrent = !getToken()
    if (wasCurrent) clearAuth()
    return Promise.resolve({ wasCurrent, unconfirmed: false })
  }
  if (pendingLogouts.has(token)) return pendingLogouts.get(token)

  const request = api.post('/logout', null, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 5000,
  })
    // A 401 means the token is already unusable; it does not prove deletion.
    .then(() => false, error => error.response?.status !== 401)
    .then(unconfirmed => ({ wasCurrent: clearAuthForToken(token), unconfirmed }))
    .finally(() => pendingLogouts.delete(token))
  pendingLogouts.set(token, request)
  return request
}

api.interceptors.request.use((config) => {
  const token = getToken()
  const snapshot = config.authSnapshot ?? getAuthSnapshot()
  config.authSnapshot = snapshot
  // Logout must keep the captured token even if another login happens before
  // this interceptor runs. Other requests retain their existing auth behavior.
  const pinnedLogout = isLogoutRequest(config) && config.headers.get('Authorization')
  if (['/me', '/change-password'].includes(config.url) && snapshot.token) {
    config.headers.Authorization = `Bearer ${snapshot.token}`
  } else if (token && !pinnedLogout) {
    config.headers.Authorization = `Bearer ${token}`
  }

  if (!(config.data instanceof FormData) && !config.headers['Content-Type']) {
    config.headers['Content-Type'] = 'application/json'
  }

  return config
})

// Paths where a 401 is a normal, expected answer rather than an expired
// session: signing in with the wrong password, or entering a bad
// verification code. Those screens show their own message and must not be
// bounced to the login page mid-flow.
const AUTH_ENDPOINTS = ['/login', '/password/otp/']

/**
 * A 401 means the token this browser is holding is no longer accepted — it
 * was revoked, the row was removed, or it belongs to an older deployment.
 *
 * Without this, the rejected request simply became a component's `error`
 * state, so the app rendered Laravel's raw "Unauthenticated." as red text
 * INSIDE the signed-in shell: the sidebar still showed a name and role read
 * from localStorage, and every page stayed broken until the user guessed to
 * clear their storage or log out by hand.
 *
 * The stale credentials are dropped and the browser is sent to the login
 * page, which is the only action that can actually fix the situation.
 * Using window.location rather than the router keeps this usable from here,
 * outside React, and guarantees no component keeps stale state.
 */
api.interceptors.response.use(
  response => response,
  error => {
    const status = error.response?.status
    const url = error.config?.url || ''
    const isAuthCall = AUTH_ENDPOINTS.some(path => url.includes(path))
    const token = getToken()
    const authorization = error.config?.headers?.get?.('Authorization') ?? error.config?.headers?.Authorization
    const snapshot = error.config?.authSnapshot
    const code = error.response?.data?.code

    if (status === 401 && code === 'PASSWORD_REAUTHENTICATION_REQUIRED') {
      requirePasswordLogin(snapshot)
      return Promise.reject(error)
    }
    if (status === 403 && code === 'PASSWORD_CHANGE_REQUIRED') {
      if (isCurrentAuth(snapshot) && !pendingLogouts.has(snapshot.token)) {
        setAuth(snapshot.token, { ...getUser(), must_change_password: true }, snapshot.remember)
        if (window.location.pathname !== '/change-password') window.location.replace('/change-password')
      }
      return Promise.reject(error)
    }

    // Explicit logout owns its cleanup/destination. A late 401 from an older
    // request must also never clear a newer login.
    if (status === 401 && !isAuthCall && !isLogoutRequest(error.config) && !pendingLogouts.has(token)
      && token && authorization === `Bearer ${token}`) {
      clearAuth()

      // A 401 now has two distinct causes, and they need different wording on
      // the login screen: an ordinary expired/revoked token, or the account
      // itself having been deactivated while the user was signed in (the
      // 'active' middleware answers with 401 so this same handler catches it).
      // Telling the two apart here is what lets the login page explain that an
      // administrator has to restore the account, rather than inviting a
      // sign-in that is guaranteed to fail.
      const deactivated = /deactivated/i.test(error.response?.data?.message || '')
      const target = deactivated ? '/login?expired=1&reason=deactivated' : '/login?expired=1'

      // Guard against redirect loops if a 401 somehow arrives while the
      // login page itself is open.
      if (!window.location.pathname.startsWith('/login')) {
        window.location.replace(target)
      }
    }

    return Promise.reject(error)
  }
)

export default api