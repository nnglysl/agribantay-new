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

const TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'Vaccine Request', label: 'Vaccine' },
  { value: 'Blood Test Request', label: 'Blood Test' },
]

const SORT_OPTIONS = [
  { value: 'oldest', label: 'Oldest Request First (Default)' },
  { value: 'newest', label: 'Newest Request First' },
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
  const [sortMode, setSortMode] = useState('oldest')
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

  useEffect(() => { setCurrentPage(1) }, [tab, typeFilter, sortMode, range, customFrom, customTo, pageSize])

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

  const statusColor = { Pending: '#b45309', Scheduled: '#2f6bb0', Completed: '#2c8047', Cancelled: '#6b7280' }

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

      <div style={{ ...styles.filters, ...(isMobile ? styles.filtersMobile : {}) }}>
        <div style={styles.filterGroup}>
          <span style={styles.filterGroupLabel}>Type</span>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={styles.sortSelect}>
            {TYPE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div style={styles.filterGroup}>
          <span style={styles.filterGroupLabel}>Sort By</span>
          <select value={sortMode} onChange={e => setSortMode(e.target.value)} style={styles.sortSelect}>
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {tab === 'completed' && (
          <div style={styles.filterGroup}>
            <span style={styles.filterGroupLabel}>Range</span>
            <select value={range} onChange={e => setRange(e.target.value)} style={styles.sortSelect}>
              {RANGE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {tab === 'completed' && range === 'custom' && (
        <div style={{ ...styles.customDates, ...(isMobile ? styles.customDatesMobile : {}) }}>
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
                        {r.notes && <div style={styles.notes}>{r.notes}</div>}
                      </td>
                      <td style={styles.td}>
                        <span style={{ ...styles.typeTag, color: typeColor, backgroundColor: `${typeColor}18` }}>
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
                        <span style={{ ...styles.badge, color: c, backgroundColor: badgeBg(r.status) }}>
                          <span style={{ ...styles.badgeDot, backgroundColor: c }} />
                          {r.status}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.actionGroup}>
                          {r.status === 'Completed' && (
                            <span style={{ ...styles.actionBtn, ...styles.viewBtn }} onClick={() => setViewTarget(r)}>
                              View
                            </span>
                          )}
                          {r.status === 'Pending' && (
                            <>
                              <span style={{ ...styles.actionBtn, ...styles.acceptBtn }} onClick={() => setAcceptTarget(r)}>
                                Accept
                              </span>
                              <span style={{ ...styles.actionBtn, ...styles.declineBtn }} onClick={() => setConfirmDecline(r)}>
                                Decline
                              </span>
                            </>
                          )}
                          {r.status === 'Scheduled' && (
                            <>
                              <span style={{ ...styles.actionBtn, ...styles.noteBtn }} onClick={() => setNoteTarget(r)}>
                                Add Note
                              </span>
                              <span style={{ ...styles.actionBtn, ...styles.completeBtn }} onClick={() => setConfirmComplete(r)}>
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
const HISTORY_BATCH = 4

function FarmHistoryModal({ farm, allRequests, onClose, isMobile }) {
  const [expandedId, setExpandedId] = useState(null)
  const [visibleCount, setVisibleCount] = useState(HISTORY_BATCH)
  const statusColor = { Pending: '#b45309', Scheduled: '#2f6bb0', Completed: '#2c8047', Cancelled: '#6b7280' }

  const farmRecords = allRequests
    .filter(r => (farm.farm_id ? r.farm_id === farm.farm_id : r.farm_name === farm.farm_name && r.owner_name === farm.owner_name))
    .sort((a, b) => {
      const dateA = new Date(a.completed_at || a.scheduled_at || 0)
      const dateB = new Date(b.completed_at || b.scheduled_at || 0)
      return dateB - dateA
    })

  const completedCount = farmRecords.filter(r => r.status === 'Completed').length
  const initials = (farm.farm_name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')

  const visibleRecords = farmRecords.slice(0, visibleCount)
  const remaining = Math.max(0, farmRecords.length - visibleRecords.length)

  const toggleExpand = (id) => setExpandedId(prev => (prev === id ? null : id))

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={{ ...historyStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>

        {/* HEADER */}
        <div style={historyStyles.accentBar} />
        <div style={historyStyles.header}>
          <div style={historyStyles.avatar}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={historyStyles.farmName}>{farm.farm_name}</div>
            <div style={historyStyles.ownerName}>{farm.owner_name}</div>
          </div>
          <button style={historyStyles.closeX} onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* BODY */}
        <div style={historyStyles.body}>

          {/* FARM & OWNER */}
          <div style={historyStyles.sectionHead}>
            <span style={historyStyles.sectionIcon}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>
            </span>
            <span style={historyStyles.sectionTitle}>Farm &amp; Owner</span>
          </div>
          <div style={{ ...historyStyles.infoGrid, ...(isMobile ? historyStyles.infoGridMobile : {}) }}>
            <div>
              <div style={historyStyles.infoLabel}>Barangay</div>
              <div style={historyStyles.infoValue}>{farm.barangay || '—'}</div>
            </div>
            <div>
              <div style={historyStyles.infoLabel}>Farm Size</div>
              <div style={historyStyles.infoValue}>
                {farm.farm_size || '—'} <span style={historyStyles.infoValueSub}>({BIRD_ESTIMATES[farm.farm_size] || '—'})</span>
              </div>
            </div>
            <div>
              <div style={historyStyles.infoLabel}>Total Records</div>
              <div style={historyStyles.infoValue}>{farmRecords.length}</div>
            </div>
            <div>
              <div style={historyStyles.infoLabel}>Completed</div>
              <div style={historyStyles.infoValue}>{completedCount}</div>
            </div>
          </div>

          {/* REQUEST HISTORY */}
          <div style={historyStyles.sectionHead}>
            <span style={historyStyles.sectionIcon}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            </span>
            <span style={historyStyles.sectionTitle}>Request History</span>
          </div>

          {farmRecords.length === 0 ? (
            <div style={historyStyles.emptyBox}>
              <p style={{ fontSize: '13px', color: '#9aa79d', margin: 0 }}>No records found.</p>
            </div>
          ) : (
            <>
              <div style={historyStyles.recordList}>
                {visibleRecords.map(r => {
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

              {remaining > 0 && (
                <button
                  style={historyStyles.seeMore}
                  onClick={() => setVisibleCount(c => c + HISTORY_BATCH)}
                >
                  See more ({remaining} remaining)
                </button>
              )}
            </>
          )}
        </div>

        {/* FOOTER */}
        <div style={historyStyles.footer}>
          <button onClick={onClose} style={historyStyles.closeBtn}>Close</button>
        </div>
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

  tabs: { display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid #e7e8e0', overflowX: 'auto' },
  tab: { padding: '10px 16px', fontSize: '14px', color: '#6b7770', cursor: 'pointer', borderBottom: '2px solid transparent', whiteSpace: 'nowrap' },
  tabActive: { color: '#2c8047', fontWeight: 700, borderBottom: '2px solid #2c8047' },

  filters: { display: 'flex', flexWrap: 'wrap', gap: '20px', marginBottom: '18px', alignItems: 'flex-end' },
  filtersMobile: { flexDirection: 'column', gap: '14px', alignItems: 'stretch' },
  filterGroup: { display: 'flex', flexDirection: 'column', gap: '7px' },
  filterGroupLabel: { fontSize: '11px', fontWeight: 700, color: '#8a968d', textTransform: 'uppercase', letterSpacing: '0.04em' },
  sortSelect: {
    padding: '9px 12px', borderRadius: '10px', border: '1px solid #dcdfd6', fontSize: '13px',
    color: '#33413a', backgroundColor: '#fff', cursor: 'pointer', fontFamily: SANS, minWidth: '200px',
  },

  customDates: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' },
  customDatesMobile: { width: '100%' },
  customDatesSep: { fontSize: '13px', color: '#9aa79d' },
  filterDateInput: { padding: '9px 12px', borderRadius: '10px', border: '1px solid #dcdfd6', fontSize: '13px', color: '#33413a', fontFamily: SANS },

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
  notes: { fontSize: '12px', color: '#8a968d', marginTop: '4px', maxWidth: '240px' },
  typeTag: {
    fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', whiteSpace: 'nowrap',
  },
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 11px',
    borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap',
  },
  badgeDot: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },
  actionGroup: { display: 'flex', gap: '6px', whiteSpace: 'nowrap', justifyContent: 'flex-end' },
  actionBtn: {
    padding: '6px 13px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600,
    cursor: 'pointer', border: '1px solid #e3e6dd', backgroundColor: '#fff', whiteSpace: 'nowrap',
  },
  acceptBtn: { color: '#2c8047' },
  declineBtn: { color: '#b91c1c' },
  noteBtn: { color: '#2f6bb0' },
  completeBtn: { color: '#2c8047' },
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

const historyStyles = {
  modal: {
    fontFamily: SANS, backgroundColor: '#fff', borderRadius: '16px', width: '560px', maxWidth: '90%',
    maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative',
    border: '1px solid #e7e8e0', boxShadow: '0 24px 70px rgba(15,38,22,0.28)',
  },

  accentBar: { height: '6px', background: '#1f5a34', flexShrink: 0 },

  header: { display: 'flex', alignItems: 'center', gap: '14px', padding: '20px 24px', borderBottom: '1px solid #f0efe8', flexShrink: 0 },
  avatar: {
    width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#eaf3ec', border: '1px solid #d6e5da',
    color: '#2c8047', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
    fontWeight: 800, letterSpacing: '0.02em', flexShrink: 0,
  },
  farmName: { fontSize: '19px', fontWeight: 800, color: '#16311d', letterSpacing: '-0.01em', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  ownerName: { fontSize: '13px', color: '#7b8a80', marginTop: '3px' },
  closeX: {
    width: '30px', height: '30px', borderRadius: '8px', border: '1px solid #eceee7', background: '#fff',
    color: '#8a968d', fontSize: '17px', lineHeight: 1, cursor: 'pointer', flexShrink: 0,
  },

  body: { padding: '6px 24px 12px', overflowY: 'auto', flex: 1, minHeight: 0 },

  sectionHead: { display: 'flex', alignItems: 'center', gap: '10px', padding: '20px 0 4px' },
  sectionIcon: { width: '26px', height: '26px', borderRadius: '8px', background: '#2c8047', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sectionTitle: { fontSize: '14px', fontWeight: 800, color: '#16311d' },

  infoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '16px 28px', padding: '14px 0 20px', borderBottom: '1px solid #f0efe8' },
  infoGridMobile: { gridTemplateColumns: '1fr' },
  infoLabel: { fontSize: '10.5px', color: '#9aa79d', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' },
  infoValue: { fontSize: '13.5px', color: '#16311d', fontWeight: 600, lineHeight: 1.4 },
  infoValueSub: { fontSize: '11px', color: '#6b7770', fontWeight: 500 },

  emptyBox: { backgroundColor: '#fafbf8', borderRadius: '12px', padding: '24px', textAlign: 'center', border: '1px solid #eceee7', marginTop: '14px' },
  recordList: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px 0 4px' },
  recordCard: { backgroundColor: '#fff', borderRadius: '12px', padding: '12px 14px', border: '1.5px solid #e7e8e0', cursor: 'pointer', transition: 'border-color 0.15s ease' },
  recordTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' },
  recordBadge: { padding: '3px 10px', borderRadius: '999px', color: '#fff', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' },
  recordTypeTag: { fontSize: '10.5px', fontWeight: 700 },
  recordDateRow: { display: 'flex', alignItems: 'center', gap: '6px' },
  recordDate: { fontSize: '12px', color: '#6b7770' },
  chevron: { fontSize: '12px', color: '#9aa79d', transition: 'transform 0.15s ease', display: 'inline-block' },
  recordNotes: { fontSize: '13px', color: '#33413a', marginTop: '8px', marginBottom: 0, lineHeight: 1.4 },
  expandedBox: { backgroundColor: '#fafbf8', borderRadius: '10px', padding: '12px 14px', marginTop: '10px', border: '1px solid #eceee7' },
  expandedRow: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' },
  expandedLabel: { color: '#8a968d', fontWeight: 600 },
  expandedValue: { color: '#16311d', fontWeight: 600 },
  expandedNotes: { fontSize: '13px', color: '#33413a', marginTop: '4px', marginBottom: 0, lineHeight: 1.4 },

seeMore: {
    width: '100%', marginTop: '12px', padding: '11px', borderRadius: '10px',
    border: '1px solid #dcdfd6', background: '#fff', color: '#2c8047',
    fontFamily: SANS, fontSize: '12.5px', fontWeight: 700, cursor: 'pointer',
  },
  
  footer: { padding: '14px 24px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #f0efe8', flexShrink: 0 },
  closeBtn: { fontFamily: SANS, padding: '9px 22px', borderRadius: '10px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#33413a', fontSize: '13px', fontWeight: 700, cursor: 'pointer' },
}