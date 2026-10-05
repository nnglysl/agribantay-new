import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { setAuth, clearAuth, isAuthenticated, getRole, getUser, getToken, isRemembered, dashboardPathForRole } from '../utils/auth'
import AuthLayout, { authFormStyles as styles } from '../components/AuthLayout'
import LegalAcknowledgmentModal from '../components/LegalAcknowledgmentModal'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function detectLoginType(value) {
  return EMAIL_RE.test(value.trim()) ? 'email' : 'phone'
}

const getDashboardPath = dashboardPathForRole

/**
 * The session this browser already holds, if it is one this page should act
 * on. Read once, at mount, so pressing Back into /login resumes where the
 * person left off instead of showing them a form they do not need.
 *
 * ?expired=1 means the axios 401 handler has just dropped the token on
 * purpose, so nothing is resumed and the explanation it set stays on screen.
 */
function resumedSession() {
  const params = new URLSearchParams(window.location.search)
  if (params.has('expired') || !isAuthenticated()) return null
  return { ...getUser(), role: getRole() }
}

// Signed in, past the temporary password, but never agreed to the terms.
// Nothing on the API enforces this — only this page does — so the shortcut
// has to re-ask rather than hand out a dashboard.
const needsLegal = (user) => !!user && !user.must_change_password && !user.legal_acknowledged_at

