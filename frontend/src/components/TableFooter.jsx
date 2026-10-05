import SharedPagination from './Pagination'

const SANS = "'Inter', sans-serif"

// Private on purpose: exporting it alongside the component breaks Fast
// Refresh, and no caller needs it now that the footer owns the selector.
const PAGE_SIZE_OPTIONS = [10, 25, 50]

/**
 * The footer strip under every paginated table: the "Showing X–Y of Z" count
 * on the left, and the page-size selector plus page buttons on the right.
 *
 * This existed as a near-identical private `Pagination` function, with its
 * own private `paginationStyles` block, copied into seventeen page files.
 * They happened to still match, but nothing kept them matching — the Devices
 * module was written from the same template and drifted immediately, which
 * is exactly the failure this prevents. One definition means "the same as
 * the other modules" is guaranteed rather than maintained by hand.
 *
 * The wording is fixed too: "Showing 1–25 of 240" and "No results" are what
 * the existing modules print, so nothing here is parameterised. A per-page
 * noun would have reintroduced the drift this component exists to remove.
 */
export default function TableFooter({
  currentPage,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
  rangeStart,
  rangeEnd,
  totalItems,
  isMobile = false,
}) {
  return (
    <div className="no-print" style={{ ...styles.wrap, ...(isMobile ? styles.wrapMobile : {}) }}>
      <div style={styles.info}>
        {totalItems === 0
          ? 'No results'
          : `Showing ${rangeStart}–${rangeEnd} of ${totalItems}`}
      </div>

      <div style={{ ...styles.controls, ...(isMobile ? styles.controlsMobile : {}) }}>
        <select
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          style={styles.pageSizeSelect}
          aria-label="Rows per page"
        >
          {PAGE_SIZE_OPTIONS.map(size => (
            <option key={size} value={size}>{size} / page</option>
          ))}
        </select>

        <SharedPagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
          isMobile={isMobile}
        />
      </div>
    </div>
  )
}

const styles = {
  wrap: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 20px', borderTop: '1px solid #eceee7', flexWrap: 'wrap', gap: '10px',
    fontFamily: SANS,
  },
  wrapMobile: { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch' },
  info: { fontSize: '12px', color: '#8a968d', whiteSpace: 'nowrap' },
  controls: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  controlsMobile: { justifyContent: 'space-between' },
  pageSizeSelect: {
    padding: '6px 10px', borderRadius: '8px', border: '1px solid #dcdfd6',
    fontSize: '12px', color: '#4b5a50', marginRight: '6px', fontFamily: SANS,
  },
}
