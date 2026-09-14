import { useMemo } from 'react'

const SANS = "'Inter', sans-serif"

/**
 * The single Previous / page-numbers / Next control used everywhere a table
 * or record list paginates — every role, every module. Callers keep their
 * own "Showing X–Y of Z" text and page-size selector exactly as before;
 * this renders only the button cluster itself, so that cluster's design
 * (shape, color, spacing, disabled state) stays centralized in one place
 * instead of being redefined per page.
 */
export default function Pagination({ currentPage, totalPages, onPageChange, isMobile = false, maxButtons }) {
  const pages = Math.max(1, totalPages || 1)
  const safe = Math.min(Math.max(1, currentPage || 1), pages)
  const max = maxButtons ?? (isMobile ? 3 : 5)

  const pageNumbers = useMemo(() => {
    let start = Math.max(1, safe - Math.floor(max / 2))
    let end = start + max - 1
    if (end > pages) { end = pages; start = Math.max(1, end - max + 1) }
    const out = []
    for (let p = start; p <= end; p++) out.push(p)
    return out
  }, [safe, pages, max])

  return (
    <div className="no-print" style={styles.wrap}>
      <button
        type="button"
        style={{ ...styles.navBtn, ...(safe === 1 ? styles.navBtnDisabled : {}) }}
        onClick={() => onPageChange(safe - 1)}
        disabled={safe === 1}
      >
        Previous
      </button>

      {pageNumbers[0] > 1 && <span style={styles.ellipsis}>…</span>}
      {pageNumbers.map(p => (
        <button
          key={p}
          type="button"
          style={{ ...styles.pageBtn, ...(p === safe ? styles.pageBtnActive : {}) }}
          onClick={() => onPageChange(p)}
        >
          {p}
        </button>
      ))}
      {pageNumbers[pageNumbers.length - 1] < pages && <span style={styles.ellipsis}>…</span>}

      <button
        type="button"
        style={{ ...styles.navBtn, ...(safe === pages ? styles.navBtnDisabled : {}) }}
        onClick={() => onPageChange(safe + 1)}
        disabled={safe === pages}
      >
        Next
      </button>
    </div>
  )
}

const styles = {
  wrap: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  navBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    height: '34px', padding: '0 14px', borderRadius: '8px', border: '1px solid #dcdfd6',
    backgroundColor: '#fff', color: '#33413a', fontFamily: SANS, fontSize: '13px', fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
  navBtnDisabled: { color: '#b7bdb4', backgroundColor: '#f7f8f5', cursor: 'not-allowed' },
  pageBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    height: '34px', minWidth: '34px', padding: '0 10px', borderRadius: '8px', border: '1px solid #dcdfd6',
    backgroundColor: '#fff', color: '#33413a', fontFamily: SANS, fontSize: '13px', fontWeight: 600,
    cursor: 'pointer',
  },
  pageBtnActive: { backgroundColor: '#2c8047', borderColor: '#2c8047', color: '#fff' },
  ellipsis: { padding: '0 2px', color: '#9aa79d', fontSize: '13px', fontFamily: SANS },
}
