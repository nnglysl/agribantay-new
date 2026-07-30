import { useState, useEffect, useMemo } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

export default function AlertHistory() {
  const [statusFilter, setStatusFilter] = useState('')
  const [sensorFilter, setSensorFilter] = useState('')
  const [farmFilter, setFarmFilter] = useState('')
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const isMobile = useIsMobile()

  const params = {}
  if (statusFilter) params.status = statusFilter
  if (sensorFilter) params.sensor_type = sensorFilter
  if (farmFilter) params.farm_id = farmFilter
  if (search) params.search = search

  const { data: history, loading, error } = useCachedFetch('/admin/alert-history', params)
  const { data: farms } = useCachedFetch('/admin/farms')

  const statusColor = { Warning: '#b45309', Critical: '#b91c1c' }
  const statusBg = { Warning: '#fbf1e2', Critical: '#fbeaea' }
  const sensorTypes = ['Ammonia', 'Temperature', 'Humidity', 'Moisture']

  const allHistory = history || []
  const totalOngoing = allHistory.filter(h => h.is_ongoing).length
  const totalAlerts = allHistory.length

  useEffect(() => { setCurrentPage(1) }, [statusFilter, sensorFilter, farmFilter, search, pageSize])

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
        <div style={styles.badgeGroup}>
          <span style={styles.totalBadge}>
            {totalAlerts} total alert{totalAlerts === 1 ? '' : 's'}
          </span>
          {totalOngoing > 0 && (
            <span style={styles.ongoingBadge}>
              <span style={styles.ongoingBadgeDot} />
              {totalOngoing} currently ongoing
            </span>
          )}
        </div>
      </div>

      <div style={{ ...styles.searchRow, ...(isMobile ? styles.searchRowMobile : {}) }}>
        <input
          placeholder="Search by Farm Owner, Alert Type, or Alert ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={styles.searchInput}
        />
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

      {loading && <p style={styles.stateText}>Loading...</p>}
      {error && <p style={{ ...styles.stateText, color: '#b91c1c' }}>{error}</p>}

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
                  <th style={styles.th}>Farm Owner</th>
                  <th style={styles.th}>Sensor</th>
                  <th style={styles.th}>Severity</th>
                  <th style={styles.th}>Value</th>
                  <th style={styles.th}>Triggered</th>
                  <th style={styles.th}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {paginatedHistory.map(h => {
                  const c = statusColor[h.status] || '#6b7280'
                  return (
                    <tr key={h.id}>
                      <td style={{ ...styles.td, fontWeight: 600, color: '#16311d' }}>{h.farm_name}</td>
                      <td style={styles.td}>{h.farm_owner_name || '—'}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.sensorTag, ...sensorTagStyle(h.sensor_type) }}>
                          {h.sensor_type}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, color: c, backgroundColor: statusBg[h.status] || '#eef1ea' }}>
                          <span style={{ ...styles.badgeDot, backgroundColor: c }} />
                          {h.status}
                        </span>
                      </td>
                      <td style={{ ...styles.td, fontVariantNumeric: 'tabular-nums' }}>{h.value}</td>
                      <td style={styles.td}>{h.triggered_at}</td>
                      <td style={styles.td}>
                        {h.is_ongoing ? (
                          <span style={styles.ongoingDuration}>{h.duration} · ongoing</span>
                        ) : (
                          h.duration
                        )}
                      </td>
                    </tr>
                  )
                })}
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
        {totalItems === 0 ? 'No results' : `Showing ${rangeStart}–${rangeEnd} of ${totalItems}`}
      </div>

      <div style={{ ...paginationStyles.controls, ...(isMobile ? paginationStyles.controlsMobile : {}) }}>
        <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))} style={paginationStyles.pageSizeSelect}>
          {PAGE_SIZE_OPTIONS.map(size => (
            <option key={size} value={size}>{size} / page</option>
          ))}
        </select>

        <button
          style={{ ...paginationStyles.navBtn, ...(currentPage === 1 ? paginationStyles.navBtnDisabled : {}) }}
          onClick={() => onPageChange(1)} disabled={currentPage === 1} aria-label="First page"
        >«</button>
        <button
          style={{ ...paginationStyles.navBtn, ...(currentPage === 1 ? paginationStyles.navBtnDisabled : {}) }}
          onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} aria-label="Previous page"
        >‹</button>

        {pageNumbers[0] > 1 && <span style={paginationStyles.ellipsis}>…</span>}

        {pageNumbers.map(p => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            style={{ ...paginationStyles.pageBtn, ...(p === currentPage ? paginationStyles.pageBtnActive : {}) }}
          >{p}</button>
        ))}

        {pageNumbers[pageNumbers.length - 1] < totalPages && <span style={paginationStyles.ellipsis}>…</span>}

        <button
          style={{ ...paginationStyles.navBtn, ...(currentPage === totalPages ? paginationStyles.navBtnDisabled : {}) }}
          onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} aria-label="Next page"
        >›</button>
        <button
          style={{ ...paginationStyles.navBtn, ...(currentPage === totalPages ? paginationStyles.navBtnDisabled : {}) }}
          onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages} aria-label="Last page"
        >»</button>
      </div>
    </div>
  )
}

