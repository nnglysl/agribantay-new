import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { setAuth } from '../utils/auth'

export default function Login() {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForgotModal, setShowForgotModal] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await api.post('/login', { login, password })
      const { token, user } = res.data

      setAuth(token, user)

      if (user.must_change_password) {
        navigate('/change-password')
        return
      }

      if (user.role === 'admin') navigate('/admin/dashboard')
      else if (user.role === 'farm_owner') navigate('/farmowner/dashboard')
      else if (user.role === 'vet') navigate('/vet/dashboard')
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      {/* Background overlay */}
      <div style={styles.overlay} />

      {/* Card */}
      <div style={styles.card}>

        {/* Left Panel */}
        <div style={styles.leftPanel}>
        <img
            src="/src/assets/login_img.png"
            alt="AgriBantay"
            style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            }}
        />
        </div>

        {/* Right Panel */}
        <div style={styles.rightPanel}>
          <h2 style={styles.welcomeTitle}>Welcome back!</h2>
          <p style={styles.welcomeSub}>San Jose Municipal Agriculture Office</p>

          <form onSubmit={handleLogin} style={styles.form}>
            {error && (
              <div style={styles.errorBox}>
                {error}
              </div>
            )}

            <div style={styles.fieldGroup}>
              <label style={styles.label}>Email or Mobile Number</label>
              <input
                type="text"
                placeholder="Enter your email or mobile number"
                value={login}
                onChange={e => setLogin(e.target.value)}
                style={styles.input}
                required
              />
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>Password</label>
              <div style={styles.passwordWrapper}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{ ...styles.input, marginBottom: 0 }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <div style={styles.forgotWrapper}>
              <button
                type="button"
                onClick={() => setShowForgotModal(true)}
                style={styles.forgotLinkBtn}
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.loginBtn,
                opacity: loading ? 0.7 : 1,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>

            <p style={styles.contactNote}>
              Need an account?{' '}
              <span style={styles.contactLink}>Contact the Municipal Office</span>
            </p>
          </form>
        </div>

      </div>

      {showForgotModal && (
        <ForgotPasswordModal onClose={() => setShowForgotModal(false)} />
      )}
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
              If an account exists for that mobile number, a temporary password
              has been sent via SMS. Use it to log in, and you'll be asked to
              set a new password.
            </p>
            <div style={modalStyles.actions}>
              <button onClick={onClose} style={modalStyles.confirmBtn}>
                Back to login
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 style={modalStyles.title}>Forgot password</h3>
            <p style={modalStyles.message}>
              Enter the mobile number linked to your account. We'll send a
              temporary password by SMS.
            </p>

            <form onSubmit={handleSubmit}>
              {error && <div style={modalStyles.errorBox}>{error}</div>}

              <input
                type="text"
                placeholder="Mobile number"
                value={mobileNumber}
                onChange={e => setMobileNumber(e.target.value)}
                style={modalStyles.input}
                required
                autoFocus
              />

              <div style={modalStyles.actions}>
                <button
                  type="button"
                  onClick={onClose}
                  style={modalStyles.cancelBtn}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    ...modalStyles.confirmBtn,
                    opacity: submitting ? 0.7 : 1,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                  disabled={submitting}
                >
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

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#6b7280">
      <path d="M607.5-372.5Q660-425 660-500t-52.5-127.5Q555-680 480-680t-127.5 52.5Q300-575 300-500t52.5 127.5Q405-320 480-320t127.5-52.5Zm-204-51Q372-455 372-500t31.5-76.5Q435-608 480-608t76.5 31.5Q588-545 588-500t-31.5 76.5Q525-392 480-392t-76.5-31.5ZM214-281.5Q94-363 40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200q-146 0-266-81.5ZM480-500Zm207.5 160.5Q782-399 832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280q113 0 207.5-59.5Z"/>
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#6b7280">
      <path d="m644-428-58-58q9-47-27-88t-93-32l-58-58q17-8 34.5-12t37.5-4q75 0 127.5 52.5T660-500q0 20-4 37.5T644-428Zm128 126-58-56q38-29 67.5-63.5T832-500q-50-101-143.5-160.5T480-720q-29 0-57 4t-55 12l-62-62q41-17 84-25.5t90-8.5q151 0 269 83.5T920-500q-23 59-60.5 109.5T772-302Zm20 246L624-222q-35 11-70.5 16.5T480-200q-151 0-269-83.5T40-500q21-53 53-98.5t73-81.5L56-792l56-56 736 736-56 56ZM222-624q-29 26-53 57t-41 67q50 101 143.5 160.5T480-280q20 0 39-2.5t39-5.5l-36-38q-11 3-21 4.5t-21 1.5q-75 0-127.5-52.5T300-500q0-11 1.5-21t4.5-21l-84-82Zm319 93Zm-151 75Z"/>
    </svg>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundImage: 'url(/src/assets/sanjosebg.png)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    padding: '24px',
    position: 'relative',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,0,0,0.3)',
  },
  card: {
    display: 'flex',
    width: '100%',
    maxWidth: '720px',
    minHeight: '440px',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    position: 'relative',
    zIndex: 1,
  },
  leftPanel: {
    flex: 1,
    overflow: 'hidden',
    padding: 0,
    backgroundColor: '#2E7D32',
    },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px',
  },
  logoIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255,255,255,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    fontWeight: 'bold',
    color: 'white',
  },
  logoText: {
    fontSize: '26px',
    fontWeight: '700',
    color: 'white',
  },
  logoSub: {
    fontSize: '13px',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: '4px',
    textAlign: 'center',
  },
  logoDesc: {
    fontSize: '12px',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: '32px',
    textAlign: 'center',
  },
  illustration: {
    fontSize: '100px',
    marginTop: '16px',
  },
  rightPanel: {
    flex: 1,
    backgroundColor: 'white',
    padding: '36px 32px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  welcomeTitle: {
    fontSize: '26px',
    fontWeight: '700',
    color: '#1a3c1a',
    marginBottom: '4px',
  },
  welcomeSub: {
    fontSize: '13px',
    color: '#888',
    marginBottom: '32px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fca5a5',
    color: '#dc2626',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '13px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#374151',
  },
  input: {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    color: '#111827',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  passwordWrapper: {
    position: 'relative',
  },
  eyeBtn: {
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotWrapper: {
    textAlign: 'right',
    marginTop: '-8px',
  },
  forgotLinkBtn: {
    fontSize: '13px',
    color: '#2E7D32',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    textDecoration: 'none',
  },
  loginBtn: {
    backgroundColor: '#2E7D32',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '12px',
    fontSize: '15px',
    fontWeight: '600',
    width: '100%',
    marginTop: '8px',
  },
  contactNote: {
    fontSize: '13px',
    color: '#888',
    textAlign: 'center',
    marginTop: '8px',
  },
  contactLink: {
    color: '#2E7D32',
    fontWeight: '500',
    cursor: 'pointer',
  },
}

const modalStyles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '28px',
    width: '380px',
    maxWidth: '90%',
  },
  title: {
    fontSize: '17px',
    fontWeight: '700',
    color: '#111827',
    marginTop: 0,
    marginBottom: '10px',
  },
  message: {
    fontSize: '14px',
    color: '#6b7280',
    lineHeight: '1.5',
    marginBottom: '20px',
  },
  input: {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    color: '#111827',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    marginBottom: '16px',
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fca5a5',
    color: '#dc2626',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    marginBottom: '16px',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
  },
  cancelBtn: {
    padding: '10px 18px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    backgroundColor: 'white',
    fontSize: '14px',
    cursor: 'pointer',
  },
  confirmBtn: {
    padding: '10px 18px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#2E7D32',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
}