import { validatePassword } from '../utils/passwordValidation'

export default function PasswordStrengthIndicator({ password }) {
  const { checks, strength } = validatePassword(password)

  const strengthColor = {
    Weak: '#dc2626',
    Medium: '#f59e0b',
    Strong: '#2E7D32',
  }[strength]

  const strengthWidth = {
    Weak: '33%',
    Medium: '66%',
    Strong: '100%',
  }[strength]

  const requirements = [
    { key: 'length', label: 'At least 8 characters' },
    { key: 'uppercase', label: 'One uppercase letter (A–Z)' },
    { key: 'lowercase', label: 'One lowercase letter (a–z)' },
    { key: 'number', label: 'One number (0–9)' },
    { key: 'special', label: 'One special character (!@#$%^&*)' },
  ]

  if (!password) return null

  return (
    <div style={styles.wrapper}>
      <div style={styles.strengthRow}>
        <div style={styles.barTrack}>
          <div style={{ ...styles.barFill, width: strengthWidth, backgroundColor: strengthColor }} />
        </div>
        <span style={{ ...styles.strengthLabel, color: strengthColor }}>{strength}</span>
      </div>

      <ul style={styles.list}>
        {requirements.map(req => (
          <li key={req.key} style={styles.item}>
            <span style={{ color: checks[req.key] ? '#2E7D32' : '#9ca3af' }}>
              {checks[req.key] ? '✓' : '○'}
            </span>
            <span style={{ color: checks[req.key] ? '#374151' : '#9ca3af' }}>{req.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const styles = {
  wrapper: { marginTop: '8px', marginBottom: '4px' },
  strengthRow: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' },
  barTrack: { flex: 1, height: '6px', backgroundColor: '#e5e7eb', borderRadius: '999px', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: '999px', transition: 'width 0.2s ease' },
  strengthLabel: { fontSize: '12px', fontWeight: '600', minWidth: '48px' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' },
  item: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' },
}