import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '../api/axios'
import AuthLayout, { authFormStyles as styles } from '../components/AuthLayout'
import { BtnBusy } from '../components/Loading'
import OtpInput from '../components/OtpInput'

const RESEND_COOLDOWN = 60
const OTP_TTL_SECONDS = 10 * 60

function formatCountdown(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function VerifyCode() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, channel } = location.state || {}

  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN)
  const [expiresIn, setExpiresIn] = useState(OTP_TTL_SECONDS)

  useEffect(() => {
    if (!login || !channel) navigate('/forgot-password', { replace: true })
  }, [login, channel, navigate])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setInterval(() => setResendCooldown(c => c - 1), 1000)
    return () => clearInterval(t)
  }, [resendCooldown])

  useEffect(() => {
    if (expiresIn <= 0) return
    const t = setInterval(() => setExpiresIn(c => c - 1), 1000)
    return () => clearInterval(t)
  }, [expiresIn])

  const handleVerify = async (e) => {
    e.preventDefault()
    setError('')
    if (code.length !== 6) { setError('Please enter all 6 digits.'); return }

    setVerifying(true)
    try {
      const res = await api.post('/password/otp/verify', { login, channel, code })
      navigate('/reset-password', { state: { reset_token: res.data.reset_token } })
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired code.')
    } finally {
      setVerifying(false)
    }
  }

  const handleResend = async () => {
    setError('')
    setResending(true)
    try {
      await api.post('/password/otp/request', { login, channel })
      setResendCooldown(RESEND_COOLDOWN)
      setExpiresIn(OTP_TTL_SECONDS)
      setCode('')
    } catch {
      setError('Failed to resend code. Please try again.')
    } finally {
      setResending(false)
    }
  }

  if (!login || !channel) return null

  return (
    <AuthLayout onBack={() => navigate('/forgot-password')} backLabel="Back">
      <h1 style={styles.title}>Enter Verification Code</h1>
      <p style={styles.subtitle}>
        Enter the 6-digit code sent to<br /><strong style={{ color: '#16311d' }}>{login}</strong>
      </p>

      <form onSubmit={handleVerify} style={styles.form}>
        {error && <div style={styles.errorBox}>{error}</div>}

        <OtpInput value={code} onChange={setCode} disabled={verifying} />

        <p style={otpStyles.expiry}>
          {expiresIn > 0 ? `The code will expire in ${formatCountdown(expiresIn)}` : 'This code has expired — please resend.'}
        </p>

        <button type="submit" disabled={verifying} className="agb-btn agb-primary"
          style={{ ...styles.primaryBtn, opacity: verifying ? 0.7 : 1, cursor: verifying ? 'not-allowed' : 'pointer' }}>
          {verifying ? <BtnBusy label="Verifying…" /> : 'Verify Code'}
        </button>
      </form>

      <div style={otpStyles.resendRow}>
        {resendCooldown > 0 ? (
          <span style={otpStyles.resendMuted}>Didn't receive the code? Resend in {resendCooldown}s</span>
        ) : (
          <span style={otpStyles.resendMuted}>
            Didn't receive the code?{' '}
            <button type="button" onClick={handleResend} disabled={resending} style={otpStyles.resendLink}>
              {resending ? <BtnBusy label="Resending…" /> : 'Resend Code'}
            </button>
          </span>
        )}
      </div>
    </AuthLayout>
  )
}

const otpStyles = {
  expiry: { textAlign: 'center', fontSize: '12.5px', color: '#9aa79d', margin: '10px 0 0' },
  resendRow: { textAlign: 'center', marginTop: '18px' },
  resendMuted: { fontSize: '13px', color: '#8a968d' },
  resendLink: { fontSize: '13px', fontWeight: 700, color: '#2c8047', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: "'Public Sans', system-ui, sans-serif" },
}