import { useState, useMemo, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import AdminLayout from '../../components/AdminLayout'
import SharedPagination from '../../components/Pagination'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'
import { formatDateTime } from '../../utils/formatDate'
import { viewModalStyles as v } from '../../styles/viewModalStyles'
import { BADGE_SHAPE, serviceTypeBadgeStyle, serviceTypeLabel, requestStatusBadgeStyle } from '../../utils/serviceBadgeStyle'
import { isRequestOverdue, requestDisplayStatus } from '../../utils/serviceRequestStatus'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

// Super Admin has system-wide oversight — sees every service request type,
// including the two Vet-only ones that Admin's own Service Requests page
// (pages/admin/ServiceRequests.jsx) deliberately excludes.
const ALL_TYPES = ['Odor Control Request', 'Fly Control Request', 'Vaccine Request', 'Blood Test Request']

const SORT_OPTIONS = [
  { value: 'oldest', label: 'Oldest Request First (Default)' },
  { value: 'newest', label: 'Newest Request First' },
]

/**
 * Super Admin's Service Requests page is view-only monitoring/oversight —
 * no accept/decline/complete actions. Operational handling of Odor/Fly
 * Control stays exclusive to Admin's own page; Vaccine/Blood Test stay
 * exclusive to the Veterinarian's own module. Kept as a fully separate file
 * (not a shared component with role flags) so permissions never risk
 * bleeding into each other.
 */
export default function SuperAdminServiceRequests() {
  // Deep links (e.g. from a Super Admin dashboard notification) can preset
  // the tab and search via ?tab= / ?search= so the relevant record is in view.
  const [searchParams] = useSearchParams()
  const initialTab = ['pending', 'scheduled', 'overdue', 'history'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'pending'
  const [tab, setTab] = useState(initialTab)
  const [search, setSearch] = useState(() => searchParams.get('search') || '')
  const [typeFilter, setTypeFilter] = useState('')
  const [sortMode, setSortMode] = useState('oldest')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [viewRequest, setViewRequest] = useState(null)
  const isMobile = useIsMobile()

  const [filterOpen, setFilterOpen] = useState(false)
  const [draftType, setDraftType] = useState(typeFilter)
  const [draftSort, setDraftSort] = useState(sortMode)
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
    setDraftType(typeFilter)
    setDraftSort(sortMode)
    setFilterOpen(true)
  }

  const applyFilter = () => {
    setTypeFilter(draftType)
    setSortMode(draftSort)
    setFilterOpen(false)
  }

  const resetFilter = () => {
    setDraftType('')
    setDraftSort('oldest')
  }

  const activeFilterCount = (typeFilter ? 1 : 0) + (sortMode !== 'oldest' ? 1 : 0)

  const params = { sort: sortMode }
  if (typeFilter) params.service_type = typeFilter

  const { data, loading, error } = useCachedFetch('/admin/service-requests', params, { pollMs: 45000 })
  const allRequests = data || []

  const filtered = allRequests.filter(r => {
    if (tab === 'pending' && r.status !== 'Pending') return false
    // Overdue is the past-due slice of Scheduled (derived, not stored).
    if (tab === 'scheduled' && (r.status !== 'Scheduled' || isRequestOverdue(r))) return false
    if (tab === 'overdue' && !isRequestOverdue(r)) return false
    if (tab === 'history' && !(r.status === 'Completed' || r.status === 'Cancelled')) return false

    if (search) {
      const q = search.toLowerCase()
      const haystack = [
        r.request_number, r.service_type, r.farm_name, r.farm_owner_name, r.requested_by,
      ].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }

    return true
  })

  useEffect(() => { setCurrentPage(1) }, [tab, pageSize, typeFilter, sortMode, search])

  const totalItems = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [totalPages, currentPage])

  const list = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, currentPage, pageSize])

  const rangeStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const rangeEnd = Math.min(currentPage * pageSize, totalItems)

  return (
    <AdminLayout>
      <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Service Requests</h1>
      <p style={styles.subtitle}>Monitor all service requests across registered farms.</p>

      <div className="no-print" style={{ ...styles.toolbar, ...(isMobile ? styles.toolbarMobile : {}) }}>
        <div style={styles.tabs}>
          <div style={{ ...styles.tab, ...(tab === 'pending' ? styles.tabActive : {}) }} onClick={() => setTab('pending')}>
            Pending
          </div>
          <div style={{ ...styles.tab, ...(tab === 'scheduled' ? styles.tabActive : {}) }} onClick={() => setTab('scheduled')}>
            Scheduled
          </div>
          <div style={{ ...styles.tab, ...(tab === 'overdue' ? styles.tabActive : {}) }} onClick={() => setTab('overdue')}>
            Overdue
          </div>
          <div style={{ ...styles.tab, ...(tab === 'history' ? styles.tabActive : {}) }} onClick={() => setTab('history')}>
            History
          </div>
        </div>

        <div style={{ ...styles.toolbarRight, ...(isMobile ? styles.toolbarRightMobile : {}) }}>
          <div style={styles.searchWrap}>
            <svg style={styles.searchIcon} width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="#9aa79d" strokeWidth="2" />
              <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="#9aa79d" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              placeholder="Search request, farm, or owner..."
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

                <label style={styles.filterLabel}>Request Type</label>
                <select value={draftType} onChange={e => setDraftType(e.target.value)} style={styles.filterSelect}>
                  <option value="">All Types</option>
                  {ALL_TYPES.map(t => (
                    <option key={t} value={t}>{t.replace(' Request', '')}</option>
                  ))}
                </select>

                <label style={styles.filterLabel}>Sort By</label>
                <select value={draftSort} onChange={e => setDraftSort(e.target.value)} style={styles.filterSelect}>
                  {SORT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>

                <div style={styles.filterActions}>
                  <button type="button" onClick={resetFilter} style={styles.filterResetBtn}>Reset</button>
                  <button type="button" onClick={applyFilter} style={styles.filterApplyBtn}>Apply</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {loading && <p style={styles.stateText}>Loading...</p>}
      {error && <p style={{ ...styles.stateText, color: '#b91c1c' }}>{error}</p>}

      {!loading && !error && (
        <div style={styles.tableCard}>
          {isMobile && list.length > 0 && (
            <p style={styles.scrollHint}>Swipe left/right to see all columns →</p>
          )}

          <div style={isMobile ? styles.tableScroll : undefined}>
            <table style={{ ...styles.table, ...(isMobile ? styles.tableMobile : {}) }}>
              <thead>
                <tr>
                  <th style={styles.th}>Request No.</th>
                  <th style={styles.th}>Service</th>
                  <th style={styles.th}>Farm</th>
                  <th style={styles.th}>Farm Owner</th>
                  <th style={styles.th}>Status</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map(r => {
                  return (
                    <tr key={r.id}>
                      <td style={styles.td}>
                        <span style={styles.reqNumberCell}>{r.request_number || '—'}</span>
                      </td>
                      <td style={styles.td}>
                        <span style={{ ...BADGE_SHAPE, ...serviceTypeBadgeStyle(r.service_type) }}>
                          {serviceTypeLabel(r.service_type)}
                        </span>
                      </td>
                      <td style={styles.td}>{r.farm_name}</td>
                      <td style={styles.td}>{r.farm_owner_name || r.requested_by}</td>
                      <td style={styles.td}>
                        <span style={{ ...BADGE_SHAPE, ...requestStatusBadgeStyle(requestDisplayStatus(r)) }}>
                          {requestDisplayStatus(r)}
                        </span>
                        {r.status === 'Cancelled' && r.decline_reason && (
                          <div style={styles.notes} title={r.decline_reason}>Reason: {r.decline_reason}</div>
                        )}
                      </td>
                      <td style={styles.td}>
                        <div style={styles.actionGroup}>
                          <span style={{ ...styles.actionBtn, ...styles.viewBtn }} onClick={() => setViewRequest(r)}>
                            View
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {list.length === 0 && (
            <div style={styles.empty}>
              {search || typeFilter ? 'No requests match your search or filter.' : 'No requests here yet.'}
            </div>
          )}

          {totalItems > 0 && (
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

      {viewRequest && (() => {
        const fields = [
          { label: 'Service Type', value: serviceTypeLabel(viewRequest.service_type) },
          { label: 'Farm', value: viewRequest.farm_name },
          { label: 'Farm Owner', value: viewRequest.farm_owner_name || viewRequest.requested_by },
          ...(viewRequest.accepted_by ? [{ label: 'Accepted By', value: viewRequest.accepted_by }] : []),
          ...(viewRequest.scheduled_at ? [{ label: 'Scheduled', value: formatDateTime(viewRequest.scheduled_at) }] : []),
          ...(viewRequest.completed_at ? [{ label: 'Completed', value: formatDateTime(viewRequest.completed_at) }] : []),
          { label: 'Submitted', value: formatDateTime(viewRequest.created_at) },
          ...(viewRequest.status === 'Cancelled' && viewRequest.decline_reason
            ? [{ label: 'Decline Reason', value: viewRequest.decline_reason }]
            : []),
        ]
        return (
          <div style={v.overlay} onClick={() => setViewRequest(null)}>
            <div style={{ ...v.modal, ...(isMobile ? v.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
              <div style={v.header}>
                <div style={v.headerTitleRow}>
                  <h3 style={v.title}>{viewRequest.request_number || 'Service Request'}</h3>
                  <span style={{ ...v.badge, ...requestStatusBadgeStyle(requestDisplayStatus(viewRequest)) }}>{requestDisplayStatus(viewRequest)}</span>
                </div>
                <span style={v.close} onClick={() => setViewRequest(null)}>×</span>
              </div>

              <span style={v.sectionLabel}>Request Information</span>
              <div style={viewRequest.notes ? v.grid : v.gridLast}>
                {fields.map(f => (
                  <div key={f.label} style={v.fieldBox}>
                    <div style={v.fieldLabel}>{f.label}</div>
                    {f.label === 'Service Type' && viewRequest.service_type ? (
                      <span style={{ ...v.badge, ...serviceTypeBadgeStyle(viewRequest.service_type) }}>{f.value}</span>
                    ) : (
                      <div style={v.fieldValue}>{f.value || '—'}</div>
                    )}
                  </div>
                ))}
              </div>

              {viewRequest.notes && (
                <>
                  <span style={v.sectionLabel}>Notes</span>
                  <div style={{ ...v.notesBox, ...(viewRequest.completion_notes ? { marginBottom: '12px' } : {}) }}>
                    <p style={v.notes}>{viewRequest.notes}</p>
                  </div>
                </>
              )}

              {viewRequest.completion_notes && (
                <>
                  <span style={v.sectionLabel}>Visit Notes</span>
                  <div style={v.notesBox}>
                    <p style={v.notes}>{viewRequest.completion_notes}</p>
                  </div>
                </>
              )}

              <div style={v.actions}>
                <button onClick={() => setViewRequest(null)} style={v.closeBtn}>Close</button>
              </div>
            </div>
          </div>
        )
      })()}
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
  title: { fontSize: '24px', fontWeight: 800, letterSpacing: '-0.015em', color: '#16311d', margin: 0 },
  titleMobile: { fontSize: '20px' },
  subtitle: { fontSize: '13.5px', color: '#6b7770', marginTop: '5px', marginBottom: '20px' },

  toolbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: '14px', marginBottom: '18px', borderBottom: '1px solid #e7e8e0', flexWrap: 'wrap',
  },
  toolbarMobile: { flexDirection: 'column', alignItems: 'stretch', gap: '12px' },

  tabs: { display: 'flex', gap: '4px', overflowX: 'auto' },
  tab: { padding: '10px 16px', fontSize: '14px', color: '#6b7770', cursor: 'pointer', borderBottom: '2px solid transparent', whiteSpace: 'nowrap' },
  tabActive: { color: '#2c8047', fontWeight: 700, borderBottom: '2px solid #2c8047' },

  toolbarRight: { display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '10px' },
  toolbarRightMobile: { paddingBottom: '2px' },

  searchWrap: { position: 'relative', width: '240px', maxWidth: '100%' },
  searchIcon: { position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' },
  searchInput: {
    width: '100%', padding: '8px 34px 8px 34px', borderRadius: '10px',
    border: '1px solid #dcdfd6', fontSize: '13px', boxSizing: 'border-box',
    backgroundColor: '#fff', color: '#16311d', fontFamily: SANS,
  },
  clearBtn: {
    position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
    width: '18px', height: '18px', borderRadius: '50%', border: 'none',
    backgroundColor: '#eceee7', color: '#6b7770', fontSize: '13px', lineHeight: 1,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: SANS, padding: 0,
  },

  filterAnchor: { position: 'relative', flexShrink: 0 },
  filterBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 15px',
    borderRadius: '10px', border: '1px solid #dcdfd6', backgroundColor: '#fff',
    color: '#33413a', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap',
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
    textAlign: 'left', padding: '13px 20px', fontSize: '13px', fontWeight: 600, color: '#8a968d',
    borderBottom: '1px solid #eceee7', whiteSpace: 'nowrap',
    backgroundColor: '#fafbf8',
  },
  td: { padding: '13px 20px', fontSize: '12px', color: '#4b5a50', borderBottom: '1px solid #f2f3ed', verticalAlign: 'top' },
  reqNumberCell: { fontSize: '12px', color: '#4b5a50' },
  notes: { fontSize: '12px', color: '#8a968d', marginTop: '4px', maxWidth: '260px' },
  actionGroup: { display: 'flex', gap: '6px', whiteSpace: 'nowrap', justifyContent: 'flex-end' },
  actionBtn: {
    padding: '6px 13px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600,
    cursor: 'pointer', border: '1px solid #e3e6dd', backgroundColor: '#fff', whiteSpace: 'nowrap',
  },
  viewBtn: { color: '#4b5a50' },
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
