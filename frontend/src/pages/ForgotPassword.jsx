import { useNavigate } from 'react-router-dom'
import AuthLayout, { authFormStyles as styles } from '../components/AuthLayout'

function MailIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
}
function SmsIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
}

export default function ForgotPassword() {
  const navigate = useNavigate()

  return (
    <AuthLayout onBack={() => navigate('/login')} backLabel="Back to login">
      <h1 style={styles.title}>Forgot Password?</h1>
      <p style={styles.subtitle}>Don't worry! We'll help you reset your password. Choose how you want to receive your verification code.</p>

      <button type="button" style={styles.methodBtn} onClick={() => navigate('/forgot-password/email')}>
        <span style={styles.methodIcon}><MailIcon /></span>
        <div>
          Continue with Email
          <div style={styles.methodBtnSub}>Receive code via your registered email</div>
        </div>
      </button>

      <button type="button" style={styles.methodBtn} onClick={() => navigate('/forgot-password/sms')}>
        <span style={styles.methodIcon}><SmsIcon /></span>
        <div>
          Continue with SMS
          <div style={styles.methodBtnSub}>Receive code via your registered mobile number</div>
        </div>
      </button>

      <button type="button" style={styles.linkBtn} onClick={() => navigate('/login')}>
        ← Back to login
      </button>
    </AuthLayout>
  )
}