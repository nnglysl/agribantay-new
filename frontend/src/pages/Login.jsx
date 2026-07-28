import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { setAuth } from '../utils/auth'
import { useIsMobile } from '../hooks/useIsMobile'
import loginImg from '../assets/login_imgg.png'
import agribantayLogo from '../assets/agribantay_logo.png'
import agribantayName from '../assets/agribantay_name.png'
import sanjoseBg from '../assets/sanjosebg.png'

// Same detection Login and Forgot Password both rely on: if it has an "@"
// and looks like an email, treat it as one; otherwise treat it as a phone
// number. Backend should apply the same rule so the two stay in sync.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function detectLoginType(value) {
  return EMAIL_RE.test(value.trim()) ? 'email' : 'phone'
}

export default function Login() {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [showTermsModal, setShowTermsModal] = useState(false)
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // login_type is sent alongside the raw value so the backend doesn't
      // have to re-guess — it can validate against the right column
      // (email vs mobile_number) directly.
      const res = await api.post('/login', {
        login,
        password,
        login_type: detectLoginType(login),
        remember,
      })
      const { token, user } = res.data
      setAuth(token, user, remember)
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
        {!isMobile && (
          <div style={{ ...styles.imgCell, flex: '0 0 45%', order: 1 }}>
            <div style={{ ...styles.imgCurve, clipPath: CLIP }} />
            <div style={{ ...styles.imgClip, clipPath: CLIP }}>
              <img src={loginImg} alt="AgriBantay" style={styles.artImg} />
            </div>
          </div>
        )}

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
                By continuing, you agree to our{' '}
                <span style={styles.legalLink} onClick={() => setShowTermsModal(true)}>Terms of Service</span>{' '}
                and{' '}
                <span style={styles.legalLink} onClick={() => setShowPrivacyModal(true)}>Privacy Policy</span>.
              </p>
            </form>
          </div>
        </div>
      </div>

      {showForgotModal && <ForgotPasswordModal onClose={() => setShowForgotModal(false)} />}
      {showTermsModal && <LegalModal title="Terms of Service" onClose={() => setShowTermsModal(false)}><TermsContent /></LegalModal>}
      {showPrivacyModal && <LegalModal title="Privacy Policy" onClose={() => setShowPrivacyModal(false)}><PrivacyContent /></LegalModal>}
    </div>
  )
}

function ForgotPasswordModal({ onClose }) {
  const [contact, setContact] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      // Backend picks email vs SMS delivery based on login_type, same rule
      // as the login form uses.
      await api.post('/forgot-password', {
        login: contact,
        login_type: detectLoginType(contact),
      })
      setSubmitted(true)
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const willUseEmail = contact.trim().length > 0 && detectLoginType(contact) === 'email'

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={e => e.stopPropagation()}>
        {submitted ? (
          <>
            <h3 style={modalStyles.title}>Check your {willUseEmail ? 'email' : 'phone'}</h3>
            <p style={modalStyles.message}>
              If an account exists for that {willUseEmail ? 'email address' : 'mobile number'}, a temporary
              password has been sent{willUseEmail ? '' : ' via SMS'}. Use it to log in, and you'll be asked
              to set a new password.
            </p>
            <div style={modalStyles.actions}>
              <button onClick={onClose} className="agb-btn agb-primary" style={modalStyles.confirmBtn}>Back to login</button>
            </div>
          </>
        ) : (
          <>
            <h3 style={modalStyles.title}>Forgot password</h3>
            <p style={modalStyles.message}>
              Enter the email or mobile number linked to your account. We'll send a temporary password.
            </p>
            <form onSubmit={handleSubmit}>
              {error && <div style={modalStyles.errorBox}>{error}</div>}
              <input className="agb-input" type="text" placeholder="Email or mobile number" value={contact}
                onChange={e => setContact(e.target.value)} style={modalStyles.input} required autoFocus />
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

function LegalModal({ title, onClose, children }) {
  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.legalModal} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.legalHeader}>
          <h3 style={modalStyles.title}>{title}</h3>
          <span style={modalStyles.legalClose} onClick={onClose}>×</span>
        </div>
        <div style={modalStyles.legalBody}>{children}</div>
        <div style={modalStyles.actions}>
          <button onClick={onClose} className="agb-btn agb-primary" style={modalStyles.confirmBtn}>Close</button>
        </div>
      </div>
    </div>
  )
}

function TermsContent() {
  return (
    <>
      <p style={modalStyles.legalP}>
        AgriBantay is a poultry manure monitoring and environmental service management system provided
        for use by the Municipal Agriculture Office of San Jose, Batangas, and its registered farm owners,
        veterinarians, and administrators.
      </p>
      <p style={modalStyles.legalP}>
        By logging in, you agree to use the system only for its intended purpose — monitoring farm
        conditions, submitting or managing service requests, and coordinating environmental compliance.
        Sensor data, service records, and account information are provided to support these functions
        and should not be misrepresented or tampered with.
      </p>
      <p style={modalStyles.legalP}>
        Accounts are issued per user role (Admin, Farm Owner, or Veterinarian) and must not be shared.
        You are responsible for keeping your login credentials confidential.
      </p>
    </>
  )
}

function PrivacyContent() {
  return (
    <>
      <p style={modalStyles.legalP}>
        AgriBantay collects farm profile information, sensor readings, service request details, and
        basic account information (name, email or mobile number) solely to operate the monitoring and
        service management system for the Municipal Agriculture Office of San Jose, Batangas.
      </p>
      <p style={modalStyles.legalP}>
        Your contact information is used only for account access (login, password recovery) and for
        SMS or email notifications related to your farm's status or service requests. It is not sold
        or shared with third parties outside the Municipal Agriculture Office's operational use.
      </p>
      <p style={modalStyles.legalP}>
        Sensor and inspection data collected through the system remain associated with your registered
        farm and are used to generate alerts, reports, and recommendations relevant to environmental
        compliance monitoring.
      </p>
    </>
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
  loginBtn: { marginTop: '4px', background: '#2c8047', color: '#fff', border: 'none', borderRadius: '10px', padding: '13px', fontSize: '15px', fontWeight: 700, fontFamily: SANS, width: '100%' },
  legal: { textAlign: 'center', fontSize: '12.5px', lineHeight: 1.6, color: '#8a968d', margin: '10px 0 0' },
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

  legalModal: { background: '#fff', border: '1px solid #e9e8e0', borderRadius: '16px', padding: '28px', width: '520px', maxWidth: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 70px -20px rgba(15,38,22,0.5)' },
  legalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' },
  legalClose: { fontSize: '22px', cursor: 'pointer', color: '#9aa79d', lineHeight: 1 },
  legalBody: { overflowY: 'auto', paddingRight: '4px', marginBottom: '18px' },
  legalP: { fontSize: '13.5px', color: '#4b5a50', lineHeight: 1.65, margin: '0 0 14px' },
}