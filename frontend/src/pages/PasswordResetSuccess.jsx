import { useNavigate } from 'react-router-dom'
import AuthLayout, { authFormStyles as styles } from '../components/AuthLayout'

function CheckCircleIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#2c8047" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" fill="#eaf3ec" stroke="none" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  )
}

export default function PasswordResetSuccess() {
  const navigate = useNavigate()

  return (
    <AuthLayout onBack={() => navigate('/login')} backLabel="Home">
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
        <CheckCircleIcon />
      </div>
      <h1 style={styles.title}>Password Reset Successful!</h1>
      <p style={styles.subtitle}>Your password has been updated successfully. You can now log in using your new password.</p>

      <button type="button" className="agb-btn agb-primary" style={styles.primaryBtn} onClick={() => navigate('/login')}>
        Back to Login
      </button>
    </AuthLayout>
  )
}