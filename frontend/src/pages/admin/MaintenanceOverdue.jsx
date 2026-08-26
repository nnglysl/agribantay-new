import { useState, useEffect, useMemo, useRef } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

const PAGE_SIZE_OPTIONS = [10, 25, 50]
const FARM_SIZES = ['Small', 'Medium', 'Large']

const STATUS_COLOR = { Overdue: '#b45309', 'Non-Compliant': '#b91c1c' }
const STATUS_BG = { Overdue: '#fbf1e2', 'Non-Compliant': '#fbeaea' }

export default function MaintenanceOverdue() {
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const isMobile = useIsMobile()

  const [barangayFilter, setBarangayFilter] = useState('')
  const [sizeFilter, setSizeFilter] = useState('')

  const [filterOpen, setFilterOpen] = useState(false)
  const [draftBarangay, setDraftBarangay] = useState('')
  const [draftSize, setDraftSize] = useState('')
  const filterRef = useRef(null)

  const [viewFarmId, setViewFarmId] = useState(null)

  const params = {}
  if (search) params.search = search

  const { data: farms, loading, error } = useCachedFetch('/admin/maintenance/overdue', params)

  const overdueFarms = farms || []

  const barangayOptions = useMemo(() => {
    const set = new Set()
    overdueFarms.forEach(f => { if (f.barangay) set.add(f.barangay) })
    return [...set].sort()
  }, [overdueFarms])

  const filteredFarms = useMemo(() => {
    return overdueFarms.filter(f => {
      if (barangayFilter && f.barangay !== barangayFilter) return false
      if (sizeFilter && f.farm_size !== sizeFilter) return false
      return true
    })
  }, [overdueFarms, barangayFilter, sizeFilter])

  useEffect(() => { setCurrentPage(1) }, [search, pageSize, barangayFilter, sizeFilter, filteredFarms.length])

  useEffect(() => {
    if (!filterOpen) return
    const handleClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [filterOpen])

  const openFilter = () => {
    setDraftBarangay(barangayFilter)
    setDraftSize(sizeFilter)
    setFilterOpen(true)
  }

  const applyFilter = () => {
    setBarangayFilter(draftBarangay)
    setSizeFilter(draftSize)
    setFilterOpen(false)
  }

  const resetFilter = () => {
    setDraftBarangay('')
    setDraftSize('')
  }

  const activeFilterCount = [barangayFilter, sizeFilter].filter(Boolean).length

  const totalItems = filteredFarms.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [totalPages, currentPage])

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredFarms.slice(start, start + pageSize)
  }, [filteredFarms, currentPage, pageSize])

  const rangeStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const rangeEnd = Math.min(currentPage * pageSize, totalItems)

  const formatDaysOverdue = (days) => (days === 0 ? 'Due Today' : `${days} day${days === 1 ? '' : 's'}`)

  return (
    <AdminLayout>
      <style>{`
        @keyframes agb-panel-slide-in {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      <div style={styles.header}>
        <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Overdue Maintenance</h1>
        <p style={styles.subtitle}>Farms that have exceeded their expected manure clean-out date.</p>
      </div>

      <div style={{ ...styles.toolbar, ...(isMobile ? styles.toolbarMobile : {}) }}>
        <div style={styles.searchWrap}>
          <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="#9aa79d" strokeWidth="2" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="#9aa79d" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            placeholder="Search farm, owner, or farm ID..."
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

              <label style={styles.filterLabel}>Barangay</label>
              <select value={draftBarangay} onChange={e => setDraftBarangay(e.target.value)} style={styles.filterSelect}>
                <option value="">All Barangays</option>
                {barangayOptions.map(b => <option key={b} value={b}>{b}</option>)}
              </select>

              <label style={styles.filterLabel}>Farm Size</label>
              <select value={draftSize} onChange={e => setDraftSize(e.target.value)} style={styles.filterSelect}>
                <option value="">All Sizes</option>
                {FARM_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>

              <div style={styles.filterActions}>
                <button type="button" onClick={resetFilter} style={styles.filterResetBtn}>Reset</button>
                <button type="button" onClick={applyFilter} style={styles.filterApplyBtn}>Apply</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <p style={styles.countText}>
        {totalItems} farm{totalItems === 1 ? '' : 's'} requiring attention
      </p>

      {loading && <p style={styles.stateText}>Loading...</p>}
      {error && <p style={{ ...styles.stateText, color: '#b91c1c' }}>{error}</p>}

      {!loading && !error && (
        <div style={styles.tableCard}>
          {isMobile && filteredFarms.length > 0 && (
            <p style={styles.scrollHint}>Swipe left/right to see all columns →</p>
          )}
          <div style={isMobile ? styles.tableScroll : undefined}>
            <table style={{ ...styles.table, ...(isMobile ? styles.tableMobile : {}) }}>
              <thead>
                <tr>
                  <th style={styles.th}>Farm</th>
                  <th style={styles.th}>Owner</th>
                  <th style={styles.th}>Barangay</th>
                  <th style={styles.th}>Farm Size</th>
                  <th style={styles.th}>Last Clean-out</th>
                  <th style={styles.th}>Days Overdue</th>
                  <th style={styles.th}>Maintenance Status</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(f => (
                  <tr key={f.farm_id}>
                    <td style={{ ...styles.td, fontWeight: 600, color: '#16311d' }}>{f.farm_name}</td>
                    <td style={styles.td}>{f.owner_name}</td>
                    <td style={styles.td}>{f.barangay}</td>
                    <td style={styles.td}>{f.farm_size}</td>
                    <td style={styles.td}>{f.last_performed_at || 'Never logged'}</td>
                    <td style={styles.td}>
                      <span style={styles.overdueBadge}>
                        <span style={styles.overdueBadgeDot} />
                        {formatDaysOverdue(f.days_overdue)}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.badge,
                        color: STATUS_COLOR[f.status] || '#6b7280',
                        backgroundColor: STATUS_BG[f.status] || '#eef1ea',
                      }}>
                        <span style={{ ...styles.badgeDot, backgroundColor: STATUS_COLOR[f.status] || '#6b7280' }} />
                        {f.status}
                      </span>
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>
                      <button
                        type="button"
                        style={styles.viewBtn}
                        onClick={() => setViewFarmId(f.farm_id)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredFarms.length === 0 && (
            <div style={styles.empty}>
              {search || barangayFilter || sizeFilter
                ? 'No farms match your search or filter.'
                : 'No farms are currently overdue or non-compliant for manure clean-out.'}
            </div>
          )}

          {filteredFarms.length > 0 && (
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

      <MaintenanceDetailPanel farmId={viewFarmId} onClose={() => setViewFarmId(null)} isMobile={isMobile} />
    </AdminLayout>
  )
}

function FarmIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2c8047" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21V9l9-6 9 6v12h-6v-7H9v7H3z" />
    </svg>
  )
}

function WarningIcon({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 2 20h20L12 3z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r="0.6" fill={color} stroke="none" />
    </svg>
  )
}

function MaintenanceDetailPanel({ farmId, onClose, isMobile }) {
  const { data, loading, error } = useCachedFetch(farmId ? `/admin/maintenance/${farmId}/details` : null)
  const open = !!farmId

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const farm = data?.farm
  const m = data?.maintenance
  const notifications = data?.notifications || []
  const logs = data?.logs || []

  return (
    <>
      <div style={panelStyles.clickCatcher} onClick={onClose} />
      <div style={{ ...panelStyles.panel, ...(isMobile ? panelStyles.panelMobile : {}) }}>
        <div style={panelStyles.header}>
          <span style={panelStyles.headerTitle}>Farm Maintenance Details</span>
          <span style={panelStyles.closeBtn} onClick={onClose}>×</span>
        </div>

        <div style={panelStyles.body}>
          {loading && <p style={panelStyles.stateText}>Loading...</p>}
          {error && <p style={{ ...panelStyles.stateText, color: '#b91c1c' }}>{error}</p>}

          {farm && m && (
            <>
              <div style={panelStyles.farmInfoRow}>
                <span style={panelStyles.farmIconWrap}><FarmIcon /></span>
                <div style={{ minWidth: 0 }}>
                  <div style={panelStyles.farmName}>{farm.farm_name}</div>
                  <div style={panelStyles.farmMeta}>{farm.owner_name} · {farm.barangay}</div>
                  <span style={panelStyles.sizeBadge}>{farm.farm_size}</span>
                </div>
              </div>

              <div style={panelStyles.sectionTitle}>Maintenance Overview</div>
              <div style={panelStyles.card}>
                <PanelRow label="Expected Clean-out Date" value={m.due_date} />
                <PanelRow label="Last Clean-out Date" value={m.last_performed_at} />
                <PanelRow
                  label="Days Overdue"
                  value={m.days_overdue === 0 ? 'Due Today' : `${m.days_overdue} day${m.days_overdue === 1 ? '' : 's'}`}
                />
                <PanelRow
                  label="Maintenance Status"
                  valueNode={
                    <span style={{
                      ...panelStyles.statusPill,
                      color: STATUS_COLOR[m.status] || '#6b7280',
                      backgroundColor: STATUS_BG[m.status] || '#eef1ea',
                    }}>
                      {m.status}
                    </span>
                  }
                />
                <PanelRow label="Grace Period Status" value={m.grace_status} last />
              </div>

              <div style={panelStyles.sectionTitle}>SMS / Notification History</div>
              <div style={panelStyles.card}>
                {notifications.length === 0 ? (
                  <p style={panelStyles.emptyText}>No notifications sent yet for this farm.</p>
                ) : (
                  notifications.map((n, i) => {
                    const color = n.event === 'Non-Compliance Notice' ? '#b91c1c' : '#b45309'
                    const bg = n.event === 'Non-Compliance Notice' ? '#fbeaea' : '#fbf1e2'
                    return (
                      <div key={i} style={{ ...panelStyles.notifRow, ...(i === notifications.length - 1 ? panelStyles.rowLast : {}) }}>
                        <span style={{ ...panelStyles.notifIconWrap, backgroundColor: bg }}>
                          <WarningIcon color={color} />
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={panelStyles.notifTopRow}>
                            <span style={panelStyles.notifTitle}>{n.event}</span>
                            <span style={{ ...panelStyles.notifStatus, color: n.status === 'Sent' ? '#2c8047' : '#b91c1c' }}>
                              {n.status}
                            </span>
                          </div>
                          <div style={panelStyles.notifDesc}>{n.description}</div>
                          <div style={panelStyles.notifTime}>{n.sent_at}</div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
              {notifications.length > 0 && (
                <div style={panelStyles.viewAllRow}>
                  View all notifications <span style={panelStyles.viewAllArrow}>›</span>
                </div>
              )}

              <div style={{ ...panelStyles.sectionTitle, marginTop: '22px' }}>Manure Clean-out Records</div>
              <div style={panelStyles.card}>
                {logs.length === 0 ? (
                  <p style={panelStyles.emptyText}>No clean-out records logged for this farm yet.</p>
                ) : (
                  <table style={panelStyles.logsTable}>
                    <thead>
                      <tr>
                        <th style={panelStyles.logsTh}>Date Cleaned</th>
                        <th style={panelStyles.logsTh}>Notes</th>
                        <th style={panelStyles.logsTh}>Recorded By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log, i) => (
                        <tr key={i}>
                          <td style={panelStyles.logsTd}>{log.performed_at}</td>
                          <td style={panelStyles.logsTd}>{log.notes || '—'}</td>
                          <td style={panelStyles.logsTd}>{log.recorded_by}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {logs.length > 0 && (
                <div style={panelStyles.viewAllRow}>
                  View all records <span style={panelStyles.viewAllArrow}>›</span>
                </div>
              )}
            </>
          )}
        </div>

        <div style={panelStyles.footer}>
          <button onClick={onClose} style={panelStyles.closeFooterBtn}>Close</button>
        </div>
      </div>
    </>
  )
}

function PanelRow({ label, value, valueNode, last }) {
  return (
    <div style={{ ...panelStyles.row, ...(last ? panelStyles.rowLast : {}) }}>
      <span style={panelStyles.rowLabel}>{label}</span>
      {valueNode ?? <span style={panelStyles.rowValue}>{value ?? '—'}</span>}
    </div>
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

const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },
  header: { marginBottom: '20px' },
  title: { fontSize: '24px', fontWeight: 800, letterSpacing: '-0.015em', color: '#16311d', margin: 0 },
  titleMobile: { fontSize: '20px' },
  subtitle: { fontSize: '13.5px', color: '#6b7770', marginTop: '5px', maxWidth: '640px', lineHeight: 1.5 },

  toolbar: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' },
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

  countText: { fontSize: '12.5px', color: '#8a968d', margin: '0 0 12px', fontFamily: SANS },

  tableCard: { backgroundColor: '#fff', borderRadius: '14px', border: '1px solid #e7e8e0', overflow: 'hidden' },
  scrollHint: { fontSize: '11px', color: '#9aa79d', margin: '12px 20px 0' },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableMobile: { minWidth: '960px' },
  th: {
    textAlign: 'left', padding: '13px 20px', fontSize: '11px', fontWeight: 700, color: '#8a968d',
    borderBottom: '1px solid #eceee7', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
    backgroundColor: '#fafbf8',
  },
  td: { padding: '13px 20px', fontSize: '13px', color: '#4b5a50', borderBottom: '1px solid #f2f3ed', verticalAlign: 'middle' },
  overdueBadge: {
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 11px', borderRadius: '999px',
    backgroundColor: '#fbeaea', color: '#b91c1c', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap',
  },
  overdueBadgeDot: { width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#b91c1c', flexShrink: 0 },
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 11px',
    borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap',
  },
  badgeDot: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },
  viewBtn: {
    padding: '6px 13px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600,
    cursor: 'pointer', border: '1px solid #e3e6dd', backgroundColor: '#fff', color: '#4b5a50', whiteSpace: 'nowrap',
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

const panelStyles = {
  clickCatcher: { position: 'fixed', inset: 0, zIndex: 90, background: 'transparent' },
  panel: {
    position: 'fixed', top: 0, right: 0, bottom: 0, width: '440px', maxWidth: '92vw',
    backgroundColor: '#fff', boxShadow: '-8px 0 32px rgba(15,38,22,0.14)',
    zIndex: 100, display: 'flex', flexDirection: 'column',
    animation: 'agb-panel-slide-in 0.22s ease-out', borderLeft: '1px solid #E5E7EB',
  },
  panelMobile: { width: '100%', maxWidth: '100%' },

  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '18px 22px', borderBottom: '1px solid #E5E7EB', flexShrink: 0,
  },
  headerTitle: { fontSize: '15px', fontWeight: 800, color: '#111827', fontFamily: SANS },
  closeBtn: { fontSize: '20px', cursor: 'pointer', color: '#8a968d', lineHeight: 1 },

  body: { flex: 1, overflowY: 'auto', padding: '20px 22px' },
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#6b7770' },

  farmInfoRow: { display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '22px' },
  farmIconWrap: {
    width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#eaf3ec',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  farmName: { fontSize: '15.5px', fontWeight: 800, color: '#111827', fontFamily: SANS },
  farmMeta: { fontSize: '12.5px', color: '#6b7280', marginTop: '3px', fontFamily: SANS },
  sizeBadge: {
    display: 'inline-block', marginTop: '8px', padding: '3px 10px', borderRadius: '999px',
    backgroundColor: '#eaf3ec', color: '#2c8047', fontSize: '11px', fontWeight: 700, fontFamily: SANS,
  },

  sectionTitle: { fontSize: '12.5px', fontWeight: 700, color: '#111827', marginBottom: '10px', fontFamily: SANS },

  card: {
    backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '14px',
    padding: '14px 16px', marginBottom: '8px',
  },

  row: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
    padding: '10px 0', borderBottom: '1px solid #F2F3F5',
  },
  rowLast: { borderBottom: 'none' },
  rowLabel: { fontSize: '12.5px', color: '#6b7280', fontFamily: SANS, flexShrink: 0 },
  rowValue: { fontSize: '13px', fontWeight: 600, color: '#111827', fontFamily: SANS, textAlign: 'right' },
  statusPill: {
    padding: '3px 10px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, fontFamily: SANS, whiteSpace: 'nowrap',
  },

  emptyText: { fontSize: '12.5px', color: '#9aa79d', fontStyle: 'italic', fontFamily: SANS, margin: '4px 0' },

  notifRow: { display: 'flex', alignItems: 'flex-start', gap: '11px', padding: '12px 0', borderBottom: '1px solid #F2F3F5' },
  notifIconWrap: {
    width: '32px', height: '32px', borderRadius: '50%', display: 'flex',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px',
  },
  notifTopRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' },
  notifTitle: { fontSize: '13px', fontWeight: 700, color: '#111827', fontFamily: SANS },
  notifStatus: { fontSize: '11.5px', fontWeight: 700, fontFamily: SANS, flexShrink: 0, whiteSpace: 'nowrap' },
  notifDesc: { fontSize: '12px', color: '#4b5563', marginTop: '3px', lineHeight: 1.4, fontFamily: SANS },
  notifTime: { fontSize: '11px', color: '#9ca3af', marginTop: '5px', fontFamily: SANS },

  viewAllRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
    fontSize: '12.5px', fontWeight: 600, color: '#2c8047', fontFamily: SANS,
    padding: '10px 0 18px', cursor: 'default',
  },
  viewAllArrow: { fontSize: '14px', lineHeight: 1 },

  logsTable: { width: '100%', borderCollapse: 'collapse' },
  logsTh: {
    textAlign: 'left', padding: '8px 0', fontSize: '10px', fontWeight: 700, color: '#6b7280',
    borderBottom: '1px solid #E5E7EB', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: SANS,
  },
  logsTd: { padding: '9px 0', fontSize: '12.5px', color: '#111827', borderBottom: '1px solid #F2F3F5', fontFamily: SANS },

  footer: { padding: '14px 22px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #E5E7EB', flexShrink: 0 },
  closeFooterBtn: {
    padding: '9px 22px', borderRadius: '10px', border: '1px solid #dcdfd6', backgroundColor: '#fff',
    color: '#33413a', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
  },
}