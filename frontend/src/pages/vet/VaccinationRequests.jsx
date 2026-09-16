import { useState, useMemo, useEffect, useRef } from 'react'
import api from '../../api/axios'
import VetLayout from '../../components/VetLayout'
import ServiceRequestDetailsModal from '../../components/ServiceRequestDetailsModal'
import SharedPagination from '../../components/Pagination'
import ClearDateButton, { DateRangeHeader } from '../../components/ClearDateButton'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'
import { formatDate, formatDateTime, isWithinLocalDateRange } from '../../utils/formatDate'
import { BADGE_SHAPE, serviceTypeBadgeStyle, serviceTypeLabel, requestStatusBadgeStyle } from '../../utils/serviceBadgeStyle'
import { isRequestOverdue, requestDisplayStatus } from '../../utils/serviceRequestStatus'

const BIRD_ESTIMATES = {
  'Small': 'Below 10,000 layers',
  'Medium': '10,000–50,000 layers',
  'Large': 'Above 50,000 layers',
}

const TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'Vaccine Request', label: 'Vaccination' },
  { value: 'Blood Test Request', label: 'Blood Test' },
]

const SORT_OPTIONS = [
  { value: 'oldest', label: 'Oldest Request First (Default)' },
  { value: 'newest', label: 'Newest Request First' },
]

const PAGE_SIZE_OPTIONS = [10, 25, 50]

