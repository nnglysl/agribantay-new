import { HANDLED_BY_OPTIONS } from '../utils/handledBy'

/**
 * Compact "Handled By" filter for the Service Requests toolbars (Staff and
 * Vet): a button-styled control — users icon, "Handled By: <option>",
 * chevron — sized and coloured like the neighbouring Filter button. A real
 * <select> sits invisibly on top so the native dropdown, keyboard and
 * screen-reader behaviour are untouched; only the presentation is custom.
 */
export default function HandledByFilter({ value, onChange, isMobile }) {
  const active = value !== 'all'
  const label = HANDLED_BY_OPTIONS.find(o => o.value === value)?.label || 'All'

  return (
    <div style={{ ...s.wrap, ...(isMobile ? s.wrapMobile : {}) }}>
      <div style={{ ...s.face, ...(active ? s.faceActive : {}) }} aria-hidden="true">
        <UsersIcon />
        <span style={s.text}>
          <span style={s.label}>Handled By:</span> <span style={s.value}>{label}</span>
        </span>
        <ChevronIcon />
      </div>
      <select
        aria-label="Handled By"
        title={`Handled By: ${label}`}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={s.select}
      >
        {HANDLED_BY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

// Lucide "users"
const UsersIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)
// Lucide "chevron-down"
const ChevronIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
)

const SANS = "'Inter', sans-serif"

const s = {
  wrap: { position: 'relative', display: 'inline-flex', flexShrink: 0 },
  wrapMobile: { flex: '0 1 auto', minWidth: 0, maxWidth: '100%' },
  // Mirrors filterBtn / filterBtnActive on the pages, border split into
  // longhands so the active colour never conflicts with a shorthand.
  face: {
    display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 12px', width: '100%', boxSizing: 'border-box',
    borderRadius: '10px', borderWidth: '1px', borderStyle: 'solid', borderColor: '#dcdfd6', backgroundColor: '#fff',
    color: '#33413a', fontSize: '13px', fontWeight: 600, fontFamily: SANS, whiteSpace: 'nowrap', lineHeight: 1.2,
  },
  faceActive: { borderColor: '#2c8047', color: '#2c8047' },
  text: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' },
  label: { color: 'inherit' },
  value: { fontWeight: 700 },
  // Transparent, full-size, on top: receives the click/tap and the focus.
  select: {
    position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer',
    fontFamily: SANS, fontSize: '13px', margin: 0, padding: 0, border: 'none',
  },
}
