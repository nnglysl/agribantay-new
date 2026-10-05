import { useRef } from 'react'

const SANS = "'Inter', sans-serif"

/**
 * The single 6-digit code input used by every verification flow — forgot
 * password, changing an account's email, and confirming a farm deletion.
 *
 * Before this existed each flow rendered its own <input maxLength={6}>, so
 * the same code entry looked like one wide box in some places and six
 * boxes in others. Keeping the boxes here means typing behavior (advance
 * on entry, backspace to the previous box, paste a whole code at once)
 * stays identical everywhere instead of being reimplemented per screen.
 *
 * `value` is the plain 6-character string the caller already stores; this
 * component splits it into boxes for display and hands back a string, so
 * callers keep their existing `code.length !== 6` checks untouched.
 */
export default function OtpInput({ value = '', onChange, disabled = false, tone = 'green', autoFocus = true }) {
  const refs = useRef([])
  const digits = value.padEnd(6, ' ').slice(0, 6).split('').map(c => (c === ' ' ? '' : c))

  const emit = next => onChange(next.join('').trim())

  const handleChange = (i, raw) => {
    const clean = raw.replace(/\D/g, '')
    if (!clean) {
      const next = [...digits]
      next[i] = ''
      emit(next)
      return
    }
    // Typing (or autofill) can deliver several digits at once — spread them
    // across this box and the ones after it rather than dropping all but one.
    const next = [...digits]
    for (let k = 0; k < clean.length && i + k < 6; k++) next[i + k] = clean[k]
    emit(next)
    refs.current[Math.min(i + clean.length, 5)]?.focus()
  }

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus()
  }

  const handlePaste = e => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    e.preventDefault()
    onChange(pasted)
    refs.current[Math.min(pasted.length, 5)]?.focus()
  }

  const focusRing = tone === 'red' ? '#b91c1c' : '#2c8047'

  return (
    <div style={styles.row} onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => (refs.current[i] = el)}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={6}
          value={d}
          disabled={disabled}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onFocus={e => e.target.select()}
          style={{
            ...styles.box,
            ...(d ? { borderColor: focusRing, backgroundColor: '#fff' } : {}),
            ...(disabled ? styles.boxDisabled : {}),
          }}
          autoFocus={autoFocus && i === 0}
          aria-label={`Digit ${i + 1} of 6`}
        />
      ))}
    </div>
  )
}

const styles = {
  row: { display: 'flex', gap: '8px', justifyContent: 'center' },
  box: {
    width: '44px', height: '52px', textAlign: 'center', fontSize: '20px', fontWeight: 700,
    borderRadius: '10px', border: '1px solid #d9dcd4', background: '#fbfbf8', color: '#16311d',
    fontFamily: SANS, outline: 'none', boxSizing: 'border-box', padding: 0,
  },
  boxDisabled: { opacity: 0.6, cursor: 'not-allowed' },
}
