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

const requestTypeColor = (type) => (type === 'Blood Test Request' ? '#2f6bb0' : '#2c8047')
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

  const statusColor = { Pending: '#b45309', Scheduled: '#2f6bb0', Completed: '#2c8047', Cancelled: '#8a968d' }

  return (
    <VetLayout>
      <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Vaccination &amp; Blood Test Requests</h1>
      <p style={styles.subtitle}>Scheduling &amp; records for both request types</p>

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
                        <span style={{ ...styles.badge, backgroundColor: statusColor[r.status] || '#8a968d' }}>
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
            <h3 style={confirmStyles.title}>Complete {requestTypeLabel(confirmComplete.service_type)}</h3>
            <p style={confirmStyles.message}>
              Mark the {requestTypeLabel(confirmComplete.service_type).toLowerCase()} at {confirmComplete.farm_name} as completed?
            </p>
            <div style={modalStyles.actions}>
              <button onClick={() => setConfirmComplete(null)} style={modalStyles.cancelBtn}>Cancel</button>
              <button onClick={handleCompleteAction} style={{ ...modalStyles.submitBtn, backgroundColor: '#2c8047' }}>
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
          <h3 style={modalStyles.title}>Accept &amp; Schedule {requestTypeLabel(request.service_type)}</h3>
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
  const statusColor = { Pending: '#b45309', Scheduled: '#2f6bb0', Completed: '#2c8047' }

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
          <div style={historyStyles.sectionLabel}>FARM &amp; OWNER</div>
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
              <p style={{ fontSize: '13px', color: '#9aa79d', margin: 0 }}>No records found.</p>
            </div>
          ) : (
            <div style={historyStyles.recordList}>
              {farmRecords.map(r => {
                const isExpanded = expandedId === r.id
                const color = statusColor[r.status] || '#8a968d'
                return (
                  <div
                    key={r.id}
                    style={{ ...historyStyles.recordCard, borderColor: isExpanded ? color : '#e7e8e0' }}
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

const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },
  title: { fontFamily: SANS, fontSize: '24px', fontWeight: 800, letterSpacing: '-0.015em', color: '#16311d', margin: 0 },
  titleMobile: { fontSize: '20px' },
  subtitle: { fontFamily: SANS, fontSize: '13.5px', color: '#6b7770', marginTop: '5px', marginBottom: '22px' },

  tabs: { display: 'flex', gap: '24px', marginBottom: '18px', borderBottom: '1px solid #e7e8e0' },
  tab: { fontFamily: SANS, padding: '10px 2px', fontSize: '14px', fontWeight: 600, color: '#8a968d', cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: '-1px' },
  tabActive: { color: '#16311d', borderBottomColor: '#2c8047' },

  filterRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' },
  filterRowMobile: { flexDirection: 'column', alignItems: 'stretch' },
  pillRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  filterPill: {
    fontFamily: SANS, padding: '7px 14px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600,
    color: '#6b7770', backgroundColor: '#fff', border: '1px solid #e7e8e0', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  filterPillActive: { backgroundColor: '#2c8047', color: '#fff', border: '1px solid #2c8047' },
  filterSelect: { fontFamily: SANS, padding: '8px 12px', borderRadius: '9px', border: '1px solid #e7e8e0', fontSize: '13px', color: '#33413a', backgroundColor: '#fff' },
  filterSelectMobile: { width: '100%', boxSizing: 'border-box' },
  customDates: { display: 'flex', alignItems: 'center', gap: '8px' },
  customDatesMobile: { width: '100%' },
  customDatesSep: { fontFamily: SANS, fontSize: '13px', color: '#9aa79d' },
  filterDateInput: { fontFamily: SANS, padding: '8px 12px', borderRadius: '9px', border: '1px solid #e7e8e0', fontSize: '13px', color: '#33413a' },

  tableCard: { fontFamily: SANS, backgroundColor: '#fff', borderRadius: '14px', border: '1px solid #e7e8e0', overflow: 'hidden' },
  scrollHint: { fontSize: '11px', color: '#9aa79d', margin: '12px 18px 0' },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableMobile: { minWidth: '760px' },
  th: {
    textAlign: 'left', padding: '12px 18px', fontSize: '11.5px', fontWeight: 700, color: '#6b7770',
    backgroundColor: '#f8f8f4', borderBottom: '1px solid #e7e8e0', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap',
  },
  td: { padding: '14px 18px', fontSize: '13px', color: '#33413a', borderBottom: '1px solid #f0efe8', verticalAlign: 'top' },
  farmName: { fontSize: '13.5px', fontWeight: 600, color: '#16311d' },
  farmMeta: { fontSize: '11.5px', color: '#8a968d', marginTop: '2px' },
  notes: { fontSize: '12px', color: '#6b7770', marginTop: '4px', maxWidth: '240px' },
  typeTag: {
    fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px',
    border: '1px solid', whiteSpace: 'nowrap',
  },
  badge: { padding: '3px 10px', borderRadius: '999px', color: '#fff', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap' },
  actionGroup: { display: 'flex', gap: '8px', whiteSpace: 'nowrap' },
  actionBtn: {
    padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
    cursor: 'pointer', border: '1px solid transparent', whiteSpace: 'nowrap',
  },
  acceptBtn: { color: '#2c8047', backgroundColor: '#eaf3ec', border: '1px solid #cfe6d5' },
  declineBtn: { color: '#b91c1c', backgroundColor: '#fbeceb', border: '1px solid #f3cfcb' },
  noteBtn: { color: '#2f6bb0', backgroundColor: '#e8eff8', border: '1px solid #cfe0f2' },
  completeBtn: { color: '#2c8047', backgroundColor: '#eaf3ec', border: '1px solid #cfe6d5' },
  viewBtn: { color: '#2f6bb0', backgroundColor: '#e8eff8', border: '1px solid #cfe0f2' },
  noAction: { color: '#c4ccc6' },
  empty: { padding: '40px', textAlign: 'center', color: '#9aa79d', fontSize: '14px' },
}

const paginationStyles = {
  wrap: {
    fontFamily: SANS, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 18px', borderTop: '1px solid #f0efe8', flexWrap: 'wrap', gap: '10px',
  },
  wrapMobile: { flexDirection: 'column', alignItems: 'stretch' },
  info: { fontSize: '12.5px', color: '#6b7770', whiteSpace: 'nowrap' },
  controls: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  controlsMobile: { justifyContent: 'space-between' },
  pageSizeSelect: { fontFamily: SANS, padding: '6px 10px', borderRadius: '8px', border: '1px solid #e7e8e0', fontSize: '12.5px', color: '#33413a', marginRight: '8px', backgroundColor: '#fff' },
  navBtn: {
    minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '8px',
    border: '1px solid #e7e8e0', backgroundColor: '#fff', color: '#33413a', fontSize: '13px', cursor: 'pointer',
  },
  navBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  pageBtn: {
    minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '8px',
    border: '1px solid #e7e8e0', backgroundColor: '#fff', color: '#33413a', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer',
  },
  pageBtnActive: { backgroundColor: '#2c8047', borderColor: '#2c8047', color: '#fff' },
  ellipsis: { padding: '0 4px', color: '#9aa79d', fontSize: '13px' },
}

const modalStyles = {
  overlay: { fontFamily: SANS, position: 'fixed', inset: 0, backgroundColor: 'rgba(15,38,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  modal: { fontFamily: SANS, backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '440px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto' },
  modalMobile: { width: '100%', maxWidth: '100%', borderRadius: '16px 16px 0 0', padding: '20px', margin: '0', position: 'fixed', bottom: 0, left: 0, maxHeight: '85vh' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  title: { fontSize: '17px', fontWeight: 800, color: '#16311d', margin: 0 },
  close: { fontSize: '22px', cursor: 'pointer', color: '#8a968d', lineHeight: 1 },
  dateLabel: { fontSize: '13px', color: '#6b7770', marginBottom: '16px' },
  label: { display: 'block', fontSize: '13px', fontWeight: 600, color: '#33413a', marginBottom: '6px', marginTop: '12px' },
  input: { width: '100%', padding: '10px 12px', borderRadius: '9px', border: '1px solid #e7e8e0', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'inherit', color: '#16311d' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  rowMobile: { gridTemplateColumns: '1fr' },
  errorBox: { backgroundColor: '#fbeceb', border: '1px solid #f3cfcb', color: '#b91c1c', padding: '10px 14px', borderRadius: '9px', fontSize: '13px', marginBottom: '14px' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' },
  actionsMobile: { flexDirection: 'column-reverse' },
  btnFull: { width: '100%', boxSizing: 'border-box' },
  cancelBtn: { fontFamily: SANS, padding: '10px 18px', borderRadius: '9px', border: '1px solid #e7e8e0', backgroundColor: '#fff', color: '#33413a', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
  submitBtn: { fontFamily: SANS, padding: '10px 18px', borderRadius: '9px', border: 'none', backgroundColor: '#2c8047', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer' },
}

const confirmStyles = {
  modal: { fontFamily: SANS, backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '400px', maxWidth: '90%' },
  title: { fontSize: '17px', fontWeight: 800, color: '#16311d', marginTop: 0, marginBottom: '10px' },
  message: { fontSize: '14px', color: '#6b7770', lineHeight: '1.5', marginBottom: '4px' },
}

const historyStyles = {
  modal: { fontFamily: SANS, backgroundColor: '#f4f3ee', borderRadius: '18px', width: '560px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto', position: 'relative', padding: 0 },
  close: {
    position: 'absolute', top: '16px', right: '16px', fontSize: '16px', color: '#fff', cursor: 'pointer',
    lineHeight: 1, zIndex: 2, width: '28px', height: '28px', borderRadius: '50%',
    backgroundColor: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  heroHeader: { display: 'flex', alignItems: 'center', gap: '14px', padding: '24px 24px 20px', background: 'linear-gradient(135deg,#234A35 0%,#16311d 100%)', borderRadius: '18px 18px 0 0' },
  avatar: {
    width: '52px', height: '52px', borderRadius: '50%', backgroundColor: '#16311d', color: '#f2c14e',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 800,
    flexShrink: 0, border: '2px solid #f2c14e',
  },
  farmName: { fontSize: '18px', fontWeight: 800, color: '#fff' },
  ownerName: { fontSize: '13px', color: '#c3d4c8', marginTop: '2px' },
  body: { padding: '20px 24px 24px' },
  sectionLabel: { fontSize: '11.5px', fontWeight: 700, color: '#16311d', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '18px 0 10px' },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  infoGridMobile: { gridTemplateColumns: '1fr' },
  infoCard: { backgroundColor: '#fff', borderRadius: '12px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #e7e8e0' },
  infoLabel: { fontSize: '10px', color: '#8a968d', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' },
  infoValue: { fontSize: '14px', color: '#16311d', fontWeight: 700, marginTop: '2px' },
  infoValueSub: { fontSize: '11px', color: '#6b7770', fontWeight: 500 },
  emptyBox: { backgroundColor: '#fff', borderRadius: '12px', padding: '24px', textAlign: 'center', border: '1px solid #e7e8e0' },
  recordList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  recordCard: { backgroundColor: '#fff', borderRadius: '12px', padding: '12px 14px', border: '1.5px solid #e7e8e0', cursor: 'pointer', transition: 'border-color 0.15s ease' },
  recordTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' },
  recordBadge: { padding: '3px 10px', borderRadius: '999px', color: '#fff', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' },
  recordTypeTag: { fontSize: '10.5px', fontWeight: 700 },
  recordDateRow: { display: 'flex', alignItems: 'center', gap: '6px' },
  recordDate: { fontSize: '12px', color: '#6b7770' },
  chevron: { fontSize: '12px', color: '#9aa79d', transition: 'transform 0.15s ease', display: 'inline-block' },
  recordNotes: { fontSize: '13px', color: '#33413a', marginTop: '8px', marginBottom: 0, lineHeight: '1.4' },
  expandedBox: { backgroundColor: '#f8f8f4', borderRadius: '10px', padding: '12px 14px', marginTop: '10px' },
  expandedRow: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' },
  expandedLabel: { color: '#8a968d', fontWeight: 600 },
  expandedValue: { color: '#16311d', fontWeight: 600 },
  expandedNotes: { fontSize: '13px', color: '#33413a', marginTop: '4px', marginBottom: 0, lineHeight: '1.4' },
  footer: { marginTop: '20px' },
  closeBtn: { fontFamily: SANS, width: '100%', padding: '10px 18px', borderRadius: '9px', border: '1px solid #e7e8e0', backgroundColor: '#fff', color: '#33413a', fontSize: '14px', fontWeight: 700, cursor: 'pointer' },
}