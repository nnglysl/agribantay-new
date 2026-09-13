import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api/axios'
import AuthLayout, { authFormStyles as styles } from '../components/AuthLayout'

export default function EnterAccountInfo() {
  const { channel } = useParams() // 'email' | 'sms'
  const navigate = useNavigate()
  const [login, setLogin] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isEmail = channel === 'email'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await api.post('/password/otp/request', { login, channel: isEmail ? 'email' : 'sms' })
      navigate('/verify-code', { state: { login, channel } })
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout onBack={() => navigate('/forgot-password')} backLabel="Back">
      <h1 style={styles.title}>{isEmail ? 'Enter your email' : 'Enter your mobile number'}</h1>
      <p style={styles.subtitle}>
        Enter your registered {isEmail ? 'email address' : 'mobile number'} and we will send you a 6-digit verification code.
      </p>

      <form onSubmit={handleSubmit} style={styles.form}>
        {error && <div style={styles.errorBox}>{error}</div>}

        <div>
          <label style={styles.label}>{isEmail ? 'Email Address' : 'Mobile Number'}</label>
          <input
            className="agb-input"
            type={isEmail ? 'email' : 'tel'}
            placeholder={isEmail ? 'Enter your registered email' : '09XX XXX XXXX'}
            value={login}
            onChange={e => setLogin(e.target.value)}
            style={styles.input}
            required
            autoFocus
          />
        </div>

        <button type="submit" disabled={submitting} className="agb-btn agb-primary"
          style={{ ...styles.primaryBtn, opacity: submitting ? 0.7 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}>
          {submitting ? 'Sending...' : 'Send Code'}
        </button>
      </form>

      <button type="button" style={styles.linkBtn} onClick={() => navigate(isEmail ? '/forgot-password/sms' : '/forgot-password/email')}>
        Use {isEmail ? 'phone number' : 'email'} instead
      </button>
    </AuthLayout>
  )
}