function FilterPill({ label, active, onClick }) {
  return (
    <span onClick={onClick} style={{ ...styles.filterPill, ...(active ? styles.filterPillActive : {}) }}>
      {label}
    </span>
  )
}

function sensorTagStyle(sensorType) {
  const map = {
    Ammonia: { color: '#256b3d', backgroundColor: '#eaf3ec' },
    Temperature: { color: '#b45309', backgroundColor: '#fbf1e2' },
    Humidity: { color: '#2f6bb0', backgroundColor: '#e8eff8' },
    Moisture: { color: '#7c5cbf', backgroundColor: '#f0ecfa' },
  }
  return map[sensorType] || { color: '#6b7280', backgroundColor: '#eef1ea' }
}

const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' },
  title: { fontSize: '24px', fontWeight: 800, letterSpacing: '-0.015em', color: '#16311d', margin: 0 },
  titleMobile: { fontSize: '20px' },
  subtitle: { fontSize: '13.5px', color: '#6b7770', marginTop: '5px' },

  badgeGroup: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-start' },
  totalBadge: {
    display: 'inline-flex', alignItems: 'center',
    backgroundColor: '#eaf3ec', color: '#256b3d', border: '1px solid #cfe0d3',
    padding: '6px 14px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 700, whiteSpace: 'nowrap',
  },
  ongoingBadge: {
    display: 'inline-flex', alignItems: 'center', gap: '7px',
    backgroundColor: '#fbeaea', color: '#b91c1c', border: '1px solid #f0c9c9',
    padding: '6px 14px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 700, whiteSpace: 'nowrap',
  },
  ongoingBadgeDot: { width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#b91c1c' },

  searchRow: { marginBottom: '14px' },
  searchRowMobile: {},
  searchInput: {
    width: '100%', maxWidth: '480px', padding: '11px 14px', borderRadius: '10px',
    border: '1px solid #dcdfd6', fontSize: '14px', boxSizing: 'border-box',
    backgroundColor: '#fff', color: '#16311d', fontFamily: SANS,
  },

  filters: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' },
  filtersMobile: { flexDirection: 'column', alignItems: 'stretch' },
  pillRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  filterPill: {
    padding: '7px 16px', borderRadius: '999px', fontSize: '13px', fontWeight: 600,
    color: '#33413a', backgroundColor: '#fff', border: '1px solid #dcdfd6', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  filterPillActive: { backgroundColor: '#2c8047', color: '#fff', border: '1px solid #2c8047' },
  dropdownGroup: { display: 'flex', gap: '10px' },
  dropdownGroupMobile: { flexDirection: 'column' },
  select: { padding: '10px 12px', borderRadius: '10px', border: '1px solid #dcdfd6', fontSize: '13.5px', color: '#33413a', backgroundColor: '#fff', cursor: 'pointer' },
  selectMobile: { width: '100%', boxSizing: 'border-box' },

  tableCard: { backgroundColor: '#fff', borderRadius: '14px', border: '1px solid #e7e8e0', overflow: 'hidden' },
  scrollHint: { fontSize: '11px', color: '#9aa79d', margin: '12px 20px 0' },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableMobile: { minWidth: '860px' },
  th: {
    textAlign: 'left', padding: '13px 20px', fontSize: '11px', fontWeight: 700, color: '#8a968d',
    borderBottom: '1px solid #eceee7', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
    backgroundColor: '#fafbf8',
  },
  td: { padding: '13px 20px', fontSize: '13px', color: '#4b5a50', borderBottom: '1px solid #f2f3ed', verticalAlign: 'middle' },
  sensorTag: {
    display: 'inline-block', padding: '3px 10px', borderRadius: '999px',
    fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap',
  },
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 11px',
    borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap',
  },
  badgeDot: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },
  ongoingDuration: { color: '#b91c1c', fontWeight: 700 },
  empty: { padding: '32px', textAlign: 'center', color: '#9aa79d', fontSize: '14px' },
}

const paginationStyles = {
  wrap: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 20px', borderTop: '1px solid #eceee7', flexWrap: 'wrap', gap: '10px',
  },
  wrapMobile: { flexDirection: 'column', alignItems: 'stretch' },
  info: { fontSize: '12.5px', color: '#8a968d', whiteSpace: 'nowrap' },
  controls: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  controlsMobile: { justifyContent: 'space-between' },
  pageSizeSelect: { padding: '6px 10px', borderRadius: '8px', border: '1px solid #dcdfd6', fontSize: '12.5px', color: '#4b5a50', marginRight: '6px' },
  navBtn: { minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '8px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#4b5a50', fontSize: '13px', cursor: 'pointer' },
  navBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  pageBtn: { minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '8px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#4b5a50', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' },
  pageBtnActive: { backgroundColor: '#2c8047', borderColor: '#2c8047', color: '#fff' },
  ellipsis: { padding: '0 4px', color: '#9aa79d', fontSize: '13px' },
}