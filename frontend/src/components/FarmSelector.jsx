import { useRef, useState, useEffect } from 'react'
import { useSelectedFarm } from '../hooks/useSelectedFarm'

const STATUS_COLOR = { Safe: '#2c8047', Warning: '#b45309', Critical: '#b91c1c', 'Pending Setup': '#6b7280' }

function FarmIcon({ color = '#2c8047', size = 15 }) {
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
export default function FarmSelector() {
  const { farms, selectedFarm, selectedFarmId, setSelectedFarmId } = useSelectedFarm()
  const [open, setOpen] = useState(false)
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

  return (
    <div ref={wrapRef} style={styles.wrap}>
      <button
        type="button"
        style={{ ...styles.trigger, ...(isSingleFarm ? styles.triggerStatic : {}) }}
        onClick={() => !isSingleFarm && setOpen(v => !v)}
      >
        <span style={styles.iconChip}><FarmIcon /></span>
        <span style={styles.label}>{selectedFarm.farm_name}</span>
        {!isSingleFarm && (
          <span style={{ ...styles.chevronWrap, transform: open ? 'rotate(180deg)' : 'none' }}>
            <ChevronIcon />
          </span>
        )}
      </button>

      {open && !isSingleFarm && (
        <div style={styles.dropdown}>
          {farms.map(f => {
            const active = f.id === selectedFarmId
            const color = STATUS_COLOR[f.status] || '#9aa79d'
            return (
              <div
                key={f.id}
                style={{ ...styles.option, ...(active ? styles.optionActive : {}) }}
                onClick={() => { setSelectedFarmId(f.id); setOpen(false) }}
              >
                <span style={styles.iconChip}><FarmIcon /></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={styles.optionName}>{f.farm_name}</div>
                  {f.barangay && <div style={styles.optionBarangay}>{f.barangay}</div>}
                </div>
                <span style={{ ...styles.statusDot, backgroundColor: color }} />
                {active && <span style={styles.check}>✓</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const SANS = "'Inter', sans-serif"

const styles = {
  wrap: { position: 'relative', display: 'inline-block', marginBottom: '20px' },

  trigger: {
    display: 'flex', alignItems: 'center', gap: '10px', fontFamily: SANS,
    background: '#fff', border: '1px solid #e5e7e0', borderRadius: '12px',
    padding: '8px 14px 8px 8px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(20,48,28,0.04)',
  },
  triggerStatic: { cursor: 'default' },

  iconChip: {
    width: '28px', height: '28px', borderRadius: '9px', backgroundColor: '#eaf3ec',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  label: { fontSize: '13.5px', fontWeight: 700, color: '#16311d', whiteSpace: 'nowrap' },
  chevronWrap: { display: 'flex', alignItems: 'center', marginLeft: '2px', transition: 'transform .15s ease' },

  dropdown: {
    position: 'absolute', top: 'calc(100% + 8px)', left: 0, minWidth: '270px', zIndex: 40,
    background: '#fff', border: '1px solid #e5e7e0', borderRadius: '12px',
    boxShadow: '0 12px 28px rgba(20,48,28,0.14)', overflow: 'hidden', fontFamily: SANS, padding: '6px',
  },
  option: {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 8px', borderRadius: '9px', cursor: 'pointer',
  },
  optionActive: { backgroundColor: '#f4faf6' },
  optionName: { fontSize: '13px', fontWeight: 700, color: '#16311d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  optionBarangay: { fontSize: '11.5px', color: '#8a968d', marginTop: '1px' },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  check: { fontSize: '12px', fontWeight: 700, color: '#2c8047', flexShrink: 0 },
}
