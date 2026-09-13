import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { setAuth } from '../utils/auth'
import AuthLayout, { authFormStyles as styles } from '../components/AuthLayout'
import LegalAcknowledgmentModal from '../components/LegalAcknowledgmentModal'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function detectLoginType(value) {
  return EMAIL_RE.test(value.trim()) ? 'email' : 'phone'
}

function getDashboardPath(role) {
  if (role === 'super_admin') return '/superadmin/dashboard'
  if (role === 'admin') return '/admin/dashboard'
  if (role === 'farm_owner') return '/farmowner/dashboard'
  if (role === 'vet') return '/vet/dashboard'
  return '/'
}

export default function Login() {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const [showLegalModal, setShowLegalModal] = useState(false)
  const [pendingUser, setPendingUser] = useState(null)
  const [acknowledging, setAcknowledging] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
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
        navigate('/change-password')
        return
      }

      if (!user.legal_acknowledged_at) {
        setPendingUser(user)
        setShowLegalModal(true)
        return
      }

      navigate(getDashboardPath(user.role))
    } catch (err) {
      setError(err.response?.data?.message || 'We couldn\'t log you in. Please check your details and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleAgreeAndContinue = async () => {
    if (!pendingUser) return
    setAcknowledging(true)
    try {
      await api.post('/acknowledge-legal')
      setShowLegalModal(false)
      navigate(getDashboardPath(pendingUser.role))
    } catch (err) {
      setError('Something went wrong while saving your acknowledgment. Please try again.')
      setShowLegalModal(false)
    } finally {
      setAcknowledging(false)
    }
  }

  // User has a valid token by the time this modal shows (login already
  // succeeded), so Cancel must log them out — otherwise they'd have an
  // active session without ever having agreed. Adjust the storage-clearing
  // lines below if utils/auth.js exposes a dedicated clearAuth()/logout()
  // helper instead of raw localStorage/sessionStorage keys.
  const handleCancel = async () => {
    try {
      await api.post('/logout')
    } catch (err) {
      // ignore — token may already be invalid; we're clearing it locally anyway
    }
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('user')

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