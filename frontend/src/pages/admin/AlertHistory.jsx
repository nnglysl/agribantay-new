import { useState, useEffect, useMemo } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

export default function AlertHistory() {
  const [statusFilter, setStatusFilter] = useState('')
  const [sensorFilter, setSensorFilter] = useState('')
  const [farmFilter, setFarmFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const isMobile = useIsMobile()

  const params = {}
  if (statusFilter) params.status = statusFilter
  if (sensorFilter) params.sensor_type = sensorFilter
  if (farmFilter) params.farm_id = farmFilter

  const { data: history, loading, error } = useCachedFetch('/admin/alert-history', params)
  const { data: farms } = useCachedFetch('/admin/farms')

  const statusColor = { Warning: '#B45309', Critical: '#B91C1C' }
  const sensorTypes = ['Ammonia', 'Temperature', 'Humidity', 'Moisture']

  const allHistory = history || []
  const totalOngoing = allHistory.filter(h => h.is_ongoing).length

  useEffect(() => { setCurrentPage(1) }, [statusFilter, sensorFilter, farmFilter, pageSize])

  const totalItems = allHistory.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [totalPages, currentPage])

  const paginatedHistory = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return allHistory.slice(start, start + pageSize)
  }, [allHistory, currentPage, pageSize])

  const rangeStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const rangeEnd = Math.min(currentPage * pageSize, totalItems)

  return (
    <AdminLayout>
      <div style={styles.header}>
        <div>
          <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Alert History</h1>
          <p style={styles.subtitle}>
            A record of every sensor incident — not a live feed, a searchable log of what already happened
          </p>
        </div>
        {totalOngoing > 0 && (
          <span style={styles.ongoingBadge}>{totalOngoing} currently ongoing</span>
        )}
      </div>

      <div style={{ ...styles.filters, ...(isMobile ? styles.filtersMobile : {}) }}>
        <div style={styles.pillRow}>
          <FilterPill label="All" active={!statusFilter} onClick={() => setStatusFilter('')} />
          <FilterPill label="Warning" active={statusFilter === 'Warning'} onClick={() => setStatusFilter('Warning')} />
          <FilterPill label="Critical" active={statusFilter === 'Critical'} onClick={() => setStatusFilter('Critical')} />
        </div>

        <div style={{ ...styles.dropdownGroup, ...(isMobile ? styles.dropdownGroupMobile : {}) }}>
          <select
            value={sensorFilter}
            onChange={e => setSensorFilter(e.target.value)}
            style={{ ...styles.select, ...(isMobile ? styles.selectMobile : {}) }}
          >
            <option value="">All Sensors</option>
            {sensorTypes.map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}
          </select>

          <select
            value={farmFilter}
            onChange={e => setFarmFilter(e.target.value)}
            style={{ ...styles.select, ...(isMobile ? styles.selectMobile : {}) }}
          >
            <option value="">All Farms</option>
            {(farms || []).map(f => <option key={f.id} value={f.id}>{f.farm_name}</option>)}
          </select>
        </div>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {!loading && !error && (
        <div style={styles.tableCard}>
          {isMobile && paginatedHistory.length > 0 && (
            <p style={styles.scrollHint}>Swipe left/right to see all columns →</p>
          )}
          <div style={isMobile ? styles.tableScroll : undefined}>
            <table style={{ ...styles.table, ...(isMobile ? styles.tableMobile : {}) }}>
              <thead>
                <tr>
                  <th style={styles.th}>Farm</th>
                  <th style={styles.th}>Sensor</th>
                  <th style={styles.th}>Severity</th>
                  <th style={styles.th}>Value</th>
                  <th style={styles.th}>Triggered</th>
                  <th style={styles.th}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {paginatedHistory.map(h => (
                  <tr key={h.id}>
                    <td style={styles.td}>{h.farm_name}</td>
                    <td style={styles.td}>{h.sensor_type}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.badge, backgroundColor: statusColor[h.status] || '#6b7280' }}>
                        {h.status}
                      </span>
                    </td>
                    <td style={styles.td}>{h.value}</td>
                    <td style={styles.td}>{h.triggered_at}</td>
                    <td style={styles.td}>
                      {h.is_ongoing ? (
                        <span style={styles.ongoingDuration}>{h.duration} · ongoing</span>
                      ) : (
                        h.duration
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {allHistory.length === 0 && <div style={styles.empty}>No alert history recorded yet.</div>}

          {allHistory.length > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              totalItems={totalItems}
              isMobile={isMobile}
            />
          )}
        </div>
      )}
    </AdminLayout>
  )
}

function Pagination({
  currentPage, totalPages, pageSize, onPageChange, onPageSizeChange,
  rangeStart, rangeEnd, totalItems, isMobile,
}) {
  const pageNumbers = useMemo(() => {
    const maxButtons = isMobile ? 3 : 5
    let start = Math.max(1, currentPage - Math.floor(maxButtons / 2))
    let end = start + maxButtons - 1
    if (end > totalPages) {
      end = totalPages
      start = Math.max(1, end - maxButtons + 1)
    }
    const pages = []
    for (let p = start; p <= end; p++) pages.push(p)
    return pages
  }, [currentPage, totalPages, isMobile])

  return (
    <div style={{ ...paginationStyles.wrap, ...(isMobile ? paginationStyles.wrapMobile : {}) }}>
      <div style={paginationStyles.info}>
        {totalItems === 0
          ? 'No results'
          : `Showing ${rangeStart}–${rangeEnd} of ${totalItems}`}
      </div>

      <div style={{ ...paginationStyles.controls, ...(isMobile ? paginationStyles.controlsMobile : {}) }}>
        <select
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          style={paginationStyles.pageSizeSelect}
        >
          {PAGE_SIZE_OPTIONS.map(size => (
            <option key={size} value={size}>{size} / page</option>
          ))}
        </select>

        <button
          style={{ ...paginationStyles.navBtn, ...(currentPage === 1 ? paginationStyles.navBtnDisabled : {}) }}
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          aria-label="First page"
        >
          «
        </button>
        <button
          style={{ ...paginationStyles.navBtn, ...(currentPage === 1 ? paginationStyles.navBtnDisabled : {}) }}
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Previous page"
        >
          ‹
        </button>

        {pageNumbers[0] > 1 && <span style={paginationStyles.ellipsis}>…</span>}

        {pageNumbers.map(p => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            style={{
              ...paginationStyles.pageBtn,
              ...(p === currentPage ? paginationStyles.pageBtnActive : {}),
            }}
          >
            {p}
          </button>
        ))}

        {pageNumbers[pageNumbers.length - 1] < totalPages && <span style={paginationStyles.ellipsis}>…</span>}

        <button
          style={{ ...paginationStyles.navBtn, ...(currentPage === totalPages ? paginationStyles.navBtnDisabled : {}) }}
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Next page"
        >
          ›
        </button>
        <button
          style={{ ...paginationStyles.navBtn, ...(currentPage === totalPages ? paginationStyles.navBtnDisabled : {}) }}
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          aria-label="Last page"
        >
          »
        </button>
      </div>
    </div>
  )
}

