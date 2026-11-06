import { clearAllCache } from '../hooks/useCachedFetch'

const TOKEN_KEY = 'token'
const USER_KEY = 'user'
const ROLE_KEY = 'role'
const REAUTH_REMEMBER_KEY = 'password_change_remember'
let authRevision = 0
const authListeners = new Set()
const notifyAuth = () => {
  authRevision++
  authListeners.forEach(listener => listener())
}
const onAuthStorage = event => {
  if (event.key === null || [TOKEN_KEY, USER_KEY, ROLE_KEY].includes(event.key)) notifyAuth()
}

export const getAuthRevision = () => authRevision
export const subscribeAuth = listener => {
  authListeners.add(listener)
  if (authListeners.size === 1 && typeof window !== 'undefined') window.addEventListener?.('storage', onAuthStorage)
  return () => {
    authListeners.delete(listener)
    if (authListeners.size === 0 && typeof window !== 'undefined') window.removeEventListener?.('storage', onAuthStorage)
  }
}

// "Remember me" decides WHERE the session lives:
// - remember = true  -> localStorage   (survives closing the browser)
// - remember = false -> sessionStorage (cleared when the tab/browser closes)
// Defaults to true so existing callers like ChangePassword.jsx that call
// setAuth(token, user) without a third argument keep behaving exactly as
// they did before this change.
export const setAuth = (token, user, remember = true) => {
  const previous = getUser()
  const changed = getToken() !== token || previous.id !== user.id || previous.role !== user.role
    || isRemembered() !== remember || !!previous.must_change_password !== !!user.must_change_password
    || !!previous.requires_fresh_login !== !!user.requires_fresh_login
  const store = remember ? localStorage : sessionStorage
  const other = remember ? sessionStorage : localStorage

  // Clear the other storage so a stale token doesn't linger there from a
  // previous login that used the opposite "remember me" choice.
  other.removeItem(TOKEN_KEY)
  other.removeItem(USER_KEY)
  other.removeItem(ROLE_KEY)

  store.setItem(TOKEN_KEY, token)
  store.setItem(USER_KEY, JSON.stringify(user))
  store.setItem(ROLE_KEY, user.role)
  sessionStorage.removeItem(REAUTH_REMEMBER_KEY)

  // A previous session (possibly a different user/role) may have left
  // role-dependent responses cached under the same URL — e.g. a farm's
  // Service Requests tab returns different data for Admin vs Super Admin
  // from the identical endpoint. Never carry that across identities.
  clearAllCache()
  if (changed) notifyAuth()
}

export const getToken = () =>
  localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY)

export const getUser = () => {
  const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY)
  return raw ? JSON.parse(raw) : {}
}

export const getRole = () =>
  localStorage.getItem(ROLE_KEY) || sessionStorage.getItem(ROLE_KEY)

// Lets other pages check whether the current session is in localStorage
// ("remembered") or sessionStorage, so re-saving auth data (e.g. after a
// forced password change) can preserve the user's original choice instead
// of silently defaulting to "remembered".
export const isRemembered = () => !!localStorage.getItem(TOKEN_KEY)

export const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(ROLE_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(USER_KEY)
  sessionStorage.removeItem(ROLE_KEY)
  sessionStorage.removeItem(REAUTH_REMEMBER_KEY)
  clearAllCache()
  notifyAuth()
}

// A delayed logout may finish after another login. Remove only its token's
// storage entries, and leave a newer session's cache and navigation alone.
export const clearAuthForToken = token => {
  if (!token) return false
  const wasCurrent = getToken() === token
  for (const store of [localStorage, sessionStorage]) {
    if (store.getItem(TOKEN_KEY) !== token) continue
    store.removeItem(TOKEN_KEY)
    store.removeItem(USER_KEY)
    store.removeItem(ROLE_KEY)
  }
  if (wasCurrent) {
    sessionStorage.removeItem(REAUTH_REMEMBER_KEY)
    clearAllCache()
    notifyAuth()
  }
  return wasCurrent
}

export const getAuthSnapshot = () => ({
  token: getToken(), id: getUser().id, role: getRole(), remember: isRemembered(), revision: authRevision,
  forced: !!getUser().must_change_password, fresh: !!getUser().requires_fresh_login,
})

export const isCurrentAuth = snapshot => !!snapshot?.token && snapshot.token === getToken()
  && snapshot.id === getUser().id && snapshot.role === getRole()
  && snapshot.remember === isRemembered() && snapshot.revision === authRevision
  && snapshot.forced === !!getUser().must_change_password && snapshot.fresh === !!getUser().requires_fresh_login

// Carry only the persistence choice across a forced fresh login, in this tab.
// No token, password, or identity is upgraded or copied into a new session.
export const savePasswordLoginPreference = remember => {
  sessionStorage.setItem(REAUTH_REMEMBER_KEY, remember ? '1' : '0')
}
export const getLoginRememberPreference = () => new URLSearchParams(window.location.search).get('reauth') === 'password'
  && sessionStorage.getItem(REAUTH_REMEMBER_KEY) === '1'

export const isAuthenticated = () => !!getToken()

// Where each role's signed-in session belongs. Lives here rather than in
// Login.jsx because the router needs the same answer: an already-signed-in
// browser that lands back on /login (by pressing Back, or by reopening a
// tab) has to be sent to its own dashboard, not shown the form again.
export const dashboardPathForRole = (role) => {
  if (role === 'super_admin') return '/superadmin/dashboard'
  if (role === 'admin') return '/admin/dashboard'
  if (role === 'farm_owner') return '/farmowner/dashboard'
  if (role === 'vet') return '/vet/dashboard'
  return '/'
}