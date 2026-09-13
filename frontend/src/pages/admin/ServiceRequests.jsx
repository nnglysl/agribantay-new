import { useState, useMemo, useEffect, useRef } from 'react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import ServiceRequestDetailsModal from '../../components/ServiceRequestDetailsModal'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'
import { getUser } from '../../utils/auth'
import { formatDate, formatDateTime } from '../../utils/formatDate'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

const ADMIN_TYPES = ['Odor Control Request', 'Fly Control Request']
const SUPER_ADMIN_ONLY_TYPES = ['Vaccine Request', 'Blood Test Request']

const BIRD_ESTIMATES = {
  Small: 'Below 10,000 layers',
  Medium: '10,000–50,000 layers',
  Large: 'Above 50,000 layers',
}

const SORT_OPTIONS = [
  { value: 'oldest', label: 'Oldest Request First (Default)' },
  { value: 'newest', label: 'Newest Request First' },
]

// Same established colors as FarmMap's REQUEST_COLORS / Vet's own
// requestTypeColor — reused, not invented, so the two Service Requests
// pages read as one system.
function requestTypeColor(type) {
  if (type === 'Fly Control Request') return '#d9880f'
  if (type === 'Blood Test Request') return '#2f6bb0'
  return '#2c8047'
}
function requestTypeLabel(type) {
  return type ? type.replace(' Request', '') : '—'
}