export default function Login() {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  // Checked by default: the session is meant to outlive closing the tab or
  // the browser, so coming back later (or pressing Back into the app) lands
  // on the dashboard instead of this form. Unchecking still confines the
  // session to sessionStorage, which ends when the tab closes.
  const [remember, setRemember] = useState(true)
  // ?expired=1 is set by the axios 401 handler when it drops a token the
  // server no longer accepts. Saying so up front explains why the person
  // was thrown back here, instead of leaving them to wonder whether they
  // clicked something wrong.
  const [error, setError] = useState(() => {
    const params = new URLSearchParams(window.location.search)

    if (!params.has('expired')) return ''

    // reason=deactivated means the account was switched off mid-session, so
    // signing in again cannot work until an administrator restores it. Same
    // wording the login endpoint returns, so the explanation reads the same
    // whether the account was already inactive or became inactive just now.
    return params.get('reason') === 'deactivated'
      ? 'Your account has been deactivated. Please contact the administrator for assistance.'
      : 'Your session has ended. Please sign in again.'
  })
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const [resumed] = useState(resumedSession)
  const [showLegalModal, setShowLegalModal] = useState(() => needsLegal(resumed))
  const [pendingUser, setPendingUser] = useState(() => (needsLegal(resumed) ? resumed : null))
  const [acknowledging, setAcknowledging] = useState(false)

  // Back-navigating far enough used to land here and look like being signed
  // out, because /login renders whatever the browser has in its history and
  // the token in storage was never consulted. Each exit below replaces this
  // entry, so Back does not bounce between the two.
  useEffect(() => {
    if (!resumed) return

    // A temporary password still has to be changed first.
    if (resumed.must_change_password) {
      navigate('/change-password', { replace: true })
      return
    }

    // The terms modal is already open from the initial state above; leaving
    // it to answer is the whole point, so no redirect here.
    if (needsLegal(resumed)) return

    navigate(getDashboardPath(resumed.role), { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')

    // Caught here rather than sent to the API so an empty field never comes
    // back as Laravel's "The password field is required." — that reads like
    // the credentials were rejected, when nothing was actually submitted.
    if (!login.trim()) {
      setError('Enter your email address or mobile number.')
      return
    }

    if (!password) {
      setError('Enter your password.')
      return
    }

    setLoading(true)
    try {
      const res = await api.post('/login', {
        login,
        password,
        login_type: detectLoginType(login),
        remember,
      })
      const { token, user } = res.data
      setAuth(token, user, remember)

      if (user.must_change_password) {
        navigate('/change-password', { replace: true })
        return
      }

      if (!user.legal_acknowledged_at) {
        setPendingUser(user)
        setShowLegalModal(true)
        return
      }

      // replace, not push: leaving /login in the history stack is what made
      // repeated Back presses end up on the login form.
      navigate(getDashboardPath(user.role), { replace: true })
    } catch (err) {
      const status = err.response?.status

      // 401 is the only case the server deliberately keeps vague, so that a
      // wrong password and an unknown account look identical and the form
      // cannot be used to discover which accounts exist. Its wording is
      // replaced here with something that tells the person what to do next.
      // Other statuses (403 inactive, 429 throttled) carry a message written
      // for the reader already, so those are passed through.
      if (status === 401) {
        setError('Incorrect email, mobile number, or password.')
      } else if (err.response?.data?.message) {
        setError(err.response.data.message)
      } else {
        setError('We couldn\'t reach the server. Check your connection and try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleAgreeAndContinue = async () => {
    if (!pendingUser) return
    setAcknowledging(true)
    try {
      await api.post('/acknowledge-legal')
      // The server has stamped legal_acknowledged_at, but the copy in
      // storage still says null. Without this the gate above would show
      // this modal again on every later visit to /login.
      setAuth(
        getToken(),
        { ...pendingUser, legal_acknowledged_at: new Date().toISOString() },
        isRemembered(),
      )
      setShowLegalModal(false)
      navigate(getDashboardPath(pendingUser.role), { replace: true })
    } catch (err) {
      setError('Something went wrong while saving your acknowledgment. Please try again.')
      setShowLegalModal(false)
    } finally {
      setAcknowledging(false)
    }
  }

  // User has a valid token by the time this modal shows (login already
  // succeeded), so Cancel must log them out — otherwise they'd have an
  // active session without ever having agreed.
  const handleCancel = async () => {
    try {
      await api.post('/logout')
    } catch (err) {
      // ignore — token may already be invalid; we're clearing it locally anyway
    }
    // clearAuth() rather than removing keys by hand: the hand-written
    // version left 'role' behind in storage and never dropped the cached
    // API responses, so the next person to sign in on this browser could
    // be served data fetched for the account that just cancelled.
    clearAuth()

    setShowLegalModal(false)
    setPendingUser(null)
    setLogin('')
    setPassword('')
  }

  return (
    <AuthLayout>
      <h1 style={styles.title}>Welcome Back</h1>
      <p style={styles.subtitle}>Login to your account to continue</p>

      <form onSubmit={handleLogin} style={styles.form} noValidate>
        {error && (
          <div style={styles.errorBox} role="alert">
            <span style={{ flexShrink: 0, marginTop: '1px' }}><ErrorIcon /></span>
            <span>{error}</span>
          </div>
        )}

        <div>
          <label style={styles.label} htmlFor="login-field">Email or Mobile Number</label>
          <div style={styles.inputWrap}>
            <span style={styles.inputIcon}><MailIcon /></span>
            <input
              id="login-field"
              className="agb-input"
              type="text"
              placeholder="Enter your email or mobile number"
              value={login}
              onChange={e => setLogin(e.target.value)}
              disabled={loading}
              style={{ ...styles.input, paddingLeft: '42px' }}
              autoComplete="username"
              required
            />
          </div>
        </div>

        <div>
          <label style={styles.label} htmlFor="password-field">Password</label>
          <div style={styles.inputWrap}>
            <span style={styles.inputIcon}><LockIcon /></span>
            <input
              id="password-field"
              className="agb-input"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
              style={{ ...styles.input, padding: '13px 46px 13px 42px' }}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="agb-icon-btn"
              onClick={() => setShowPassword(v => !v)}
              style={loginOnlyStyles.eyeBtn}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>

        <div style={loginOnlyStyles.optionRow}>
          <button type="button" onClick={() => setRemember(v => !v)} style={loginOnlyStyles.rememberBtn}>
            <span
              style={{
                ...loginOnlyStyles.checkbox,
                background: remember ? '#1f5a34' : '#fff',
                borderColor: remember ? '#1f5a34' : '#c4cabd',
              }}
            >
              {remember && <CheckIcon />}
            </span>
            Remember me
          </button>
          <button type="button" className="agb-link" onClick={() => navigate('/forgot-password')} style={loginOnlyStyles.forgotLinkBtn}>
            Forgot password?
          </button>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="agb-btn agb-primary"
          style={styles.primaryBtn}
        >
          {loading ? (
            <span style={loginOnlyStyles.loadingRow}>
              <Spinner /> Logging in...
            </span>
          ) : 'Login'}
        </button>

        <p style={loginOnlyStyles.legal}>
          By continuing, you agree to our{' '}
          <span style={loginOnlyStyles.legalLink} onClick={() => navigate('/terms')}>Terms of Service</span>{' '}
          and{' '}
          <span style={loginOnlyStyles.legalLink} onClick={() => navigate('/privacy')}>Privacy Policy</span>.
        </p>
      </form>

      {showLegalModal && (
        <LegalAcknowledgmentModal
          onAgree={handleAgreeAndContinue}
          onCancel={handleCancel}
          loading={acknowledging}
        />
      )}
    </AuthLayout>
  )
}

function MailIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
}
function LockIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
}
function CheckIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
}
function EyeIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
}
function EyeOffIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.4 5.2A9 9 0 0 1 12 5c5 0 9 5 9 7a13 13 0 0 1-2.2 2.9" /><path d="M6.6 6.6C4 8.2 3 11 3 12c0 2 4 7 9 7a9 9 0 0 0 3.2-.6" /></svg>
}
function ErrorIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
}
function Spinner() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" style={{ animation: 'agb-spin 0.7s linear infinite' }}>
      <style>{`@keyframes agb-spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

const loginOnlyStyles = {
  eyeBtn: {
    position: 'absolute', right: '7px', top: '50%', transform: 'translateY(-50%)', width: '32px', height: '32px',
    borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'none', border: 'none', cursor: 'pointer', color: '#8a968d',
  },
  optionRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '-4px' },
  rememberBtn: { display: 'inline-flex', alignItems: 'center', gap: '9px', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '13px', color: '#4b5a50', fontFamily: "'Public Sans', system-ui, sans-serif" },
  checkbox: { width: '18px', height: '18px', borderRadius: '6px', border: '1.5px solid #c4cabd', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color .15s ease, border-color .15s ease' },
  forgotLinkBtn: { fontSize: '13px', fontWeight: 700, color: '#2c8047', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: "'Public Sans', system-ui, sans-serif" },
  loadingRow: { display: 'inline-flex', alignItems: 'center', gap: '9px' },
  legal: { textAlign: 'center', fontSize: '12.5px', lineHeight: 1.6, color: '#8a968d', margin: '14px 0 0' },
  legalLink: { color: '#2c8047', fontWeight: 600, cursor: 'pointer' },
}