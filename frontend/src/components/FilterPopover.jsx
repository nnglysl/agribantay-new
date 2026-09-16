import { useEffect, useRef, useState } from 'react'
import { filterStyles } from '../styles/filterStyles'

// The Filter button + popover panel used across the app (same markup and
// styles as the Admin/Vet list pages), packaged so the farmer pages can add
// filters without re-declaring ~40 lines of styles each. Draft/applied state
// stays with the caller — this only owns open/close, the active-count badge,
// click-outside dismissal, and the Reset/Apply row.
//
//   <FilterPopover activeCount={n} onOpen={syncDrafts} onReset={resetDrafts} onApply={apply} isMobile={isMobile}>
//     <label style={filterStyles.filterLabel}>…</label> …
//   </FilterPopover>
export default function FilterPopover({ activeCount = 0, onOpen, onReset, onApply, isMobile, children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const toggle = () => {
    if (open) { setOpen(false); return }
    onOpen?.()
    setOpen(true)
  }

  return (
    <div style={filterStyles.filterAnchor} ref={ref}>
      <button
        type="button"
        onClick={toggle}
        style={{ ...filterStyles.filterBtn, ...(activeCount > 0 ? filterStyles.filterBtnActive : {}) }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M4 5h16l-6 8v6l-4-2v-4L4 5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
        Filter
        {activeCount > 0 && <span style={filterStyles.filterCount}>{activeCount}</span>}
      </button>

      {open && (
        <div style={{ ...filterStyles.filterPanel, ...(isMobile ? filterStyles.filterPanelMobile : {}) }}>
          <div style={filterStyles.filterPanelHeader}>
            <span style={filterStyles.filterPanelTitle}>Filter</span>
            <span style={filterStyles.filterPanelClose} onClick={() => setOpen(false)}>×</span>
          </div>

          {children}

          <div style={filterStyles.filterActions}>
            <button type="button" onClick={onReset} style={filterStyles.filterResetBtn}>Reset</button>
            <button type="button" onClick={() => { onApply?.(); setOpen(false) }} style={filterStyles.filterApplyBtn}>Apply</button>
          </div>
        </div>
      )}
    </div>
  )
}

