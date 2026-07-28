const TOKEN_KEY = 'token'
const USER_KEY = 'user'
const ROLE_KEY = 'role'

// "Remember me" decides WHERE the session lives:
// - remember = true  -> localStorage   (survives closing the browser)
// - remember = false -> sessionStorage (cleared when the tab/browser closes)
// Defaults to true so existing callers like ChangePassword.jsx that call
// setAuth(token, user) without a third argument keep behaving exactly as
// they did before this change.
export const setAuth = (token, user, remember = true) => {
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
}

export const isAuthenticated = () => !!getToken()