export default function ServiceRequests() {
  const user = getUser()
  const isSuperAdmin = user?.role === 'super_admin'

  const [tab, setTab] = useState('pending')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sortMode, setSortMode] = useState('oldest')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [acceptTarget, setAcceptTarget] = useState(null)
  const [confirmDecline, setConfirmDecline] = useState(null)
  const [confirmComplete, setConfirmComplete] = useState(null)
  const [completeNotes, setCompleteNotes] = useState('')
  const [viewRequest, setViewRequest] = useState(null)
  const [rescheduleTarget, setRescheduleTarget] = useState(null)
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

  const { data, loading, error, refetch } = useCachedFetch('/admin/service-requests', params)
  const allRequests = data || []

  const availableTypes = isSuperAdmin ? [...ADMIN_TYPES, ...SUPER_ADMIN_ONLY_TYPES] : ADMIN_TYPES

  const filtered = allRequests.filter(r => {
    if (tab === 'pending' && r.status !== 'Pending') return false
    if (tab === 'scheduled' && r.status !== 'Scheduled') return false
    if (tab === 'completed' && r.status !== 'Completed') return false

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

  const statusColor = { Pending: '#b45309', Scheduled: '#2f6bb0', Completed: '#256b3d', Cancelled: '#6b7280' }

  const handleDeclineAction = async () => {
    await api.patch(`/admin/service-requests/${confirmDecline.id}/decline`)
    setConfirmDecline(null)
    refetch()
  }

  const handleCompleteAction = async () => {
    await api.patch(`/admin/service-requests/${confirmComplete.id}/complete`, {
      notes: completeNotes || undefined,
    })
    setConfirmComplete(null)
    setCompleteNotes('')
    refetch()
  }

  return (
    <AdminLayout>
      <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Service Requests</h1>
      <p style={styles.subtitle}>
        {isSuperAdmin
          ? 'Monitor all service requests across registered farms.'
          : 'Manage odor and fly control requests'}
      </p>

      <div style={{ ...styles.toolbar, ...(isMobile ? styles.toolbarMobile : {}) }}>
        <div style={styles.tabs}>
          <div style={{ ...styles.tab, ...(tab === 'pending' ? styles.tabActive : {}) }} onClick={() => setTab('pending')}>
            Pending
          </div>
          <div style={{ ...styles.tab, ...(tab === 'scheduled' ? styles.tabActive : {}) }} onClick={() => setTab('scheduled')}>
            Scheduled
          </div>
          <div style={{ ...styles.tab, ...(tab === 'completed' ? styles.tabActive : {}) }} onClick={() => setTab('completed')}>
            Completed
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
                  {availableTypes.map(t => (
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
                  <th style={styles.th}>Farm</th>
                  <th style={styles.th}>Type</th>
                  <th style={styles.th}>Farm Owner</th>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Status</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map(r => {
                  const c = statusColor[r.status] || '#6b7280'
                  const typeColor = requestTypeColor(r.service_type)
                  return (
                    <tr key={r.id}>
                      <td style={styles.td}>
                        <span style={styles.reqNumberCell}>{r.request_number || '—'}</span>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.farmName}>{r.farm_name}</div>
                        <div style={styles.farmMeta}>
                          {r.barangay} · {BIRD_ESTIMATES[r.farm_size] || 'Size unknown'}
                        </div>
                      </td>
                      <td style={styles.td}>
                        <span style={{ ...styles.typeText, color: typeColor }}>
                          {requestTypeLabel(r.service_type)}
                        </span>
                      </td>
                      <td style={styles.td}>{r.farm_owner_name || r.requested_by}</td>
                      <td style={styles.td}>
                        {r.completed_at
                          ? formatDate(r.completed_at)
                          : r.scheduled_at
                          ? formatDate(r.scheduled_at)
                          : '—'}
                      </td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, color: c, backgroundColor: badgeBg(r.status) }}>
                          {r.status}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.actionGroup}>
                          {!isSuperAdmin && r.status === 'Pending' && (
                            <>
                              <span style={{ ...styles.actionBtn, ...styles.acceptBtn }} onClick={() => setAcceptTarget(r)}>
                                Accept
                              </span>
                              <span style={{ ...styles.actionBtn, ...styles.declineBtn }} onClick={() => setConfirmDecline(r)}>
                                Decline
                              </span>
                            </>
                          )}
                          {!isSuperAdmin && r.status === 'Scheduled' && (
                            <>
                              <span
                                style={{ ...styles.actionBtn, ...styles.completeBtn }}
                                onClick={() => { setConfirmComplete(r); setCompleteNotes('') }}
                              >
                                Mark Completed
                              </span>
                              <span style={{ ...styles.actionBtn, ...styles.rescheduleBtn }} onClick={() => setRescheduleTarget(r)}>
                                Reschedule
                              </span>
                            </>
                          )}
                          {(isSuperAdmin || r.status === 'Completed') && (
                            <span style={{ ...styles.actionBtn, ...styles.viewBtn }} onClick={() => setViewRequest(r)}>
                              View
                            </span>
                          )}
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

      {acceptTarget && (
        <AcceptModal
          request={acceptTarget}
          isMobile={isMobile}
          onClose={() => setAcceptTarget(null)}
          onSuccess={() => { setAcceptTarget(null); refetch() }}
        />
      )}

      {confirmDecline && (
        <div style={modalStyles.overlay} onClick={() => setConfirmDecline(null)}>
          <div style={{ ...confirmStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
            <h3 style={confirmStyles.title}>Decline Request</h3>
            <p style={confirmStyles.message}>
              Decline the {confirmDecline.service_type} request from {confirmDecline.farm_name}?
            </p>
            <div style={modalStyles.actions}>
              <button onClick={() => setConfirmDecline(null)} style={modalStyles.cancelBtn}>Keep it</button>
              <button onClick={handleDeclineAction} style={{ ...modalStyles.submitBtn, backgroundColor: '#b91c1c' }}>
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmComplete && (
        <div style={modalStyles.overlay} onClick={() => setConfirmComplete(null)}>
          <div style={{ ...confirmStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
            <h3 style={confirmStyles.title}>Complete Request</h3>
            <p style={confirmStyles.message}>
              Mark the {confirmComplete.service_type} at {confirmComplete.farm_name} as completed?
            </p>

            <label style={modalStyles.label}>Notes (optional)</label>
            <textarea
              value={completeNotes}
              onChange={e => setCompleteNotes(e.target.value)}
              style={{ ...modalStyles.input, minHeight: '70px', resize: 'vertical' }}
              placeholder="Any details about how the request was completed"
            />

            <div style={modalStyles.actions}>
              <button onClick={() => setConfirmComplete(null)} style={modalStyles.cancelBtn}>Cancel</button>
              <button onClick={handleCompleteAction} style={{ ...modalStyles.submitBtn, backgroundColor: '#2c8047' }}>
                Mark Completed
              </button>
            </div>
          </div>
        </div>
      )}
      {viewRequest && (
        <ServiceRequestDetailsModal
          request={{ ...viewRequest, owner_name: viewRequest.farm_owner_name || viewRequest.requested_by }}
          isMobile={isMobile}
          onClose={() => setViewRequest(null)}
        />
      )}

      {rescheduleTarget && (
        <RescheduleModal
          request={rescheduleTarget}
          isMobile={isMobile}
          onClose={() => setRescheduleTarget(null)}
          onSuccess={() => { setRescheduleTarget(null); refetch() }}
        />
      )}
    </AdminLayout>
  )
}

function badgeBg(status) {
  if (status === 'Pending') return '#fbf1e2'
  if (status === 'Scheduled') return '#e8eff8'
  if (status === 'Cancelled') return '#eef1ea'
  return '#eaf3ec'
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

function AcceptModal({ request, onClose, onSuccess, isMobile }) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!date) {
      setError('Please select a date.')
      return
    }

    setLoading(true)
    try {
      await api.patch(`/admin/service-requests/${request.id}/accept`, {
        scheduled_at: `${date} ${time}:00`,
        notes,
      })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to accept request.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={{ ...modalStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>Accept & Schedule</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>
        <p style={modalStyles.dateLabel}>
          {request.service_type} · {request.farm_name} · Requested by {request.requested_by}
        </p>

        <form onSubmit={handleSubmit}>
          {error && <div style={modalStyles.errorBox}>{error}</div>}

          <div style={{ ...modalStyles.row, ...(isMobile ? modalStyles.rowMobile : {}) }}>
            <div>
              <label style={modalStyles.label}>Date *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={modalStyles.input} />
            </div>
            <div>
              <label style={modalStyles.label}>Time *</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} style={modalStyles.input} />
            </div>
          </div>

          <label style={modalStyles.label}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ ...modalStyles.input, minHeight: '70px', resize: 'vertical' }}
            placeholder="Assigned personnel, equipment needed, or special instructions"
          />

          <div style={{ ...modalStyles.actions, ...(isMobile ? modalStyles.actionsMobile : {}) }}>
            <button type="button" onClick={onClose} style={{ ...modalStyles.cancelBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={{ ...modalStyles.submitBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>
              {loading ? 'Scheduling...' : 'Confirm Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RescheduleModal({ request, onClose, onSuccess, isMobile }) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!date) {
      setError('Please select a new date.')
      return
    }
    if (!reason.trim()) {
      setError('Please explain why the visit was not completed.')
      return
    }

    setLoading(true)
    try {
      await api.patch(`/admin/service-requests/${request.id}/reschedule`, {
        scheduled_at: `${date} ${time}:00`,
        reason,
      })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reschedule request.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={{ ...modalStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>Reschedule Service Request</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>

        <div style={detailStyles.block}>
          <span style={detailStyles.sectionLabel}>Request Information</span>
          <div style={detailStyles.row}>
            <span style={detailStyles.label}>Farm Name</span>
            <span style={detailStyles.value}>{request.farm_name}</span>
          </div>
          <div style={detailStyles.row}>
            <span style={detailStyles.label}>Farm Owner</span>
            <span style={detailStyles.value}>{request.farm_owner_name || request.requested_by}</span>
          </div>
          <div style={detailStyles.row}>
            <span style={detailStyles.label}>Service Type</span>
            <span style={detailStyles.value}>{requestTypeLabel(request.service_type)}</span>
          </div>
          <div style={{ ...detailStyles.row, borderBottom: 'none' }}>
            <span style={detailStyles.label}>Current Scheduled Date</span>
            <span style={detailStyles.value}>{request.scheduled_at ? formatDateTime(request.scheduled_at) : '—'}</span>
          </div>
        </div>

        {request.previous_scheduled_at && (
          <p style={modalStyles.contextNote}>
            Already rescheduled once, from {formatDateTime(request.previous_scheduled_at)}
            {request.reschedule_reason ? ` — ${request.reschedule_reason}` : ''}
          </p>
        )}

        <form onSubmit={handleSubmit}>
          {error && <div style={modalStyles.errorBox}>{error}</div>}

          <label style={modalStyles.label}>Reason for Rescheduling</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            style={{ ...modalStyles.input, minHeight: '80px', resize: 'vertical' }}
            placeholder="Example: Farm visit was not completed due to schedule conflict / farm was unavailable during the scheduled visit."
          />

          <label style={modalStyles.label}>New Schedule</label>
          <div style={{ ...modalStyles.row, ...(isMobile ? modalStyles.rowMobile : {}) }}>
            <div>
              <label style={modalStyles.label}>New Date *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={modalStyles.input} />
            </div>
            <div>
              <label style={modalStyles.label}>New Time *</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} style={modalStyles.input} />
            </div>
          </div>

          <div style={{ ...modalStyles.actions, ...(isMobile ? modalStyles.actionsMobile : {}) }}>
            <button type="button" onClick={onClose} style={{ ...modalStyles.cancelBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={{ ...modalStyles.submitBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>
              {loading ? 'Saving...' : 'Reschedule Request'}
            </button>
          </div>
        </form>
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
  tableMobile: { minWidth: '960px' },
  th: {
    textAlign: 'left', padding: '13px 20px', fontSize: '11px', fontWeight: 700, color: '#8a968d',
    borderBottom: '1px solid #eceee7', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
    backgroundColor: '#fafbf8',
  },
  td: { padding: '13px 20px', fontSize: '13px', color: '#4b5a50', borderBottom: '1px solid #f2f3ed', verticalAlign: 'top' },
  reqNumberCell: { fontSize: '12.5px', color: '#4b5a50', fontFamily: 'monospace' },
  farmName: { fontSize: '14px', fontWeight: 700, color: '#16311d' },
  farmMeta: { fontSize: '12px', color: '#8a968d', marginTop: '2px' },
  // Plain colored text, no pill/background/border/icon.
  typeText: { fontSize: '13px', fontWeight: 600 },
  // Status keeps its colored pill background — just no dot.
  badge: {
    display: 'inline-flex', alignItems: 'center', padding: '4px 11px',
    borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap',
  },
  actionGroup: { display: 'flex', gap: '6px', whiteSpace: 'nowrap', justifyContent: 'flex-end' },
  actionBtn: {
    padding: '6px 13px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600,
    cursor: 'pointer', border: '1px solid #e3e6dd', backgroundColor: '#fff', whiteSpace: 'nowrap',
  },
  acceptBtn: { color: '#2c8047' },
  declineBtn: { color: '#b91c1c' },
  completeBtn: { color: '#2c8047' },
  rescheduleBtn: { color: '#2f6bb0' },
  viewBtn: { color: '#4b5a50' },
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

const modalStyles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(15,38,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  modal: { backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '440px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto' },
  modalMobile: { width: '100%', maxWidth: '100%', borderRadius: '16px 16px 0 0', padding: '20px', margin: '0', position: 'fixed', bottom: 0, left: 0, maxHeight: '85vh' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  title: { fontSize: '17px', fontWeight: 800, color: '#16311d', margin: 0 },
  close: { fontSize: '22px', cursor: 'pointer', color: '#8a968d' },
  dateLabel: { fontSize: '13px', color: '#6b7770', marginBottom: '16px' },
  label: { display: 'block', fontSize: '13px', fontWeight: 600, color: '#33413a', marginBottom: '6px', marginTop: '12px' },
  helperText: { fontSize: '12px', color: '#8a968d', marginTop: '0', marginBottom: '8px', lineHeight: '1.4' },
  contextNote: { fontSize: '12px', color: '#6b7770', backgroundColor: '#fafbf8', border: '1px solid #eceee7', borderRadius: '9px', padding: '9px 12px', marginTop: '12px', lineHeight: '1.4' },
  input: { width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #dcdfd6', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'inherit' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  rowMobile: { gridTemplateColumns: '1fr' },
  errorBox: { backgroundColor: '#fbeaea', border: '1px solid #f0c9c9', color: '#b91c1c', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', marginBottom: '14px' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' },
  actionsMobile: { flexDirection: 'column-reverse' },
  btnFull: { width: '100%', boxSizing: 'border-box' },
  cancelBtn: { padding: '10px 18px', borderRadius: '10px', border: '1px solid #dcdfd6', backgroundColor: '#fff', fontSize: '14px', fontWeight: 600, color: '#33413a', cursor: 'pointer' },
  submitBtn: { padding: '10px 18px', borderRadius: '10px', border: 'none', backgroundColor: '#2c8047', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer' },
}

const confirmStyles = {
  modal: { backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '400px', maxWidth: '90%' },
  title: { fontSize: '17px', fontWeight: 800, color: '#16311d', marginTop: 0, marginBottom: '10px' },
  message: { fontSize: '14px', color: '#6b7770', lineHeight: '1.5', marginBottom: '4px' },
}

const detailStyles = {
  row: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f2f3ed' },
  label: { fontSize: '13px', color: '#6b7770', fontWeight: 500 },
  value: { fontSize: '13px', color: '#16311d', fontWeight: 600, textAlign: 'right' },
  block: { marginTop: '14px' },
  sectionLabel: { display: 'block', fontSize: '11px', fontWeight: 700, color: '#8a968d', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' },
  text: { fontSize: '13px', color: '#4b5a50', lineHeight: '1.5', marginTop: '4px' },
}
