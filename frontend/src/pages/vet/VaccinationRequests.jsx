import { useState, useMemo, useEffect } from 'react'
import api from '../../api/axios'
import VetLayout from '../../components/VetLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

const BIRD_ESTIMATES = {
  'Small': 'Below 10,000 layers',
  'Medium': '10,000–50,000 layers',
  'Large': 'Above 50,000 layers',
}

const RANGE_OPTIONS = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'year', label: 'This Year' },
  { value: 'custom', label: 'Custom range' },
]

const TYPE_FILTERS = [
  { value: 'all', label: 'All types' },
  { value: 'Vaccine Request', label: 'Vaccine' },
  { value: 'Blood Test Request', label: 'Blood Test' },
]

const PAGE_SIZE_OPTIONS = [10, 25, 50]

const requestTypeColor = (type) => (type === 'Blood Test Request' ? '#3b82f6' : '#2E7D32')
const requestTypeLabel = (type) => (type === 'Blood Test Request' ? 'Blood Test' : 'Vaccine')

function getRangeBounds(rangeKey, customFrom, customTo) {
  const now = new Date()
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0)
  const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)

  switch (rangeKey) {
    case 'today':
      return [startOfDay(now), endOfDay(now)]
    case 'week': {
      const day = now.getDay()
      const start = new Date(now)
      start.setDate(now.getDate() - day)
      return [startOfDay(start), endOfDay(now)]
    }
    case 'month':
      return [new Date(now.getFullYear(), now.getMonth(), 1), endOfDay(now)]
    case 'quarter': {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3
      return [new Date(now.getFullYear(), quarterStartMonth, 1), endOfDay(now)]
    }
    case 'year':
      return [new Date(now.getFullYear(), 0, 1), endOfDay(now)]
    case 'custom':
      if (!customFrom || !customTo) return [null, null]
      return [startOfDay(new Date(customFrom)), endOfDay(new Date(customTo))]
    case 'all':
    default:
      return [null, null]
  }
}

