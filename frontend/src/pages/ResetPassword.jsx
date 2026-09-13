import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '../api/axios'
import AuthLayout, { authFormStyles as styles } from '../components/AuthLayout'
import { validatePassword } from '../utils/passwordValidation'
import PasswordStrengthIndicator from '../components/PasswordStrengthIndicator'

function EyeIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
}
function EyeOffIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.4 5.2A9 9 0 0 1 12 5c5 0 9 5 9 7a13 13 0 0 1-2.2 2.9" /><path d="M6.6 6.6C4 8.2 3 11 3 12c0 2 4 7 9 7a9 9 0 0 0 3.2-.6" /></svg>
}

export default function ResetPassword() {
  const navigate = useNavigate()
  const location = useLocation()
  const { reset_token } = location.state || {}

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!reset_token) navigate('/forgot-password', { replace: true })
  }, [reset_token, navigate])

  const { allValid } = validatePassword(newPassword)
  const passwordsMatch = newPassword && newPassword === confirmPassword
  const canSubmit = allValid && passwordsMatch

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!canSubmit) { setError('Please make sure your password meets all requirements and matches.'); return }

    setLoading(true)
    try {
      await api.post('/password/reset', {
        reset_token,
        new_password: newPassword,
        new_password_confirmation: confirmPassword,
      })
      navigate('/password-reset-success')
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try the reset process again.')
    } finally {
      setLoading(false)
    }
  }

  if (!reset_token) return null

  return (
    <AuthLayout onBack={() => navigate('/forgot-password')} backLabel="Back">
      <h1 style={styles.title}>Set New Password</h1>
      <p style={styles.subtitle}>Create a new password for your account.</p>

      <form onSubmit={handleSubmit} style={styles.form}>
        {error && <div style={styles.errorBox}>{error}</div>}

        <div>
          <label style={styles.label}>New Password</label>
          <div style={styles.inputWrap}>
            <input
              className="agb-input"
              type={showNewPassword ? 'text' : 'password'}
              placeholder="Enter new password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              style={{ ...styles.input, paddingRight: '44px' }}
              required
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(v => !v)}
              style={localStyles.eyeBtn}
              aria-label="Toggle new password visibility"
            >
              {showNewPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          <PasswordStrengthIndicator password={newPassword} />
        </div>

        <div>
          <label style={styles.label}>Confirm New Password</label>
          <div style={styles.inputWrap}>
            <input
              className="agb-input"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              style={{ ...styles.input, paddingRight: '44px' }}
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(v => !v)}
              style={localStyles.eyeBtn}
              aria-label="Toggle confirm password visibility"
            >
              {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          {confirmPassword && !passwordsMatch && (
            <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '6px' }}>Passwords do not match.</div>
          )}
        </div>

        <button type="submit" disabled={loading || !canSubmit} className="agb-btn agb-primary"
          style={{ ...styles.primaryBtn, opacity: (loading || !canSubmit) ? 0.5 : 1, cursor: (loading || !canSubmit) ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Saving...' : 'Reset Password'}
        </button>
      </form>
    </AuthLayout>
  )
}

const localStyles = {
  eyeBtn: {
    position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', width: '30px', height: '30px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#8a968d',
  },
}