function FilterPill({ label, active, onClick }) {
  return (
    <span
      onClick={onClick}
      style={{ ...styles.filterPill, ...(active ? styles.filterPillActive : {}) }}
    >
      {label}
    </span>
  )
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' },
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  titleMobile: { fontSize: '18px' },
  subtitle: { fontSize: '13px', color: '#6b7280', marginTop: '4px' },
  ongoingBadge: {
    backgroundColor: '#fef2f2', color: '#B91C1C', border: '1px solid #fecaca',
    padding: '6px 14px', borderRadius: '999px', fontSize: '12.5px', fontWeight: '700', whiteSpace: 'nowrap',
  },
  filters: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' },
  filtersMobile: { flexDirection: 'column', alignItems: 'stretch' },
  pillRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  filterPill: {
    padding: '6px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: '500',
    color: '#374151', backgroundColor: 'white', border: '1px solid #d1d5db', cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  filterPillActive: { backgroundColor: '#2E7D32', color: 'white', border: '1px solid #2E7D32' },
  dropdownGroup: { display: 'flex', gap: '10px' },
  dropdownGroupMobile: { flexDirection: 'column' },
  select: {
    padding: '8px 12px', borderRadius: '8px',
    border: '1px solid #d1d5db', fontSize: '13px',
  },
  selectMobile: { width: '100%', boxSizing: 'border-box' },
  tableCard: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' },
  scrollHint: { fontSize: '11px', color: '#9ca3af', margin: '12px 16px 0' },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableMobile: { minWidth: '760px' },
  th: { textAlign: 'left', padding: '14px 16px', fontSize: '12px', color: '#6b7280', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase', whiteSpace: 'nowrap' },
  td: { padding: '14px 16px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #f3f4f6' },
  badge: { padding: '3px 10px', borderRadius: '999px', color: 'white', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap' },
  ongoingDuration: { color: '#B91C1C', fontWeight: '700' },
  empty: { padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' },
}

const paginationStyles = {
  wrap: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px', borderTop: '1px solid #f3f4f6', flexWrap: 'wrap', gap: '10px',
  },
  wrapMobile: { flexDirection: 'column', alignItems: 'stretch' },
  info: { fontSize: '12.5px', color: '#6b7280', whiteSpace: 'nowrap' },
  controls: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  controlsMobile: { justifyContent: 'space-between' },
  pageSizeSelect: {
    padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db',
    fontSize: '12.5px', color: '#374151', marginRight: '8px',
  },
  navBtn: {
    minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '6px',
    border: '1px solid #d1d5db', backgroundColor: 'white', color: '#374151',
    fontSize: '13px', cursor: 'pointer',
  },
  navBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  pageBtn: {
    minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '6px',
    border: '1px solid #d1d5db', backgroundColor: 'white', color: '#374151',
    fontSize: '12.5px', fontWeight: '600', cursor: 'pointer',
  },
  pageBtnActive: {
    backgroundColor: '#2E7D32', borderColor: '#2E7D32', color: 'white',
  },
  ellipsis: { padding: '0 4px', color: '#9ca3af', fontSize: '13px' },
}