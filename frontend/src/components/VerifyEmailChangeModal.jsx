import { useState, useEffect } from 'react'
import api from '../api/axios'

const SANS = "'Inter', sans-serif"
const SUCCESS_DISPLAY_MS = 1800

/**
 * Shared "Verify New Email" modal for every Edit-user flow where an
 * authorized role (Admin/Super Admin) changes SOMEONE ELSE's email —
 * Farm Owner accounts via Admin\FarmController, Admin/Vet accounts via
 * SuperAdmin\AccountController. A verification code for `email` must
 * already have been requested (via `requestUrl`) before this mounts;
 * this modal only handles entering the code, resending it, and cancelling.
 *
 * On a correct code, this shows an explicit success state INSIDE the modal
 * (rather than closing immediately and relying on some other part of the
 * page to say what happened) so the confirmation is impossible to miss,
 * then calls onVerified() once the success state has been visible long
 * enough to register.
 */
export default function VerifyEmailChangeModal({ email, requestUrl, verifyUrl, onCancel, onVerified }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('A verification code has been sent to this email address.')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [verified, setVerified] = useState(false)

  useEffect(() => {
    if (!verified) return
    const timer = setTimeout(() => onVerified(), SUCCESS_DISPLAY_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified])

  const handleVerify = async (e) => {
    e.preventDefault()
    setError('')

    if (code.trim().length !== 6) {
      setError('Please enter the 6-digit code.')
      return
    }

    setVerifying(true)
    try {
      const res = await api.post(verifyUrl, { email, code: code.trim() })
      setInfo(res.data.message || 'Email verified successfully.')
      setVerified(true)
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid verification code.')
    } finally {
      setVerifying(false)
    }
  }

  const handleResend = async () => {
    setError('')
    setInfo('')
    setResending(true)
    try {
      const res = await api.post(requestUrl, { email })
      setInfo(res.data.message || 'A new verification code has been sent.')
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend the code. Please try again.')
    } finally {
      setResending(false)
    }
  }

  if (verified) {
    return (
      <div style={styles.overlay}>
        <div style={styles.modal}>
          <div style={styles.successIconWrap}>
            <CheckIcon />
          </div>
          <h3 style={{ ...styles.title, textAlign: 'center' }}>Email verified successfully.</h3>
          <p style={{ ...styles.subtitle, textAlign: 'center' }}>
            <strong style={{ color: '#16311d' }}>{email}</strong> is now the account's email address.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h3 style={styles.title}>Verify New Email</h3>
        <p style={styles.subtitle}>
          We sent a 6-digit verification code to <strong style={{ color: '#16311d' }}>{email}</strong>. Enter it below to confirm this email change.
        </p>

        <form onSubmit={handleVerify}>
          {error && <div style={styles.errorBox}>{error}</div>}
          {!error && info && <p style={styles.info}>{info}</p>}

          <label style={styles.label}>Verification code</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="6-digit code"
            style={styles.input}
            autoFocus
          />

          <button type="button" onClick={handleResend} disabled={resending} style={styles.resendBtn}>
            {resending ? 'Resending...' : 'Resend Code'}
          </button>

          <div style={styles.actions}>
            <button type="button" onClick={onCancel} style={styles.cancelBtn}>Cancel</button>
            <button type="submit" disabled={verifying} style={{ ...styles.verifyBtn, opacity: verifying ? 0.6 : 1, cursor: verifying ? 'not-allowed' : 'pointer' }}>
              {verifying ? 'Verifying...' : 'Verify'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

const styles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(15,38,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' },
  modal: { fontFamily: SANS, backgroundColor: '#fff', borderRadius: '14px', padding: '26px', width: '420px', maxWidth: '100%', boxShadow: '0 12px 32px rgba(15,38,22,0.18)' },
  title: { fontSize: '17px', fontWeight: 800, color: '#16311d', margin: '0 0 8px' },
  subtitle: { fontSize: '13px', color: '#4b5a50', lineHeight: 1.55, margin: '0 0 18px' },
  errorBox: { backgroundColor: '#fbeaea', border: '1px solid #f0c9c9', color: '#b91c1c', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', marginBottom: '12px' },
  info: { fontSize: '12.5px', color: '#4b5a50', margin: '0 0 12px' },
  label: { display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#33413a', marginBottom: '6px' },
  input: {
    width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #dcdfd6',
    fontSize: '18px', letterSpacing: '4px', textAlign: 'center', boxSizing: 'border-box',
    fontFamily: SANS, color: '#16311d', fontWeight: 700,
  },
  resendBtn: {
    background: 'none', border: 'none', color: '#2c8047', fontSize: '12.5px', fontWeight: 600,
    cursor: 'pointer', padding: '10px 0 0', fontFamily: SANS,
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' },
  cancelBtn: { padding: '9px 16px', borderRadius: '10px', border: '1px solid #dcdfd6', backgroundColor: '#fff', fontSize: '13.5px', fontWeight: 600, color: '#33413a', cursor: 'pointer', fontFamily: SANS },
  verifyBtn: { padding: '9px 18px', borderRadius: '10px', border: 'none', backgroundColor: '#2c8047', color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS },
  successIconWrap: {
    width: '52px', height: '52px', borderRadius: '50%', backgroundColor: '#2c8047',
    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
  },
}
