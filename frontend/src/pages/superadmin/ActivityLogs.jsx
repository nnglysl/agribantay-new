import { useState, useEffect, useMemo, useRef } from 'react'
import AdminLayout from '../../components/AdminLayout'
import SharedPagination from '../../components/Pagination'
import ClearDateButton, { DateRangeHeader } from '../../components/ClearDateButton'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'
import { roleBadgeStyle } from '../../utils/roleBadgeStyle'
import { serviceTypeBadgeStyle } from '../../utils/serviceBadgeStyle'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

const roleLabel = {
  admin: 'Admin',
  super_admin: 'Super Admin',
  farm_owner: 'Farm Owner',
  vet: 'Veterinarian',
  System: 'System',
}

const TYPE_OPTIONS = ['Alert', 'Vaccination', 'Blood Test', 'Request', 'Inspection', 'Account', 'Farm']
const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'farm_owner', label: 'Farm Owner' },
  { value: 'vet', label: 'Veterinarian' },
  { value: 'System', label: 'System' },
]

export default function ActivityLogs() {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const isMobile = useIsMobile()

  const [filterOpen, setFilterOpen] = useState(false)
  const [draftRole, setDraftRole] = useState(roleFilter)
  const [draftType, setDraftType] = useState(typeFilter)
  const [draftFrom, setDraftFrom] = useState(dateFrom)
  const [draftTo, setDraftTo] = useState(dateTo)
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
    setDraftRole(roleFilter)
    setDraftType(typeFilter)
    setDraftFrom(dateFrom)
    setDraftTo(dateTo)
    setFilterOpen(true)
  }

  // One-click Clear Date: clears draft + applied dates immediately; role and
  // type filters are untouched.
  const clearDates = () => {
    setDraftFrom(''); setDraftTo('')
    setDateFrom(''); setDateTo('')
  }
  const hasDate = !!(draftFrom || draftTo || dateFrom || dateTo)

  const applyFilter = () => {
    setRoleFilter(draftRole)
    setTypeFilter(draftType)
    setDateFrom(draftFrom)
    setDateTo(draftTo)
    setFilterOpen(false)
  }

  const resetFilter = () => {
    setDraftRole('')
    setDraftType('')
    setDraftFrom('')
    setDraftTo('')
  }

  const activeFilterCount = [roleFilter, typeFilter, dateFrom, dateTo].filter(Boolean).length

  const params = {}
  if (roleFilter) params.role = roleFilter
  if (typeFilter) params.type = typeFilter

  const { data: logs, loading, error } = useCachedFetch('/superadmin/activity-logs', params, { pollMs: 60000 })

  const allLogs = useMemo(() => logs || [], [logs])

  const filteredLogs = useMemo(() => {
    return allLogs.filter(log => {
      if (dateFrom && new Date(log.created_at_raw) < new Date(dateFrom)) return false
      if (dateTo && new Date(log.created_at_raw) > new Date(`${dateTo}T23:59:59`)) return false
      if (search) {
        const q = search.toLowerCase()
        const haystack = [log.user, log.action, log.details].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [allLogs, dateFrom, dateTo, search])

  useEffect(() => { setCurrentPage(1) }, [roleFilter, typeFilter, dateFrom, dateTo, search, pageSize])

  const totalItems = filteredLogs.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [totalPages, currentPage])

  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredLogs.slice(start, start + pageSize)
  }, [filteredLogs, currentPage, pageSize])

  const rangeStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const rangeEnd = Math.min(currentPage * pageSize, totalItems)

  return (
    <AdminLayout>
      <div style={styles.header}>
        <div>
          <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Activity Logs</h1>
          <p style={styles.subtitle}>View system activities and user actions.</p>
        </div>
      </div>

      <div className="no-print" style={{ ...styles.toolbarRow, ...(isMobile ? styles.toolbarRowMobile : {}) }}>
        <div style={styles.searchWrap}>
          <svg style={styles.searchIcon} width="15" height="15" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="#9aa79d" strokeWidth="2" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="#9aa79d" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            placeholder="Search actor, action, or details..."
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

              <label style={styles.filterLabel}>Role</label>
              <select value={draftRole} onChange={e => setDraftRole(e.target.value)} style={styles.filterSelect}>
                <option value="">All Roles</option>
                {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>

              <label style={styles.filterLabel}>Type</label>
              <select value={draftType} onChange={e => setDraftType(e.target.value)} style={styles.filterSelect}>
                <option value="">All Types</option>
                {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>

              <DateRangeHeader>

                <label style={styles.filterLabel}>Date Range</label>

                <ClearDateButton visible={hasDate} onClick={clearDates} />

              </DateRangeHeader>
              <div style={styles.dateRangeStack}>
                <input type="date" value={draftFrom} onChange={e => setDraftFrom(e.target.value)} style={styles.filterSelect} />
                <span style={styles.dateRangeSep}>to</span>
                <input type="date" value={draftTo} onChange={e => setDraftTo(e.target.value)} style={styles.filterSelect} />
              </div>

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
          {isMobile && paginatedLogs.length > 0 && (
            <p style={styles.scrollHint}>Swipe left/right to see all columns →</p>
          )}
          <div style={isMobile ? styles.tableScroll : undefined}>
            <table style={{ ...styles.table, ...(isMobile ? styles.tableMobile : {}) }}>
              <thead>
                <tr>
                  <th style={styles.th}>Time</th>
                  <th style={styles.th}>Actor</th>
                  <th style={styles.th}>Role</th>
                  <th style={styles.th}>Action</th>
                  <th style={styles.th}>Details</th>
                  <th style={styles.th}>Type</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLogs.map(log => (
                  <tr key={log.id}>
                    <td style={styles.td}>{log.created_at}</td>
                    <td style={{ ...styles.td, fontWeight: 600, color: '#16311d' }}>{log.user}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.badge, ...roleBadgeStyle(log.role) }}>
                        {roleLabel[log.role] || log.role}
                      </span>
                    </td>
                    <td style={styles.td}>{log.action}</td>
                    <td style={styles.td}>{log.details}</td>
                    <td style={styles.td}>
                      {['Vaccination', 'Blood Test'].includes(log.type) ? (
                        <span style={{ ...styles.badge, ...serviceTypeBadgeStyle(log.type) }}>{log.type}</span>
                      ) : log.type}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredLogs.length === 0 && (
            <div style={styles.empty}>
              {search || activeFilterCount > 0 ? 'No activity matches your search or filter.' : 'No activity recorded yet.'}
            </div>
          )}

          {filteredLogs.length > 0 && (
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
  return (
    <div className="no-print" style={{ ...paginationStyles.wrap, ...(isMobile ? paginationStyles.wrapMobile : {}) }}>
      <div style={paginationStyles.info}>
        {totalItems === 0 ? 'No results' : `Showing ${rangeStart}–${rangeEnd} of ${totalItems}`}
      </div>

      <div style={{ ...paginationStyles.controls, ...(isMobile ? paginationStyles.controlsMobile : {}) }}>
        <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))} style={paginationStyles.pageSizeSelect}>
          {PAGE_SIZE_OPTIONS.map(size => (
            <option key={size} value={size}>{size} / page</option>
          ))}
        </select>

        <SharedPagination currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} isMobile={isMobile} />
      </div>
    </div>
  )
}

