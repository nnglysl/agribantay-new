import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { setAuth } from '../utils/auth'
import { useIsMobile } from '../hooks/useIsMobile'
import loginImg from '../assets/login_imgg.png'
import agribantayLogo from '../assets/agribantay_logo.png'
import agribantayName from '../assets/agribantay_name.png'
import sanjoseBg from '../assets/sanjosebg.png'

export default function Login() {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForgotModal, setShowForgotModal] = useState(false)
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/login', { login, password })
      const { token, user } = res.data
      setAuth(token, user)
      if (user.must_change_password) { navigate('/change-password'); return }
      if (user.role === 'super_admin') navigate('/superadmin/dashboard')
      else if (user.role === 'admin') navigate('/admin/dashboard')
      else if (user.role === 'farm_owner') navigate('/farmowner/dashboard')
      else if (user.role === 'vet') navigate('/vet/dashboard')
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const CLIP = 'ellipse(100% 132% at 0% 50%)'

  return (
    <div style={{ ...styles.page, padding: isMobile ? '16px' : '30px' }}>
      <style>{`
        html, body { margin: 0; }
        .agb-input { transition: border-color .15s ease, box-shadow .15s ease; }
        .agb-input:focus { border-color: #2c8047; box-shadow: 0 0 0 3px rgba(44,128,71,0.14); background: #ffffff; }
        .agb-btn { transition: transform .12s ease, background-color .15s ease, box-shadow .15s ease; }
        .agb-btn:active { transform: translateY(1px); }
        .agb-primary:hover { background-color: #17472a; box-shadow: 0 10px 24px -10px rgba(20,48,28,0.7); }
      `}</style>

      <button type="button" onClick={() => navigate('/')} style={styles.backHome} aria-label="Back to home">
        <BackIcon /> Home
      </button>

      <div style={{ ...styles.card, flexDirection: isMobile ? 'column' : 'row', maxWidth: isMobile ? '440px' : '920px', minHeight: isMobile ? 'auto' : '600px' }}>
        {/* Illustration cell — desktop only */}
        {!isMobile && (
          <div style={{ ...styles.imgCell, flex: '0 0 45%', order: 1 }}>
            <div style={{ ...styles.imgCurve, clipPath: CLIP }} />
            <div style={{ ...styles.imgClip, clipPath: CLIP }}>
              <img src={loginImg} alt="AgriBantay" style={styles.artImg} />
            </div>
          </div>
        )}

        {/* Form cell */}
        <div style={{ ...styles.formCell, order: 2, padding: isMobile ? '34px 26px 30px' : '48px 56px' }}>
          <div style={styles.formInner}>
            <div style={styles.logoRow}>
              <img src={agribantayLogo} alt="" style={styles.logoMark} />
              <img src={agribantayName} alt="AgriBantay" style={styles.logoName} />
            </div>

            <h1 style={styles.title}>Welcome Back</h1>
            <p style={styles.subtitle}>Login to your account to continue</p>

            <form onSubmit={handleLogin} style={styles.form}>
              {error && <div style={styles.errorBox}>{error}</div>}

              <div>
                <label style={styles.label}>Email or Mobile Number</label>
                <div style={styles.inputWrap}>
                  <span style={styles.inputIcon}><MailIcon /></span>
                  <input className="agb-input" type="text" placeholder="Enter your email or mobile number"
                    value={login} onChange={e => setLogin(e.target.value)} style={{ ...styles.input, paddingLeft: '40px' }} required />
                </div>
              </div>

              <div>
                <label style={styles.label}>Password</label>
                <div style={styles.inputWrap}>
                  <span style={styles.inputIcon}><LockIcon /></span>
                  <input className="agb-input" type={showPassword ? 'text' : 'password'} placeholder="Enter your password"
                    value={password} onChange={e => setPassword(e.target.value)} style={{ ...styles.input, padding: '12px 44px 12px 40px' }} required />
                  <button type="button" onClick={() => setShowPassword(v => !v)} style={styles.eyeBtn} aria-label="Toggle password visibility">
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              <div style={styles.optionRow}>
                <button type="button" onClick={() => setRemember(v => !v)} style={styles.rememberBtn}>
                  <span style={{ ...styles.checkbox, background: remember ? '#1f5a34' : '#fff', borderColor: remember ? '#1f5a34' : '#c4cabd' }}>
                    {remember && <CheckIcon />}
                  </span>
                  Remember me
                </button>
                <button type="button" onClick={() => setShowForgotModal(true)} style={styles.forgotLinkBtn}>Forgot password?</button>
              </div>

              <button type="submit" disabled={loading} className="agb-btn agb-primary"
                style={{ ...styles.loginBtn, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading ? 'Logging in...' : 'Login'}
              </button>

              <p style={styles.legal}>
                By continuing, you agree to our <span style={styles.legalLink}>Terms of Service</span> and <span style={styles.legalLink}>Privacy Policy</span>.
              </p>
            </form>
          </div>
        </div>
      </div>

      {showForgotModal && <ForgotPasswordModal onClose={() => setShowForgotModal(false)} />}
    </div>
  )
}

