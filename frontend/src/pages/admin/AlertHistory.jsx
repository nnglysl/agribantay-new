import { useState, useEffect, useMemo, useRef } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

const PAGE_SIZE_OPTIONS = [10, 25, 50]
const SENSOR_TYPES = ['Ammonia', 'Temperature', 'Humidity', 'Moisture']

export default function AlertHistory() {
  const [severityFilter, setSeverityFilter] = useState('') // '' | 'Warning' | 'Critical'
  const [sensorFilter, setSensorFilter] = useState('')
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const isMobile = useIsMobile()

  const [filterOpen, setFilterOpen] = useState(false)
  const [draftSeverity, setDraftSeverity] = useState(severityFilter)
  const [draftSensor, setDraftSensor] = useState(sensorFilter)
  const filterRef = useRef(null)

  useEffect(() => {
    if (!filterOpen) return
    const handleClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [filterOpen])

  const openFilter = () => {
    setDraftSeverity(severityFilter)
    setDraftSensor(sensorFilter)
    setFilterOpen(true)
  }

  const applyFilter = () => {
    setSeverityFilter(draftSeverity)
    setSensorFilter(draftSensor)
    setFilterOpen(false)
  }

  const resetFilter = () => {
    setDraftSeverity('')
    setDraftSensor('')
  }

  const activeFilterCount = (severityFilter ? 1 : 0) + (sensorFilter ? 1 : 0)

  const params = {}
  if (severityFilter) params.status = severityFilter
  if (sensorFilter) params.sensor_type = sensorFilter
  if (search) params.search = search

  const { data: history, loading, error } = useCachedFetch('/admin/alert-history', params)

  const severityColor = { Warning: '#b45309', Critical: '#b91c1c' }
  const severityBg = { Warning: '#fbf1e2', Critical: '#fbeaea' }

  const allHistory = history || []

  useEffect(() => { setCurrentPage(1) }, [severityFilter, sensorFilter, search, pageSize])

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
      <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Alert History</h1>
      <p style={styles.subtitle}>View past and ongoing alerts from all monitored farms.</p>

      <div style={{ ...styles.toolbar, ...(isMobile ? styles.toolbarMobile : {}) }}>
        <div style={styles.searchWrap}>
          <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="#9aa79d" strokeWidth="2" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="#9aa79d" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            placeholder="Search by farm name or owner..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={styles.searchInput}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} style={styles.clearBtn} aria-label="Clear search">
              ×
            </button>
          )}
        </div>

        <div style={styles.filterAnchor} ref={filterRef}>
          <button
            type="button"
            onClick={() => (filterOpen ? setFilterOpen(false) : openFilter())}
            style={{ ...styles.filterBtn, ...(activeFilterCount > 0 ? styles.filterBtnActive : {}) }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M4 5h16l-6 8v6l-4-2v-4L4 5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            Filter
            {activeFilterCount > 0 && <span style={styles.filterCount}>{activeFilterCount}</span>}
          </button>

          {filterOpen && (
            <div style={{ ...styles.filterPanel, ...(isMobile ? styles.filterPanelMobile : {}) }}>
              <div style={styles.filterPanelHeader}>
                <span style={styles.filterPanelTitle}>Filter</span>
                <span style={styles.filterPanelClose} onClick={() => setFilterOpen(false)}>×</span>
              </div>

              <label style={styles.filterLabel}>Severity</label>
              <select value={draftSeverity} onChange={e => setDraftSeverity(e.target.value)} style={styles.filterSelect}>
                <option value="">All Severity</option>
                <option value="Warning">Warning</option>
                <option value="Critical">Critical</option>
              </select>

              <label style={styles.filterLabel}>Sensor</label>
              <select value={draftSensor} onChange={e => setDraftSensor(e.target.value)} style={styles.filterSelect}>
                <option value="">All Sensors</option>
                {SENSOR_TYPES.map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}
              </select>

              <div style={styles.filterActions}>
                <button type="button" onClick={resetFilter} style={styles.filterResetBtn}>Reset</button>
                <button type="button" onClick={applyFilter} style={styles.filterApplyBtn}>Apply</button>
              </div>
            </div>
          )}
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
                  <th style={styles.th}>Triggered</th>
                  <th style={styles.th}>Duration</th>
                  <th style={styles.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedHistory.map(h => {
                  const c = severityColor[h.status] || '#6b7280'
                  return (
                    <tr key={h.id}>
                      <td style={{ ...styles.td, fontWeight: 600, color: '#16311d' }}>{h.farm_name}</td>
                      <td style={styles.td}>{h.farm_owner_name || '—'}</td>
                      <td style={styles.td}>{h.sensor_type}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, color: c, backgroundColor: severityBg[h.status] || '#eef1ea' }}>
                          {h.status}
                        </span>
                      </td>
                      <td style={styles.td}>{h.triggered_at}</td>
                      <td style={styles.td}>{h.duration}</td>
                      <td style={styles.td}>
                        {h.is_ongoing ? (
                          <span style={{ ...styles.badge, color: '#b91c1c', backgroundColor: '#fbeaea' }}>Ongoing</span>
                        ) : (
                          <span style={{ ...styles.badge, color: '#256b3d', backgroundColor: '#eaf3ec' }}>Resolved</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {allHistory.length === 0 && (
            <div style={styles.empty}>
              {search || severityFilter || sensorFilter
                ? 'No alerts match your search or filter.'
                : 'No alert history recorded yet.'}
            </div>
          )}

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
        {totalItems === 0 ? 'No results' : `Showing ${rangeStart}–${rangeEnd} of ${totalItems} results`}
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

const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },
  title: { fontSize: '24px', fontWeight: 800, letterSpacing: '-0.015em', color: '#16311d', margin: 0 },
  titleMobile: { fontSize: '20px' },
  subtitle: { fontSize: '13.5px', color: '#6b7770', marginTop: '5px', marginBottom: '20px' },

  toolbar: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' },
  toolbarMobile: { flexDirection: 'column', alignItems: 'stretch' },

  searchWrap: { position: 'relative', flex: 1 },
  searchIcon: { position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' },
  searchInput: {
    width: '100%', padding: '11px 40px 11px 40px', borderRadius: '10px',
    border: '1px solid #dcdfd6', fontSize: '14px', boxSizing: 'border-box',
    backgroundColor: '#fff', color: '#16311d', fontFamily: SANS,
  },
  clearBtn: {
    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
    width: '22px', height: '22px', borderRadius: '50%', border: 'none',
    backgroundColor: '#eceee7', color: '#6b7770', fontSize: '15px', lineHeight: 1,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: SANS, padding: 0,
  },

  filterAnchor: { position: 'relative', flexShrink: 0 },
  filterBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
    borderRadius: '10px', border: '1px solid #dcdfd6', backgroundColor: '#fff',
    color: '#33413a', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap',
  },
  filterBtnActive: { borderColor: '#2c8047', color: '#2c8047' },
  filterCount: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: '18px', height: '18px', borderRadius: '999px', backgroundColor: '#2c8047',
    color: '#fff', fontSize: '11px', fontWeight: 700, padding: '0 4px',
  },
  filterPanel: {
    position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 40,
    backgroundColor: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px',
    boxShadow: '0 8px 24px rgba(15,38,22,0.12)', padding: '18px', width: '280px',
  },
  filterPanelMobile: { right: 0, width: '260px' },
  filterPanelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' },
  filterPanelTitle: { fontSize: '15px', fontWeight: 800, color: '#16311d' },
  filterPanelClose: { fontSize: '19px', cursor: 'pointer', color: '#8a968d', lineHeight: 1 },
  filterLabel: { display: 'block', fontSize: '12px', fontWeight: 700, color: '#4b5a50', marginBottom: '7px', marginTop: '14px' },
  filterSelect: {
    width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #dcdfd6',
    fontSize: '13px', color: '#33413a', backgroundColor: '#fff', cursor: 'pointer',
    fontFamily: SANS, boxSizing: 'border-box',
  },
  filterActions: { display: 'flex', gap: '10px', marginTop: '20px' },
  filterResetBtn: {
    flex: 1, padding: '9px 0', borderRadius: '10px', border: '1px solid #dcdfd6',
    backgroundColor: '#fff', color: '#33413a', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS,
  },
  filterApplyBtn: {
    flex: 1, padding: '9px 0', borderRadius: '10px', border: 'none',
    backgroundColor: '#2c8047', color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
  },

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
  badge: {
    display: 'inline-flex', alignItems: 'center', padding: '4px 11px',
    borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap',
  },
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