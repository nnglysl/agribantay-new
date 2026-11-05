import { useState } from 'react'
import { getRole } from '../utils/auth'

// The Device Key is the physical unit's identity — anyone holding it can post
// readings to /api/sensor-readings as that device. So it is masked by default
// everywhere it appears, and only Admin/Super Admin get the Show and Copy
// controls. The key is never written to the console.
//
// Defence in depth only: the API endpoints that return device_key are already
// behind role:admin,super_admin, and no farmer-facing response includes it.
const PRIVILEGED_ROLES = ['admin', 'super_admin']

const MASK = '•'.repeat(16)

export default function DeviceKeyField({ deviceKey, label = 'Device Key', style, variant = 'inline' }) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const canReveal = PRIVILEGED_ROLES.includes(getRole())
  const details = variant === 'details'

  if (!deviceKey) return null

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(deviceKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can be blocked (insecure origin, denied permission).
      // Fall back to revealing the key so it can be selected by hand —
      // never surface the key through an error path or the console.
      setRevealed(true)
    }
  }

  return (
    <div className={details ? 'device-key-details' : undefined} style={{ ...(!details ? styles.wrap : {}), ...style }} role={details ? 'group' : undefined} aria-label={details ? 'Device Key' : undefined}>
      {label && <span style={styles.label}>{label}:</span>}
      <span className={details ? 'device-key-details-value' : undefined} style={details ? undefined : styles.value}>{revealed ? deviceKey : MASK}</span>
      {canReveal && (
        <>
          <button
            type="button"
            className={details ? 'device-key-details-control' : undefined}
            style={details ? undefined : styles.btn}
            onClick={() => setRevealed(v => !v)}
            aria-label={revealed ? 'Hide Device Key' : 'Show Device Key'}
          >
            {details && <KeyControlIcon name={revealed ? 'hide' : 'show'} />}
            {revealed ? 'Hide' : 'Show'}
          </button>
          <button
            type="button"
            className={details ? 'device-key-details-control' : undefined}
            style={details ? undefined : styles.btn}
            onClick={handleCopy}
            aria-label="Copy Device Key"
          >
            {details && <KeyControlIcon name="copy" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </>
      )}
    </div>
  )
}

function KeyControlIcon({ name }) {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {name === 'copy' ? <><rect x="8" y="8" width="12" height="13" rx="1.5" /><path d="M16 8V3H4v14h4" /></> : <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{name === 'hide' && <path d="m3 3 18 18" />}</>}
  </svg>
}

const SANS = "'Inter', sans-serif"

const styles = {
  wrap: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '3px', fontFamily: SANS },
  label: { fontSize: '12px', color: '#8a968d' },
  value: {
    fontSize: '12px', color: '#6b7770', fontFamily: 'monospace',
    letterSpacing: '0.04em', wordBreak: 'break-all',
  },
  btn: {
    padding: '2px 9px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
    border: '1px solid #e3e6dd', backgroundColor: '#fff', color: '#4b5a50', fontFamily: SANS,
  },
}