function ForgotPasswordModal({ onClose }) {
  const [mobileNumber, setMobileNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await api.post('/forgot-password', { mobile_number: mobileNumber })
      setSubmitted(true)
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={e => e.stopPropagation()}>
        {submitted ? (
          <>
            <h3 style={modalStyles.title}>Check your phone</h3>
            <p style={modalStyles.message}>
              If an account exists for that mobile number, a temporary password has been sent via SMS.
              Use it to log in, and you'll be asked to set a new password.
            </p>
            <div style={modalStyles.actions}>
              <button onClick={onClose} className="agb-btn agb-primary" style={modalStyles.confirmBtn}>Back to login</button>
            </div>
          </>
        ) : (
          <>
            <h3 style={modalStyles.title}>Forgot password</h3>
            <p style={modalStyles.message}>
              Enter the mobile number linked to your account. We'll send a temporary password by SMS.
            </p>
            <form onSubmit={handleSubmit}>
              {error && <div style={modalStyles.errorBox}>{error}</div>}
              <input className="agb-input" type="text" placeholder="Mobile number" value={mobileNumber}
                onChange={e => setMobileNumber(e.target.value)} style={modalStyles.input} required autoFocus />
              <div style={modalStyles.actions}>
                <button type="button" onClick={onClose} className="agb-btn" style={modalStyles.cancelBtn} disabled={submitting}>Cancel</button>
                <button type="submit" className="agb-btn agb-primary"
                  style={{ ...modalStyles.confirmBtn, opacity: submitting ? 0.7 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}
                  disabled={submitting}>
                  {submitting ? 'Sending...' : 'Send temporary password'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Icons */
function BackIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
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

/* ---------------------------------------------------------------- Styles */
const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const styles = {
  page: {
    fontFamily: SANS, color: '#1c2a20', position: 'relative', minHeight: '100vh',
    display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
    backgroundImage: `linear-gradient(rgba(20,48,28,0.55), rgba(20,48,28,0.6)), url(${sanjoseBg})`,
    backgroundSize: 'cover', backgroundPosition: 'center',
  },
  backHome: {
    position: 'fixed', top: '22px', left: '22px', zIndex: 40, display: 'inline-flex', alignItems: 'center', gap: '8px',
    height: '40px', padding: '0 16px 0 13px', borderRadius: '999px', border: '1px solid #e3e6dd',
    background: '#fff', color: '#14301c', fontSize: '13.5px', fontWeight: 600, fontFamily: SANS,
    cursor: 'pointer', boxShadow: '0 4px 14px -6px rgba(0,0,0,0.35)',
  },
  card: {
    position: 'relative', overflow: 'hidden', display: 'flex', width: '100%', borderRadius: '22px',
    background: '#fff', boxShadow: '0 40px 90px -40px rgba(15,38,22,0.55)',
  },
  imgCell: { position: 'relative', zIndex: 2, alignSelf: 'stretch' },
  imgCurve: { position: 'absolute', top: 0, bottom: 0, left: 0, right: '-22px', background: 'linear-gradient(160deg, #35935a, #1f5a34)' },
  imgClip: { position: 'absolute', inset: 0, overflow: 'hidden', background: '#14301c' },
  artImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },

  formCell: { position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' },
  formInner: { width: '100%', maxWidth: '360px' },
  logoRow: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginBottom: '22px' },
  logoMark: { height: '54px', width: 'auto', objectFit: 'contain' },
  logoName: { height: '30px', width: 'auto', objectFit: 'contain' },
  title: { textAlign: 'center', fontSize: '25px', fontWeight: 800, letterSpacing: '-0.01em', color: '#16311d', margin: '0 0 6px' },
  subtitle: { textAlign: 'center', fontSize: '14px', color: '#6b7770', margin: '0 0 30px' },
  form: { display: 'flex', flexDirection: 'column', gap: '18px' },
  errorBox: { background: '#fdf2f2', border: '1px solid #f3c9c9', color: '#b3261e', padding: '10px 13px', borderRadius: '9px', fontSize: '13px' },
  label: { display: 'block', fontSize: '13px', fontWeight: 700, color: '#2b3830', marginBottom: '8px' },
  inputWrap: { position: 'relative' },
  inputIcon: { position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', display: 'flex', color: '#9aa79d' },
  input: {
    width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #d9dcd4', background: '#fbfbf8',
    fontSize: '14.5px', fontFamily: SANS, color: '#1c2a20', outline: 'none', boxSizing: 'border-box',
  },
  eyeBtn: {
    position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', width: '30px', height: '30px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#8a968d',
  },
  optionRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '-2px' },
  rememberBtn: { display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '13px', color: '#4b5a50', fontFamily: SANS },
  checkbox: { width: '17px', height: '17px', borderRadius: '5px', border: '1.5px solid #c4cabd', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  forgotLinkBtn: { fontSize: '13px', fontWeight: 600, color: '#2c8047', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: SANS },
  loginBtn: { marginTop: '4px', background: '#2c8047', color: '#fff', border: 'none', borderRadius: '10px', padding: '13px', fontSize: '15px', fontWeight: 700, fontFamily: SANS, width: '100%' },  legal: { textAlign: 'center', fontSize: '12.5px', lineHeight: 1.6, color: '#8a968d', margin: '10px 0 0' },
  legalLink: { color: '#2c8047', fontWeight: 600, cursor: 'pointer' },
}

const modalStyles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,38,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '20px' },
  modal: { background: '#fff', border: '1px solid #e9e8e0', borderRadius: '16px', padding: '28px', width: '400px', maxWidth: '100%', boxShadow: '0 30px 70px -20px rgba(15,38,22,0.5)' },
  title: { fontSize: '20px', fontWeight: 800, color: '#16311d', margin: '0 0 10px' },
  message: { fontSize: '14px', color: '#647065', lineHeight: 1.55, margin: '0 0 20px' },
  input: { padding: '12px 14px', borderRadius: '10px', border: '1px solid #d9dcd4', background: '#fbfbf8', fontSize: '14.5px', fontFamily: SANS, color: '#1c2a20', outline: 'none', width: '100%', boxSizing: 'border-box', marginBottom: '18px' },
  errorBox: { background: '#fdf2f2', border: '1px solid #f3c9c9', color: '#b3261e', padding: '10px 13px', borderRadius: '9px', fontSize: '13px', marginBottom: '16px' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px' },
  cancelBtn: { padding: '11px 18px', borderRadius: '10px', border: '1px solid #d9dcd4', background: '#fff', fontSize: '14px', fontWeight: 600, color: '#33413a', cursor: 'pointer' },
  confirmBtn: { padding: '11px 18px', borderRadius: '10px', border: 'none', background: '#2c8047 ', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer' },
}