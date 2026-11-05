import { GREEN } from '../theme/green'
import DropdownList from './DropdownList'
import { useRef, useState, useEffect } from 'react'
import { useSelectedFarm } from '../hooks/useSelectedFarm'

const STATUS_COLOR = { Safe: GREEN.primary, Warning: '#b45309', Critical: '#b91c1c', 'Pending Setup': '#6b7280' }

function FarmIcon({ color = GREEN.primary, size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M3 21V9l9-6 9 6v12h-6v-7H9v7H3z" />
    </svg>
  )
}

function ChevronIcon({ color = '#9aa79d' }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

/**
 * Shown at the top of every Farmer page (see FarmerLayout). This is the
 * app's single farm-selection method — a "My Farms" page used to exist
 * alongside it, but was removed so switching farms only ever happens
 * here. Picking a farm updates FarmContext, which every page's own data
 * fetch already keys off, so the whole page reloads for that farm's data.
 */
// `inline` drops the bottom margin for use inside a header row; `align="right"`
// opens the menu from the trigger's right edge so it never overflows the page.
export default function FarmSelector({ inline = false, align = 'left' }) {
  const { farms, selectedFarm, selectedFarmId, setSelectedFarmId } = useSelectedFarm()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  if (farms.length === 0 || !selectedFarm) return null

  const isSingleFarm = farms.length === 1
  const matches = farms.filter(farm => !query.trim() || [farm.farm_name, farm.barangay, farm.address].some(value => String(value || '').toLowerCase().includes(query.trim().toLowerCase())))
  const selectFarm = farm => { setSelectedFarmId(farm.id); setQuery(''); setOpen(false); setActiveIndex(-1) }
  const keyDown = event => {
    if (event.key === 'Escape') { setOpen(false); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActiveIndex(index => Math.min(index + 1, matches.length - 1)); return }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(index => Math.max(0, index - 1)); return }
    if (event.key === 'Enter' && open && matches[activeIndex]) { event.preventDefault(); selectFarm(matches[activeIndex]) }
  }

  return (
    <div className="agb-farm-selector" ref={wrapRef} style={{ ...styles.wrap, ...(inline ? styles.wrapInline : {}) }}>
      <div className="agb-dropdown-trigger" style={{ ...styles.trigger, ...(isSingleFarm ? styles.triggerStatic : {}) }}>
        <span style={styles.iconChip}><FarmIcon /></span>
        <input aria-label="Select a farm" role="combobox" aria-expanded={open && !isSingleFarm} aria-controls="farm-selector-list" aria-autocomplete="list" value={open ? query : selectedFarm.farm_name} readOnly={isSingleFarm} onFocus={() => !isSingleFarm && (setQuery(''), setOpen(true))} onChange={event => { setQuery(event.target.value); setOpen(true); setActiveIndex(-1) }} onKeyDown={keyDown} style={styles.input} />
        {!isSingleFarm && (
          <span style={{ ...styles.chevronWrap, transform: open ? 'rotate(180deg)' : 'none' }}>
            <ChevronIcon />
          </span>
        )}
      </div>

      {open && !isSingleFarm && (
        <DropdownList id="farm-selector-list" role="listbox" aria-label="Farm choices" className="agb-farm-selector-list" style={{ ...styles.dropdown, ...(align === 'right' ? styles.dropdownRight : {}) }}>
          {matches.length ? matches.map((f, index) => {
            const active = f.id === selectedFarmId
            const color = STATUS_COLOR[f.status] || '#9aa79d'
            return (
              <button className="agb-dropdown-option" type="button" role="option" aria-selected={active} aria-current={active ? 'true' : undefined}
                key={f.id}
                style={{ ...styles.option, ...(active || index === activeIndex ? styles.optionActive : {}) }}
                onMouseDown={event => event.preventDefault()}
                onClick={() => selectFarm(f)}
              >
                <span style={styles.iconChip}><FarmIcon /></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="agb-dropdown-label" style={styles.optionName}>{f.farm_name}</div>
                  {f.barangay && <div className="agb-dropdown-meta" style={styles.optionBarangay}>{f.barangay}</div>}
                </div>
                <span style={{ ...styles.statusDot, backgroundColor: color }} />
                {active && <span style={styles.check}>✓</span>}
              </button>
            )
          }) : <p style={styles.empty}>No matching farms found</p>}
        </DropdownList>
      )}
    </div>
  )
}

const SANS = "'Inter', sans-serif"

const styles = {
  wrap: { position: 'relative', display: 'inline-block', marginBottom: '20px' },
  wrapInline: { marginBottom: 0 },

  trigger: {
    display: 'flex', alignItems: 'center', gap: '10px', fontFamily: SANS,
    background: '#fff', border: '1px solid #e5e7e0', borderRadius: '12px',
    padding: '8px 14px 8px 8px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(20,48,28,0.04)',
  },
  triggerStatic: { cursor: 'default' },

  iconChip: {
    width: '28px', height: '28px', borderRadius: '9px', backgroundColor: GREEN.soft,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  input: { minWidth: 0, width: '175px', border: 0, outline: 0, background: 'transparent', font: "700 13.5px 'Inter', sans-serif", color: '#16311d' },
  chevronWrap: { display: 'flex', alignItems: 'center', marginLeft: '2px', transition: 'transform .15s ease' },

  dropdown: {
    position: 'absolute', top: 'calc(100% + 8px)', left: 0, minWidth: '270px', zIndex: 40,
    background: '#fff', border: '1px solid #e5e7e0', borderRadius: '12px',
    boxShadow: '0 12px 28px rgba(20,48,28,0.14)', overflow: 'hidden', fontFamily: SANS, padding: '6px',
  },
  dropdownRight: { left: 'auto', right: 0 },
  option: {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 8px', borderRadius: '9px', cursor: 'pointer',
  },
  optionActive: { backgroundColor: '#f4faf6' },
  optionName: { fontSize: '13px', fontWeight: 700, color: '#16311d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  optionBarangay: { fontSize: '11.5px', color: '#8a968d', marginTop: '1px' },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  check: { fontSize: '12px', fontWeight: 700, color: GREEN.primary, flexShrink: 0 },
  empty: { padding: '10px 9px', margin: 0, fontSize: '13px', color: '#718075' },
}