export default function VaccinationRequests() {
  const [tab, setTab] = useState('pending')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sortMode, setSortMode] = useState('oldest')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [acceptTarget, setAcceptTarget] = useState(null)
  const [detailsTarget, setDetailsTarget] = useState(null)
  const [confirmDecline, setConfirmDecline] = useState(null)
  const [declineReason, setDeclineReason] = useState('')
  const [declineError, setDeclineError] = useState('')
  const [completeTarget, setCompleteTarget] = useState(null)
  const [confirmReopen, setConfirmReopen] = useState(null)
  const [reopenError, setReopenError] = useState('')
  const [rescheduleTarget, setRescheduleTarget] = useState(null)
  const isMobile = useIsMobile()

  const [filterOpen, setFilterOpen] = useState(false)
  const [draftType, setDraftType] = useState(typeFilter)
  const [draftSort, setDraftSort] = useState(sortMode)
  const [draftFromDate, setDraftFromDate] = useState(fromDate)
  const [draftToDate, setDraftToDate] = useState(toDate)
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
    setDraftFromDate(fromDate)
    setDraftToDate(toDate)
    setFilterOpen(true)
  }

  // One-click Clear Date: clears draft + applied dates immediately; type and
  // sort are untouched.
  const clearDates = () => {
    setDraftFromDate(''); setDraftToDate('')
    setFromDate(''); setToDate('')
  }
  const hasDate = !!(draftFromDate || draftToDate || fromDate || toDate)

  const applyFilter = () => {
    setTypeFilter(draftType)
    setSortMode(draftSort)
    setFromDate(draftFromDate)
    setToDate(draftToDate)
    setFilterOpen(false)
  }

  const resetFilter = () => {
    setDraftType('all')
    setDraftSort('oldest')
    setDraftFromDate('')
    setDraftToDate('')
  }

  const activeFilterCount =
    (typeFilter !== 'all' ? 1 : 0) +
    (sortMode !== 'oldest' ? 1 : 0) +
    ((fromDate || toDate) ? 1 : 0)

  const { data, loading, error, refetch } = useCachedFetch('/vet/vaccination-requests', {}, { pollMs: 45000 })
  const requestData = data || { scheduled: [], completed: [], history: [] }

  useEffect(() => {
    refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { setCurrentPage(1) }, [tab, search, typeFilter, sortMode, fromDate, toDate, pageSize])

  const handleDeclineAction = async () => {
    if (!declineReason.trim()) {
      setDeclineError('Please provide a reason for declining this request.')
      return
    }
    await api.patch(`/vet/vaccination-requests/${confirmDecline.id}/decline`, { decline_reason: declineReason.trim() })
    setDeclineReason('')
    setDeclineError('')
    setConfirmDecline(null)
    refetch()
  }

  const handleReopenAction = async () => {
    setReopenError('')
    try {
      await api.patch(`/vet/vaccination-requests/${confirmReopen.id}/reopen`)
      setConfirmReopen(null)
      refetch()
    } catch (err) {
      setReopenError(err.response?.data?.message || 'Failed to undo completion.')
    }
  }

  // From/To filter on the REQUEST date (created_at) — the date the farmer
  // submitted it — as inclusive local calendar dates. Same helper as Admin.
  const inDateRange = (r) => isWithinLocalDateRange(r.created_at, fromDate, toDate)

  const filteredCompleted = useMemo(
    () => (requestData.completed || []).filter(inDateRange),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [requestData.completed, fromDate, toDate]
  )

  // Completed + declined (Cancelled), so declined requests stay visible.
  const filteredHistory = useMemo(
    () => (requestData.history || []).filter(inDateRange),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [requestData.history, fromDate, toDate]
  )

  // The backend still groups Pending + Scheduled together under one
  // "scheduled" key — split them client-side so the page can show a
  // dedicated Pending tab without touching the API response shape.
  // All three active lists honour the same From/To (request date) filter.
  const pendingList = useMemo(
    () => (requestData.scheduled || []).filter(r => r.status === 'Pending' && inDateRange(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [requestData.scheduled, fromDate, toDate]
  )
  // Overdue is the past-due slice of Scheduled (derived, not stored).
  const scheduledList = useMemo(
    () => (requestData.scheduled || []).filter(r => r.status === 'Scheduled' && !isRequestOverdue(r) && inDateRange(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [requestData.scheduled, fromDate, toDate]
  )
  const overdueList = useMemo(
    () => (requestData.scheduled || []).filter(r => isRequestOverdue(r) && inDateRange(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [requestData.scheduled, fromDate, toDate]
  )

  const baseList = tab === 'pending' ? pendingList
    : tab === 'scheduled' ? scheduledList
    : tab === 'overdue' ? overdueList
    : tab === 'history' ? filteredHistory
    : filteredCompleted

  // First Come, First Served — sorts by submission date (created_at) if
  // available, falling back to id order if the backend hasn't been
  // updated to include it yet.
  const sortedList = useMemo(() => {
    const list = [...baseList]
    list.sort((a, b) => {
      const aKey = a.created_at ? new Date(a.created_at).getTime() : a.id
      const bKey = b.created_at ? new Date(b.created_at).getTime() : b.id
      return sortMode === 'newest' ? bKey - aKey : aKey - bKey
    })
    return list
  }, [baseList, sortMode])

  const typeFilteredList = useMemo(() => {
    if (typeFilter === 'all') return sortedList
    return sortedList.filter(r => r.service_type === typeFilter)
  }, [sortedList, typeFilter])

  const searchedList = useMemo(() => {
    if (!search) return typeFilteredList
    const q = search.toLowerCase()
    return typeFilteredList.filter(r => {
      const haystack = [
        r.request_number, r.farm_name, r.owner_name, r.barangay,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [typeFilteredList, search])

  const totalItems = searchedList.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [totalPages, currentPage])

  const list = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return searchedList.slice(start, start + pageSize)
  }, [searchedList, currentPage, pageSize])

  const rangeStartIdx = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const rangeEndIdx = Math.min(currentPage * pageSize, totalItems)

  return (
    <VetLayout>
      <style>{`
        .agb-input:focus {
          outline: none;
          border-color: #2c8047;
          box-shadow: 0 0 0 3px rgba(44,128,71,0.14);
        }
      `}</style>
      <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Service Requests</h1>
      <p style={styles.subtitle}>Manage vaccination and blood test requests</p>

      <div className="no-print" style={{ ...styles.toolbar, ...(isMobile ? styles.toolbarMobile : {}) }}>
        <div style={styles.tabs}>
          <div
            style={{ ...styles.tab, ...(tab === 'pending' ? styles.tabActive : {}) }}
            onClick={() => setTab('pending')}
          >
            Pending
          </div>
          <div
            style={{ ...styles.tab, ...(tab === 'scheduled' ? styles.tabActive : {}) }}
            onClick={() => setTab('scheduled')}
          >
            Scheduled
          </div>
          <div
            style={{ ...styles.tab, ...(tab === 'overdue' ? styles.tabActive : {}) }}
            onClick={() => setTab('overdue')}
          >
            Overdue
          </div>
          <div
            style={{ ...styles.tab, ...(tab === 'completed' ? styles.tabActive : {}) }}
            onClick={() => setTab('completed')}
          >
            Completed
          </div>
          <div
            style={{ ...styles.tab, ...(tab === 'history' ? styles.tabActive : {}) }}
            onClick={() => setTab('history')}
          >
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

                <DateRangeHeader>

                  <label style={styles.filterLabel}>From Date</label>

                  <ClearDateButton visible={hasDate} onClick={clearDates} />

                </DateRangeHeader>
                <input
                  type="date"
                  value={draftFromDate}
                  onChange={e => setDraftFromDate(e.target.value)}
                  style={styles.filterSelect}
                />

                <label style={styles.filterLabel}>To Date</label>
                <input
                  type="date"
                  value={draftToDate}
                  onChange={e => setDraftToDate(e.target.value)}
                  style={styles.filterSelect}
                />

                <label style={styles.filterLabel}>Type</label>
                <select value={draftType} onChange={e => setDraftType(e.target.value)} style={styles.filterSelect}>
                  {TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
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
                        <span style={{ ...BADGE_SHAPE, ...serviceTypeBadgeStyle(r.service_type) }}>
                          {serviceTypeLabel(r.service_type)}
                        </span>
                      </td>
                      <td style={styles.td}>{r.owner_name}</td>
                      <td style={styles.td}>{r.created_at ? formatDate(r.created_at) : '—'}</td>
                      <td style={styles.td}>
                        <span style={{ ...BADGE_SHAPE, ...requestStatusBadgeStyle(requestDisplayStatus(r)) }}>
                          {requestDisplayStatus(r)}
                        </span>
                        {r.status === 'Cancelled' && r.decline_reason && (
                          <div style={styles.farmMeta} title={r.decline_reason}>Reason: {r.decline_reason}</div>
                        )}
                      </td>
                      <td style={styles.td}>
                        <div style={styles.actionGroup}>
                          {r.status === 'Pending' && (
                            <>
                              <span style={{ ...styles.actionBtn, ...styles.primaryAcceptBtn }} onClick={() => setAcceptTarget(r)}>
                                Accept
                              </span>
                              <span style={{ ...styles.actionBtn, ...styles.primaryDeclineBtn }} onClick={() => setConfirmDecline(r)}>
                                Decline
                              </span>
                            </>
                          )}
                          {r.status === 'Scheduled' && (
                            <>
                              <span style={{ ...styles.actionBtn, ...styles.primaryCompleteBtn }} onClick={() => setCompleteTarget(r)}>
                                Complete
                              </span>
                              <span style={{ ...styles.actionBtn, ...styles.rescheduleBtn }} onClick={() => setRescheduleTarget(r)}>
                                Reschedule
                              </span>
                            </>
                          )}
                          {(r.status === 'Completed' || r.status === 'Cancelled') && (
                            <span style={{ ...styles.actionBtn, ...styles.viewBtn }} onClick={() => setDetailsTarget(r)}>
                              View
                            </span>
                          )}
                          {r.status === 'Completed' && (
                            <span style={{ ...styles.actionBtn, ...styles.rescheduleBtn }} onClick={() => { setConfirmReopen(r); setReopenError('') }}>
                              Undo Completion
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
              {search || typeFilter !== 'all' || (fromDate || toDate)
                ? 'No requests match your search or filter.'
                : 'No requests here yet.'}
            </div>
          )}

          {totalItems > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              rangeStart={rangeStartIdx}
              rangeEnd={rangeEndIdx}
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

      {detailsTarget && (
        <ServiceRequestDetailsModal
          request={detailsTarget}
          isMobile={isMobile}
          onClose={() => setDetailsTarget(null)}
        />
      )}

      {confirmDecline && (
        <div style={modalStyles.overlay} onClick={() => { setConfirmDecline(null); setDeclineReason(''); setDeclineError('') }}>
          <div style={{ ...confirmStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
            <div style={modalStyles.header}>
              <h3 style={modalStyles.title}>Decline Request</h3>
              <span style={modalStyles.close} onClick={() => { setConfirmDecline(null); setDeclineReason(''); setDeclineError('') }}>×</span>
            </div>

            <div style={{ ...confirmStyles.summaryBox, backgroundColor: serviceTypeBadgeStyle(confirmDecline.service_type).backgroundColor }}>
              <span style={detailStyles.sectionLabel}>Request</span>
              <div style={confirmStyles.summaryType}>{serviceTypeLabel(confirmDecline.service_type)}</div>
              <div style={confirmStyles.summaryFarm}>{confirmDecline.farm_name}</div>
            </div>

            <label style={modalStyles.label}>Reason for declining *</label>
            <textarea
              className="agb-input"
              value={declineReason}
              onChange={e => { setDeclineReason(e.target.value); setDeclineError('') }}
              style={{ ...modalStyles.input, minHeight: '70px', resize: 'vertical' }}
              placeholder="Explain why this request is being declined"
            />
            {declineError && <p style={{ color: '#b91c1c', fontSize: '12.5px', marginTop: '4px' }}>{declineError}</p>}

            <div style={modalStyles.actions}>
              <button onClick={() => { setConfirmDecline(null); setDeclineReason(''); setDeclineError('') }} style={modalStyles.cancelBtn}>Cancel</button>
              <button onClick={handleDeclineAction} style={{ ...modalStyles.submitBtn, backgroundColor: '#b91c1c' }}>
                Decline Request
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmReopen && (
        <div style={modalStyles.overlay} onClick={() => setConfirmReopen(null)}>
          <div style={{ ...confirmStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
            <div style={modalStyles.header}>
              <h3 style={modalStyles.title}>Undo Completion</h3>
              <span style={modalStyles.close} onClick={() => setConfirmReopen(null)}>×</span>
            </div>

            <div style={{ ...confirmStyles.summaryBox, backgroundColor: serviceTypeBadgeStyle(confirmReopen.service_type).backgroundColor }}>
              <span style={detailStyles.sectionLabel}>Request</span>
              <div style={confirmStyles.summaryType}>{serviceTypeLabel(confirmReopen.service_type)}</div>
              <div style={confirmStyles.summaryFarm}>{confirmReopen.farm_name}</div>
            </div>

            <p style={detailStyles.text}>
              Are you sure you want to undo the completion of the {serviceTypeLabel(confirmReopen.service_type)} request at {confirmReopen.farm_name}?
              This request will be returned to its active scheduled state.
            </p>
            {reopenError && <p style={{ color: '#b91c1c', fontSize: '12.5px', marginTop: '4px' }}>{reopenError}</p>}

            <div style={modalStyles.actions}>
              <button onClick={() => setConfirmReopen(null)} style={modalStyles.cancelBtn}>Cancel</button>
              <button onClick={handleReopenAction} style={modalStyles.submitBtn}>
                Undo Completion
              </button>
            </div>
          </div>
        </div>
      )}

      {completeTarget && (
        <CompleteModal
          request={completeTarget}
          isMobile={isMobile}
          onClose={() => setCompleteTarget(null)}
          onSuccess={() => { setCompleteTarget(null); refetch() }}
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
    </VetLayout>
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

// Reached only via "View" on a Completed request — a read-only look back at
// what happened, including the vet's own Visit Notes & Insights recorded at
// completion time and, if the visit was ever rescheduled along the way, that
// history too.
function CompleteModal({ request, onClose, onSuccess, isMobile }) {
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!notes.trim()) {
      setError('Please document what happened during the farm visit.')
      return
    }

    setLoading(true)
    try {
      await api.patch(`/vet/vaccination-requests/${request.id}/complete`, { completion_notes: notes })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to complete request.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={{ ...modalStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>Complete Service Request</h3>
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
            <span style={detailStyles.value}>{request.owner_name}</span>
          </div>
          <div style={detailStyles.row}>
            <span style={detailStyles.label}>Service Type</span>
            <span style={{ ...BADGE_SHAPE, ...serviceTypeBadgeStyle(request.service_type) }}>{serviceTypeLabel(request.service_type)}</span>
          </div>
          <div style={detailStyles.row}>
            <span style={detailStyles.label}>Scheduled Date</span>
            <span style={detailStyles.value}>{request.scheduled_at ? formatDateTime(request.scheduled_at) : '—'}</span>
          </div>
          <div style={{ ...detailStyles.row, borderBottom: 'none' }}>
            <span style={detailStyles.label}>Request Status</span>
            <span style={{ ...BADGE_SHAPE, ...requestStatusBadgeStyle(request.status) }}>{request.status}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div style={modalStyles.errorBox}>{error}</div>}

          <label style={modalStyles.label}>Visit Notes &amp; Insights</label>
          <p style={modalStyles.helperText}>
            Record your observations, actions taken, findings, and recommendations during the farm visit.
          </p>
          <textarea
            className="agb-input"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ ...modalStyles.input, minHeight: '130px', resize: 'vertical' }}
            placeholder="Example: Inspected the poultry area and checked the reported concern. Recommended improving ventilation and cleaning the affected area..."
          />

          <div style={{ ...modalStyles.actions, ...(isMobile ? modalStyles.actionsMobile : {}) }}>
            <button type="button" onClick={onClose} style={{ ...modalStyles.cancelBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={{ ...modalStyles.submitBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>
              {loading ? 'Saving...' : 'Complete Request'}
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
      await api.patch(`/vet/vaccination-requests/${request.id}/reschedule`, {
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
            <span style={detailStyles.value}>{request.owner_name}</span>
          </div>
          <div style={detailStyles.row}>
            <span style={detailStyles.label}>Service Type</span>
            <span style={{ ...BADGE_SHAPE, ...serviceTypeBadgeStyle(request.service_type) }}>{serviceTypeLabel(request.service_type)}</span>
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
            className="agb-input"
            value={reason}
            onChange={e => setReason(e.target.value)}
            style={{ ...modalStyles.input, minHeight: '80px', resize: 'vertical' }}
            placeholder="Example: Farm visit was not completed due to schedule conflict / farm was unavailable during the scheduled visit."
          />

          <label style={modalStyles.label}>New Schedule</label>
          <div style={{ ...modalStyles.row, ...(isMobile ? modalStyles.rowMobile : {}) }}>
            <div>
              <label style={modalStyles.label}>New Date *</label>
              <input className="agb-input" type="date" value={date} onChange={e => setDate(e.target.value)} style={modalStyles.input} />
            </div>
            <div>
              <label style={modalStyles.label}>New Time *</label>
              <input className="agb-input" type="time" value={time} onChange={e => setTime(e.target.value)} style={modalStyles.input} />
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

function AcceptModal({ request, onClose, onSuccess, isMobile }) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
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
      await api.patch(`/vet/vaccination-requests/${request.id}/accept`, {
        scheduled_at: `${date} ${time}:00`,
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
          <h3 style={modalStyles.title}>Accept &amp; Schedule {serviceTypeLabel(request.service_type)}</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>
        <p style={modalStyles.dateLabel}>Farm: {request.farm_name} · Owner: {request.owner_name}</p>

        <form onSubmit={handleSubmit}>
          {error && <div style={modalStyles.errorBox}>{error}</div>}

          <div style={{ ...modalStyles.row, ...(isMobile ? modalStyles.rowMobile : {}) }}>
            <div>
              <label style={modalStyles.label}>Date *</label>
              <input className="agb-input" type="date" value={date} onChange={e => setDate(e.target.value)} style={modalStyles.input} />
            </div>
            <div>
              <label style={modalStyles.label}>Time *</label>
              <input className="agb-input" type="time" value={time} onChange={e => setTime(e.target.value)} style={modalStyles.input} />
            </div>
          </div>

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

  tableCard: { backgroundColor: '#fff', borderRadius: '14px', border: '1px solid #e7e8e0', overflow: 'hidden' },
  scrollHint: { fontSize: '11px', color: '#9aa79d', margin: '12px 20px 0' },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableMobile: { minWidth: '960px' },
  th: {
    textAlign: 'left', padding: '13px 20px', fontSize: '13px', fontWeight: 600, color: '#8a968d',
    borderBottom: '1px solid #eceee7', whiteSpace: 'nowrap',
    backgroundColor: '#fafbf8',
  },
  td: { padding: '13px 20px', fontSize: '12px', color: '#4b5a50', borderBottom: '1px solid #f2f3ed', verticalAlign: 'top' },
  reqNumberCell: { fontSize: '12px', color: '#4b5a50' },
  farmName: { fontSize: '14px', fontWeight: 700, color: '#16311d' },
  farmMeta: { fontSize: '12px', color: '#8a968d', marginTop: '2px' },
  actionGroup: { display: 'flex', gap: '6px', alignItems: 'center', whiteSpace: 'nowrap', justifyContent: 'flex-end' },
  // Same button treatment used everywhere else in AgriBantay (Farms,
  // Manage Accounts): one neutral bordered/white pill shape, differentiated
  // only by text color — never a filled background.
  actionBtn: {
    padding: '6px 13px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600,
    cursor: 'pointer', border: '1px solid #e3e6dd', backgroundColor: '#fff', whiteSpace: 'nowrap',
  },
  primaryAcceptBtn: { color: '#2c8047' },
  primaryDeclineBtn: { color: '#b91c1c' },
  primaryCompleteBtn: { color: '#2c8047' },
  rescheduleBtn: { color: '#2f6bb0' },
  viewBtn: { color: '#4b5a50' },
  noAction: { color: '#c4cabd' },
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
  modal: { backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '420px', maxWidth: '90%' },
  summaryBox: { borderRadius: '10px', padding: '12px 14px', margin: '14px 0' },
  summaryType: { fontSize: '15px', fontWeight: 800, color: '#16311d', marginTop: '2px' },
  summaryFarm: { fontSize: '12.5px', color: '#6b7770', marginTop: '2px' },
}

const detailStyles = {
  row: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f2f3ed' },
  label: { fontSize: '13px', color: '#6b7770', fontWeight: 500 },
  value: { fontSize: '13px', color: '#16311d', fontWeight: 600, textAlign: 'right' },
  block: { marginTop: '14px' },
  sectionLabel: { display: 'block', fontSize: '11px', fontWeight: 700, color: '#8a968d', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' },
  text: { fontSize: '13px', color: '#4b5a50', lineHeight: '1.5', marginTop: '4px' },
}

