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
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div style={styles.forgotWrapper}>
              <a href="#" style={styles.forgotLink}>Forgot password?</a>
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
    </div>
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
    maxWidth: '900px',
    minHeight: '520px',
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
    padding: '48px 40px',
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
    fontSize: '16px',
    padding: 0,
  },
  forgotWrapper: {
    textAlign: 'right',
    marginTop: '-8px',
  },
  forgotLink: {
    fontSize: '13px',
    color: '#2E7D32',
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