export default function VaccinationRequests() {
  const [tab, setTab] = useState('scheduled')
  const [typeFilter, setTypeFilter] = useState('all')
  const [range, setRange] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [acceptTarget, setAcceptTarget] = useState(null)
  const [noteTarget, setNoteTarget] = useState(null)
  const [viewTarget, setViewTarget] = useState(null)
  const [confirmDecline, setConfirmDecline] = useState(null)
  const [confirmComplete, setConfirmComplete] = useState(null)
  const isMobile = useIsMobile()

  const { data, loading, error, refetch } = useCachedFetch('/vet/vaccination-requests')
  const requestData = data || { scheduled: [], completed: [] }

  useEffect(() => {
    refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { setCurrentPage(1) }, [tab, typeFilter, range, customFrom, customTo, pageSize])

  const handleDeclineAction = async () => {
    await api.patch(`/vet/vaccination-requests/${confirmDecline.id}/decline`)
    setConfirmDecline(null)
    refetch()
  }

  const handleCompleteAction = async () => {
    await api.patch(`/vet/vaccination-requests/${confirmComplete.id}/complete`)
    setConfirmComplete(null)
    refetch()
  }

  const [rangeStart, rangeEnd] = useMemo(
    () => getRangeBounds(range, customFrom, customTo),
    [range, customFrom, customTo]
  )

  const filteredCompleted = useMemo(() => {
    const completedList = requestData.completed || []
    if (!rangeStart || !rangeEnd) return completedList
    return completedList.filter(r => {
      if (!r.completed_at) return false
      const d = new Date(r.completed_at)
      return d >= rangeStart && d <= rangeEnd
    })
  }, [requestData.completed, rangeStart, rangeEnd])

  const baseList = tab === 'scheduled' ? requestData.scheduled : filteredCompleted

  const sortedList = useMemo(
    () => [...baseList].sort((a, b) => a.id - b.id),
    [baseList]
  )

  const typeFilteredList = useMemo(() => {
    if (typeFilter === 'all') return sortedList
    return sortedList.filter(r => r.service_type === typeFilter)
  }, [sortedList, typeFilter])

  const totalItems = typeFilteredList.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [totalPages, currentPage])

  const list = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return typeFilteredList.slice(start, start + pageSize)
  }, [typeFilteredList, currentPage, pageSize])

  const rangeStartIdx = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const rangeEndIdx = Math.min(currentPage * pageSize, totalItems)

  const statusColor = { Pending: '#f59e0b', Scheduled: '#3b82f6', Completed: '#2E7D32', Cancelled: '#6b7280' }

  return (
    <VetLayout>
      <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Vaccination & Blood Test Requests</h1>
      <p style={styles.subtitle}>Scheduling & records for both request types</p>

      <div style={styles.tabs}>
        <div
          style={{ ...styles.tab, ...(tab === 'scheduled' ? styles.tabActive : {}) }}
          onClick={() => setTab('scheduled')}
        >
          Scheduled
        </div>
        <div
          style={{ ...styles.tab, ...(tab === 'completed' ? styles.tabActive : {}) }}
          onClick={() => setTab('completed')}
        >
          Completed
        </div>
      </div>

      <div style={{ ...styles.filterRow, ...(isMobile ? styles.filterRowMobile : {}) }}>
        <div style={styles.pillRow}>
          {TYPE_FILTERS.map(f => (
            <span
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              style={{ ...styles.filterPill, ...(typeFilter === f.value ? styles.filterPillActive : {}) }}
            >
              {f.label}
            </span>
          ))}
        </div>

        {tab === 'completed' && (
          <select
            value={range}
            onChange={e => setRange(e.target.value)}
            style={{ ...styles.filterSelect, ...(isMobile ? styles.filterSelectMobile : {}) }}
          >
            {RANGE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
      </div>

      {tab === 'completed' && range === 'custom' && (
        <div style={{ ...styles.customDates, ...(isMobile ? styles.customDatesMobile : {}), marginBottom: '16px' }}>
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={styles.filterDateInput} />
          <span style={styles.customDatesSep}>to</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={styles.filterDateInput} />
        </div>
      )}

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {!loading && !error && (
        <div style={styles.tableCard}>
          {isMobile && list.length > 0 && (
            <p style={styles.scrollHint}>Swipe left/right to see all columns →</p>
          )}

          <div style={isMobile ? styles.tableScroll : undefined}>
            <table style={{ ...styles.table, ...(isMobile ? styles.tableMobile : {}) }}>
              <thead>
                <tr>
                  <th style={styles.th}>Farm</th>
                  <th style={styles.th}>Type</th>
                  <th style={styles.th}>Owner</th>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map(r => {
                  const typeColor = requestTypeColor(r.service_type)
                  return (
                    <tr key={r.id}>
                      <td style={styles.td}>
                        <div style={styles.farmName}>{r.farm_name}</div>
                        <div style={styles.farmMeta}>
                          {r.barangay} · {BIRD_ESTIMATES[r.farm_size] || 'Size unknown'}
                        </div>
                        {r.notes && <div style={styles.notes}>{r.notes}</div>}
                      </td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.typeTag,
                          color: typeColor,
                          backgroundColor: `${typeColor}1A`,
                          borderColor: `${typeColor}55`,
                        }}>
                          {requestTypeLabel(r.service_type)}
                        </span>
                      </td>
                      <td style={styles.td}>{r.owner_name}</td>
                      <td style={styles.td}>
                        {r.completed_at
                          ? new Date(r.completed_at).toLocaleDateString()
                          : r.scheduled_at
                          ? new Date(r.scheduled_at).toLocaleDateString()
                          : '—'}
                      </td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, backgroundColor: statusColor[r.status] || '#6b7280' }}>
                          {r.status}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.actionGroup}>
                          {r.status === 'Completed' && (
                            <span
                              style={{ ...styles.actionBtn, ...styles.viewBtn }}
                              onClick={() => setViewTarget(r)}
                            >
                              View
                            </span>
                          )}
                          {r.status === 'Pending' && (
                            <>
                              <span
                                style={{ ...styles.actionBtn, ...styles.acceptBtn }}
                                onClick={() => setAcceptTarget(r)}
                              >
                                Accept
                              </span>
                              <span
                                style={{ ...styles.actionBtn, ...styles.declineBtn }}
                                onClick={() => setConfirmDecline(r)}
                              >
                                Decline
                              </span>
                            </>
                          )}
                          {r.status === 'Scheduled' && (
                            <>
                              <span
                                style={{ ...styles.actionBtn, ...styles.noteBtn }}
                                onClick={() => setNoteTarget(r)}
                              >
                                Add Note
                              </span>
                              <span
                                style={{ ...styles.actionBtn, ...styles.completeBtn }}
                                onClick={() => setConfirmComplete(r)}
                              >
                                Complete
                              </span>
                            </>
                          )}
                          {r.status === 'Cancelled' && <span style={styles.noAction}>—</span>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {list.length === 0 && <div style={styles.empty}>No requests here yet.</div>}

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

      {noteTarget && (
        <NoteModal
          request={noteTarget}
          isMobile={isMobile}
          onClose={() => setNoteTarget(null)}
          onSuccess={() => { setNoteTarget(null); refetch() }}
        />
      )}

      {viewTarget && (
        <FarmHistoryModal
          farm={viewTarget}
          allRequests={[...(requestData.scheduled || []), ...(requestData.completed || [])]}
          isMobile={isMobile}
          onClose={() => setViewTarget(null)}
        />
      )}

      {confirmDecline && (
        <div style={modalStyles.overlay} onClick={() => setConfirmDecline(null)}>
          <div style={{ ...confirmStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
            <h3 style={confirmStyles.title}>Decline Request</h3>
            <p style={confirmStyles.message}>
              Decline the {requestTypeLabel(confirmDecline.service_type).toLowerCase()} request from {confirmDecline.farm_name}?
            </p>
            <div style={modalStyles.actions}>
              <button onClick={() => setConfirmDecline(null)} style={modalStyles.cancelBtn}>Keep it</button>
              <button onClick={handleDeclineAction} style={{ ...modalStyles.submitBtn, backgroundColor: '#dc2626' }}>
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmComplete && (
        <div style={modalStyles.overlay} onClick={() => setConfirmComplete(null)}>
          <div style={{ ...confirmStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
            <h3 style={confirmStyles.title}>Complete {requestTypeLabel(confirmComplete.service_type)}</h3>
            <p style={confirmStyles.message}>
              Mark the {requestTypeLabel(confirmComplete.service_type).toLowerCase()} at {confirmComplete.farm_name} as completed?
            </p>
            <div style={modalStyles.actions}>
              <button onClick={() => setConfirmComplete(null)} style={modalStyles.cancelBtn}>Cancel</button>
              <button onClick={handleCompleteAction} style={{ ...modalStyles.submitBtn, backgroundColor: '#2E7D32' }}>
                Mark Completed
              </button>
            </div>
          </div>
        </div>
      )}
    </VetLayout>
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
            style={{ ...paginationStyles.pageBtn, ...(p === currentPage ? paginationStyles.pageBtnActive : {}) }}
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
      await api.patch(`/vet/vaccination-requests/${request.id}/accept`, {
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
          <h3 style={modalStyles.title}>Accept & Schedule {requestTypeLabel(request.service_type)}</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>
        <p style={modalStyles.dateLabel}>Farm: {request.farm_name} · Owner: {request.owner_name}</p>

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
            placeholder="Vaccine type/dosage, blood test panel, or special instructions"
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

function NoteModal({ request, onClose, onSuccess, isMobile }) {
  const [notes, setNotes] = useState(request.notes || '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!notes.trim()) {
      setError('Please enter a note.')
      return
    }

    setLoading(true)
    try {
      await api.post(`/vet/vaccination-requests/${request.id}/note`, { notes })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save note.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={{ ...modalStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>Add Note</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>
        <p style={modalStyles.dateLabel}>Note about this farm visit</p>

        <form onSubmit={handleSubmit}>
          {error && <div style={modalStyles.errorBox}>{error}</div>}

          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ ...modalStyles.input, minHeight: '100px', resize: 'vertical' }}
            placeholder="e.g. Newcastle disease vaccine administered. All birds healthy. No adverse reactions observed."
          />

          <div style={{ ...modalStyles.actions, ...(isMobile ? modalStyles.actionsMobile : {}) }}>
            <button type="button" onClick={onClose} style={{ ...modalStyles.cancelBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={{ ...modalStyles.submitBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>
              {loading ? 'Saving...' : 'Save Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function FarmHistoryModal({ farm, allRequests, onClose, isMobile }) {
  const [expandedId, setExpandedId] = useState(null)
  const statusColor = { Pending: '#f59e0b', Scheduled: '#3b82f6', Completed: '#2E7D32' }

  const farmRecords = allRequests
    .filter(r => (farm.farm_id ? r.farm_id === farm.farm_id : r.farm_name === farm.farm_name && r.owner_name === farm.owner_name))
    .sort((a, b) => {
      const dateA = new Date(a.completed_at || a.scheduled_at || 0)
      const dateB = new Date(b.completed_at || b.scheduled_at || 0)
      return dateB - dateA
    })

  const completedCount = farmRecords.filter(r => r.status === 'Completed').length
  const initial = farm.farm_name?.[0]?.toUpperCase() ?? '?'

  const toggleExpand = (id) => setExpandedId(prev => (prev === id ? null : id))

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={{ ...historyStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
        <span style={historyStyles.close} onClick={onClose}>×</span>

        <div style={historyStyles.heroHeader}>
          <div style={historyStyles.avatar}>{initial}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={historyStyles.farmName}>{farm.farm_name}</div>
            <div style={historyStyles.ownerName}>{farm.owner_name}</div>
          </div>
        </div>

        <div style={historyStyles.body}>
          <div style={historyStyles.sectionLabel}>FARM & OWNER</div>
          <div style={{ ...historyStyles.infoGrid, ...(isMobile ? historyStyles.infoGridMobile : {}) }}>
            <div style={historyStyles.infoCard}>
              <div>
                <div style={historyStyles.infoLabel}>Barangay</div>
                <div style={historyStyles.infoValue}>{farm.barangay}</div>
              </div>
            </div>
            <div style={historyStyles.infoCard}>
              <div>
                <div style={historyStyles.infoLabel}>Farm Size</div>
                <div style={historyStyles.infoValue}>
                  {farm.farm_size} <span style={historyStyles.infoValueSub}>({BIRD_ESTIMATES[farm.farm_size] || '—'})</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ ...historyStyles.infoGrid, ...(isMobile ? historyStyles.infoGridMobile : {}), marginTop: '10px' }}>
            <div style={historyStyles.infoCard}>
              <div>
                <div style={historyStyles.infoLabel}>Total Records</div>
                <div style={historyStyles.infoValue}>{farmRecords.length}</div>
              </div>
            </div>
            <div style={historyStyles.infoCard}>
              <div>
                <div style={historyStyles.infoLabel}>Completed</div>
                <div style={historyStyles.infoValue}>{completedCount}</div>
              </div>
            </div>
          </div>

          <div style={historyStyles.sectionLabel}>REQUEST HISTORY</div>

          {farmRecords.length === 0 ? (
            <div style={historyStyles.emptyBox}>
              <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>No records found.</p>
            </div>
          ) : (
            <div style={historyStyles.recordList}>
              {farmRecords.map(r => {
                const isExpanded = expandedId === r.id
                const color = statusColor[r.status] || '#9ca3af'
                return (
                  <div
                    key={r.id}
                    style={{ ...historyStyles.recordCard, borderColor: isExpanded ? color : '#e5e7eb' }}
                    onClick={() => toggleExpand(r.id)}
                  >
                    <div style={historyStyles.recordTop}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ ...historyStyles.recordBadge, backgroundColor: color }}>{r.status}</span>
                        <span style={{ ...historyStyles.recordTypeTag, color: requestTypeColor(r.service_type) }}>
                          {requestTypeLabel(r.service_type)}
                        </span>
                      </div>
                      <span style={historyStyles.recordDateRow}>
                        <span style={historyStyles.recordDate}>
                          {r.completed_at
                            ? new Date(r.completed_at).toLocaleDateString()
                            : r.scheduled_at
                            ? new Date(r.scheduled_at).toLocaleDateString()
                            : '—'}
                        </span>
                        <span style={{ ...historyStyles.chevron, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
                      </span>
                    </div>

                    {!isExpanded && r.notes && <p style={historyStyles.recordNotes}>{r.notes}</p>}

                    {isExpanded && (
                      <div style={historyStyles.expandedBox}>
                        {r.scheduled_at && (
                          <div style={historyStyles.expandedRow}>
                            <span style={historyStyles.expandedLabel}>Scheduled</span>
                            <span style={historyStyles.expandedValue}>{new Date(r.scheduled_at).toLocaleString()}</span>
                          </div>
                        )}
                        {r.completed_at && (
                          <div style={historyStyles.expandedRow}>
                            <span style={historyStyles.expandedLabel}>Completed</span>
                            <span style={historyStyles.expandedValue}>{new Date(r.completed_at).toLocaleString()}</span>
                          </div>
                        )}
                        <div style={historyStyles.expandedRow}>
                          <span style={historyStyles.expandedLabel}>Status</span>
                          <span style={historyStyles.expandedValue}>{r.status}</span>
                        </div>
                        {r.notes ? (
                          <div style={{ marginTop: '8px' }}>
                            <span style={historyStyles.expandedLabel}>Notes</span>
                            <p style={historyStyles.expandedNotes}>{r.notes}</p>
                          </div>
                        ) : (
                          <p style={historyStyles.expandedNotes}>No notes recorded.</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div style={historyStyles.footer}>
            <button onClick={onClose} style={historyStyles.closeBtn}>Close</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  titleMobile: { fontSize: '18px' },
  subtitle: { fontSize: '13px', color: '#6b7280', marginTop: '4px', marginBottom: '20px' },
  tabs: { display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid #e5e7eb' },
  tab: { padding: '10px 16px', fontSize: '14px', color: '#6b7280', cursor: 'pointer', borderBottom: '2px solid transparent' },
  tabActive: { color: '#2E7D32', fontWeight: '600', borderBottom: '2px solid #2E7D32' },

  filterRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' },
  filterRowMobile: { flexDirection: 'column', alignItems: 'stretch' },
  pillRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  filterPill: {
    padding: '6px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: '500',
    color: '#374151', backgroundColor: 'white', border: '1px solid #d1d5db', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  filterPillActive: { backgroundColor: '#2E7D32', color: 'white', border: '1px solid #2E7D32' },
  filterSelect: { padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px', color: '#374151', backgroundColor: 'white' },
  filterSelectMobile: { width: '100%', boxSizing: 'border-box' },
  customDates: { display: 'flex', alignItems: 'center', gap: '8px' },
  customDatesMobile: { width: '100%' },
  customDatesSep: { fontSize: '13px', color: '#9ca3af' },
  filterDateInput: { padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px', color: '#374151' },

  tableCard: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' },
  scrollHint: { fontSize: '11px', color: '#9ca3af', margin: '12px 16px 0' },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableMobile: { minWidth: '760px' },
  th: {
    textAlign: 'left', padding: '14px 16px', fontSize: '12px', color: '#6b7280',
    borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase', whiteSpace: 'nowrap',
  },
  td: { padding: '14px 16px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' },
  farmName: { fontSize: '13.5px', fontWeight: '600', color: '#111827' },
  farmMeta: { fontSize: '11.5px', color: '#9ca3af', marginTop: '2px' },
  notes: { fontSize: '12px', color: '#6b7280', marginTop: '4px', maxWidth: '240px' },
  typeTag: {
    fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '999px',
    border: '1px solid', whiteSpace: 'nowrap',
  },
  badge: { padding: '3px 10px', borderRadius: '999px', color: 'white', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap' },
  actionGroup: { display: 'flex', gap: '8px', whiteSpace: 'nowrap' },
  actionBtn: {
    padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
    cursor: 'pointer', border: '1px solid transparent', whiteSpace: 'nowrap',
  },
  acceptBtn: { color: '#2E7D32', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' },
  declineBtn: { color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fecaca' },
  noteBtn: { color: '#3b82f6', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' },
  completeBtn: { color: '#2E7D32', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' },
  viewBtn: { color: '#3b82f6', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' },
  noAction: { color: '#d1d5db' },
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
  pageSizeSelect: { padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '12.5px', color: '#374151', marginRight: '8px' },
  navBtn: {
    minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '6px',
    border: '1px solid #d1d5db', backgroundColor: 'white', color: '#374151', fontSize: '13px', cursor: 'pointer',
  },
  navBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  pageBtn: {
    minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '6px',
    border: '1px solid #d1d5db', backgroundColor: 'white', color: '#374151', fontSize: '12.5px', fontWeight: '600', cursor: 'pointer',
  },
  pageBtnActive: { backgroundColor: '#2E7D32', borderColor: '#2E7D32', color: 'white' },
  ellipsis: { padding: '0 4px', color: '#9ca3af', fontSize: '13px' },
}

const modalStyles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  modal: { backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '440px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto' },
  modalMobile: { width: '100%', maxWidth: '100%', borderRadius: '16px 16px 0 0', padding: '20px', margin: '0', position: 'fixed', bottom: 0, left: 0, maxHeight: '85vh' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  title: { fontSize: '17px', fontWeight: '700', color: '#111827', margin: 0 },
  close: { fontSize: '22px', cursor: 'pointer', color: '#6b7280' },
  dateLabel: { fontSize: '13px', color: '#6b7280', marginBottom: '16px' },
  label: { display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px', marginTop: '12px' },
  input: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'inherit' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  rowMobile: { gridTemplateColumns: '1fr' },
  errorBox: { backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' },
  actionsMobile: { flexDirection: 'column-reverse' },
  btnFull: { width: '100%', boxSizing: 'border-box' },
  cancelBtn: { padding: '10px 18px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: 'white', fontSize: '14px', cursor: 'pointer' },
  submitBtn: { padding: '10px 18px', borderRadius: '8px', border: 'none', backgroundColor: '#2E7D32', color: 'white', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
}

const confirmStyles = {
  modal: { backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '400px', maxWidth: '90%' },
  title: { fontSize: '17px', fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: '10px' },
  message: { fontSize: '14px', color: '#6b7280', lineHeight: '1.5', marginBottom: '4px' },
}

const historyStyles = {
  modal: { backgroundColor: '#F0EBDD', borderRadius: '20px', width: '560px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto', position: 'relative', padding: 0 },
  close: {
    position: 'absolute', top: '16px', right: '16px', fontSize: '16px', color: 'white', cursor: 'pointer',
    lineHeight: 1, zIndex: 2, width: '28px', height: '28px', borderRadius: '50%',
    backgroundColor: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  heroHeader: { display: 'flex', alignItems: 'center', gap: '14px', padding: '24px 24px 20px', backgroundColor: '#1B4332', borderRadius: '20px 20px 0 0' },
  avatar: {
    width: '52px', height: '52px', borderRadius: '50%', backgroundColor: '#1B4332', color: '#F2B84B',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: '700',
    flexShrink: 0, border: '2px solid #F2B84B',
  },
  farmName: { fontSize: '18px', fontWeight: '700', color: 'white' },
  ownerName: { fontSize: '13px', color: '#C9DDCE', marginTop: '2px' },
  body: { padding: '20px 24px 24px' },
  sectionLabel: { fontSize: '12px', fontWeight: '700', color: '#1B4332', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '18px 0 10px' },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  infoGridMobile: { gridTemplateColumns: '1fr' },
  infoCard: { backgroundColor: 'white', borderRadius: '12px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' },
  infoLabel: { fontSize: '10px', color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.3px' },
  infoValue: { fontSize: '14px', color: '#111827', fontWeight: '700', marginTop: '2px' },
  infoValueSub: { fontSize: '11px', color: '#6b7280', fontWeight: '500' },
  emptyBox: { backgroundColor: 'white', borderRadius: '12px', padding: '24px', textAlign: 'center' },
  recordList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  recordCard: { backgroundColor: 'white', borderRadius: '12px', padding: '12px 14px', border: '1.5px solid #e5e7eb', cursor: 'pointer', transition: 'border-color 0.15s ease' },
  recordTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' },
  recordBadge: { padding: '3px 10px', borderRadius: '999px', color: 'white', fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap' },
  recordTypeTag: { fontSize: '10.5px', fontWeight: '700' },
  recordDateRow: { display: 'flex', alignItems: 'center', gap: '6px' },
  recordDate: { fontSize: '12px', color: '#6b7280' },
  chevron: { fontSize: '12px', color: '#9ca3af', transition: 'transform 0.15s ease', display: 'inline-block' },
  recordNotes: { fontSize: '13px', color: '#374151', marginTop: '8px', marginBottom: 0, lineHeight: '1.4' },
  expandedBox: { backgroundColor: '#f9fafb', borderRadius: '10px', padding: '12px 14px', marginTop: '10px' },
  expandedRow: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' },
  expandedLabel: { color: '#9ca3af', fontWeight: '600' },
  expandedValue: { color: '#111827', fontWeight: '600' },
  expandedNotes: { fontSize: '13px', color: '#374151', marginTop: '4px', marginBottom: 0, lineHeight: '1.4' },
  footer: { marginTop: '20px' },
  closeBtn: { width: '100%', padding: '10px 18px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: 'white', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
}