const SANS = "'Inter', sans-serif"

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },
  header: { marginBottom: '20px' },
  title: { fontSize: '24px', fontWeight: 800, letterSpacing: '-0.015em', color: '#16311d', margin: 0 },
  titleMobile: { fontSize: '20px' },
  subtitle: { fontSize: '13.5px', color: '#6b7770', marginTop: '5px' },

  toolbarRow: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' },
  toolbarRowMobile: { flexDirection: 'column', alignItems: 'stretch', gap: '12px' },

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
    maxHeight: '70vh', overflowY: 'auto',
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
  dateRangeStack: { display: 'flex', flexDirection: 'column', gap: '6px' },
  dateRangeSep: { fontSize: '11.5px', color: '#8a968d', textAlign: 'center' },

  tableCard: { backgroundColor: '#fff', borderRadius: '14px', border: '1px solid #e7e8e0', overflow: 'hidden' },
  scrollHint: { fontSize: '11px', color: '#9aa79d', margin: '12px 20px 0' },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableMobile: { minWidth: '860px' },
  th: {
    textAlign: 'left', padding: '13px 20px', fontSize: '13px', fontWeight: 600, color: '#8a968d',
    borderBottom: '1px solid #eceee7', whiteSpace: 'nowrap',
    backgroundColor: '#fafbf8',
  },
  td: { padding: '13px 20px', fontSize: '12px', color: '#4b5a50', borderBottom: '1px solid #f2f3ed', verticalAlign: 'middle' },
  badge: {
    display: 'inline-block', padding: '4px 11px', borderRadius: '999px',
    fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap',
  },
  empty: { padding: '32px', textAlign: 'center', color: '#9aa79d', fontSize: '14px' },
}

const paginationStyles = {
  wrap: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 20px', borderTop: '1px solid #eceee7', flexWrap: 'wrap', gap: '10px',
  },
  wrapMobile: { flexDirection: 'column', alignItems: 'stretch' },
  info: { fontSize: '12px', color: '#8a968d', whiteSpace: 'nowrap' },
  controls: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  controlsMobile: { justifyContent: 'space-between' },
  pageSizeSelect: { padding: '6px 10px', borderRadius: '8px', border: '1px solid #dcdfd6', fontSize: '12px', color: '#4b5a50', marginRight: '6px' },
  navBtn: { minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '8px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#4b5a50', fontSize: '13px', cursor: 'pointer' },
  navBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  pageBtn: { minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '8px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#4b5a50', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' },
  pageBtnActive: { backgroundColor: '#2c8047', borderColor: '#2c8047', color: '#fff' },
  ellipsis: { padding: '0 4px', color: '#9aa79d', fontSize: '13px' },
}