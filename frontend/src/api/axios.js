import axios from 'axios'
import { getToken, clearAuth } from '../utils/auth'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Accept': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
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

    if (status === 401 && !isAuthCall && getToken()) {
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