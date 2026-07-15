import { useState, useMemo } from 'react'
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
  const [range, setRange] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [acceptTarget, setAcceptTarget] = useState(null)
  const [noteTarget, setNoteTarget] = useState(null)
  const [viewTarget, setViewTarget] = useState(null)
  const [confirmDecline, setConfirmDecline] = useState(null)
  const [confirmComplete, setConfirmComplete] = useState(null)
  const isMobile = useIsMobile()

  const { data, loading, error, refetch } = useCachedFetch('/vet/vaccination-requests')
  const requestData = data || { scheduled: [], completed: [] }

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

  const list = tab === 'scheduled' ? requestData.scheduled : filteredCompleted

  return (
    <VetLayout>
      <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Vaccination Requests</h1>
      <p style={styles.subtitle}>Bird vaccination scheduling & records</p>

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

      {tab === 'completed' && (
        <div style={{ ...styles.filterRow, ...(isMobile ? styles.filterRowMobile : {}) }}>
          <select
            value={range}
            onChange={e => setRange(e.target.value)}
            style={{ ...styles.filterSelect, ...(isMobile ? styles.filterSelectMobile : {}) }}
          >
            {RANGE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {range === 'custom' && (
            <div style={{ ...styles.customDates, ...(isMobile ? styles.customDatesMobile : {}) }}>
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                style={styles.filterDateInput}
              />
              <span style={styles.customDatesSep}>to</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                style={styles.filterDateInput}
              />
            </div>
          )}
        </div>
      )}

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {!loading && !error && list.length === 0 && (
        <div style={styles.empty}>No requests here yet.</div>
      )}

      {!loading && !error && (
        <div style={styles.list}>
          {list.map(r => {
            const badge = (
              <span style={{
                ...styles.badge,
                backgroundColor: r.status === 'Pending' ? '#f59e0b' : r.status === 'Completed' ? '#2E7D32' : '#3b82f6',
              }}>
                {r.status}
              </span>
            )

            const actions = (
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-start', ...(isMobile ? { width: '100%' } : {}) }}>
                {r.status === 'Completed' && (
                  <span
                    style={{ ...styles.actionBtn, ...styles.viewBtn, ...(isMobile ? styles.actionBtnMobile : {}) }}
                    onClick={() => setViewTarget(r)}
                  >
                    View
                  </span>
                )}
                {r.status === 'Pending' && (
                  <>
                    <span
                      style={{ ...styles.actionBtn, ...styles.acceptBtn, ...(isMobile ? styles.actionBtnMobile : {}) }}
                      onClick={() => setAcceptTarget(r)}
                    >
                      Accept
                    </span>
                    <span
                      style={{ ...styles.actionBtn, ...styles.declineBtn, ...(isMobile ? styles.actionBtnMobile : {}) }}
                      onClick={() => setConfirmDecline(r)}
                    >
                      Decline
                    </span>
                  </>
                )}
                {r.status === 'Scheduled' && (
                  <>
                    <span
                      style={{ ...styles.actionBtn, ...styles.noteBtn, ...(isMobile ? styles.actionBtnMobile : {}) }}
                      onClick={() => setNoteTarget(r)}
                    >
                      Add Note
                    </span>
                    <span
                      style={{ ...styles.actionBtn, ...styles.completeBtn, ...(isMobile ? styles.actionBtnMobile : {}) }}
                      onClick={() => setConfirmComplete(r)}
                    >
                      Complete
                    </span>
                  </>
                )}
              </div>
            )

            return (
              <div key={r.id} style={{ ...styles.card, ...(isMobile ? styles.cardMobile : {}) }}>
                <div style={{ ...styles.cardBar, backgroundColor: r.status === 'Pending' ? '#f59e0b' : '#3b82f6' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.cardTitle}>{r.farm_name}</div>
                  <div style={styles.cardMeta}>
                    {r.owner_name} · {r.barangay} · {BIRD_ESTIMATES[r.farm_size] || 'Size unknown'}
                    {r.scheduled_at && <> · {new Date(r.scheduled_at).toLocaleDateString()}</>}
                  </div>
                  {r.notes && <div style={styles.cardNotes}>{r.notes}</div>}
                </div>

                {!isMobile && (
                  <div style={styles.badgeActionsGroup}>
                    {badge}
                    {actions}
                  </div>
                )}

                {isMobile && (
                  <div style={styles.cardBottomRow}>
                    {badge}
                    {actions}
                  </div>
                )}
              </div>
            )
          })}
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
            <p style={confirmStyles.message}>Decline the vaccination request from {confirmDecline.farm_name}?</p>
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
            <h3 style={confirmStyles.title}>Complete Vaccination</h3>
            <p style={confirmStyles.message}>Mark the vaccination at {confirmComplete.farm_name} as completed?</p>
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
          <h3 style={modalStyles.title}>Accept & Schedule Vaccination</h3>
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
            placeholder="Vaccine type, dosage, or special instructions"
          />

          <div style={{ ...modalStyles.actions, ...(isMobile ? modalStyles.actionsMobile : {}) }}>
            <button type="button" onClick={onClose} style={{ ...modalStyles.cancelBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>Cancel</button>
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
            <button type="button" onClick={onClose} style={{ ...modalStyles.cancelBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>Cancel</button>
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
          <div style={historyStyles.sectionLabel}> &nbsp;FARM & OWNER</div>
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
                <div style={historyStyles.infoValue}>{farm.farm_size} <span style={historyStyles.infoValueSub}>({BIRD_ESTIMATES[farm.farm_size] || '—'})</span></div>
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

          <div style={historyStyles.sectionLabel}> &nbsp;VACCINATION HISTORY</div>

          {farmRecords.length === 0 ? (
            <div style={historyStyles.emptyBox}>
              <div style={{ fontSize: '20px' }}>📭</div>
              <p style={{ fontSize: '13px', color: '#9ca3af', margin: '6px 0 0' }}>No records found.</p>
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
                      <span style={{ ...historyStyles.recordBadge, backgroundColor: color }}>{r.status}</span>
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
  tabs: { display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid #e5e7eb' },
  tab: { padding: '10px 16px', fontSize: '14px', color: '#6b7280', cursor: 'pointer', borderBottom: '2px solid transparent' },
  tabActive: { color: '#2E7D32', fontWeight: '600', borderBottom: '2px solid #2E7D32' },
  filterRow: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' },
  filterRowMobile: { flexDirection: 'column', alignItems: 'stretch' },
  filterSelect: {
    padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db',
    fontSize: '13px', color: '#374151', backgroundColor: 'white',
  },
  filterSelectMobile: { width: '100%', boxSizing: 'border-box' },
  customDates: { display: 'flex', alignItems: 'center', gap: '8px' },
  customDatesMobile: { width: '100%' },
  customDatesSep: { fontSize: '13px', color: '#9ca3af' },
  filterDateInput: {
    padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px', color: '#374151',
  },
  empty: { color: '#9ca3af', fontSize: '14px', padding: '24px 0' },
  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  card: {
    backgroundColor: 'white', borderRadius: '12px', padding: '16px 20px',
    display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: '14px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  cardMobile: {
    display: 'flex', flexDirection: 'column', alignItems: 'stretch', padding: '14px 16px', gap: '12px',
  },
  badgeActionsGroup: {
    display: 'grid', gridTemplateColumns: '100px 170px', alignItems: 'center', gap: '10px',
  },
  cardTopRow: { display: 'flex', alignItems: 'flex-start', gap: '12px' },
  cardBottomRow: {
    display: 'flex', flexDirection: 'column', gap: '10px',
    borderTop: '1px solid #f3f4f6', paddingTop: '10px',
  },
  cardBar: { width: '4px', height: '36px', borderRadius: '2px', flexShrink: 0 },
  cardTitle: { fontSize: '14px', fontWeight: '600', color: '#111827' },
  cardMeta: { fontSize: '12px', color: '#6b7280', marginTop: '4px' },
  cardNotes: { fontSize: '13px', color: '#374151', marginTop: '6px' },
  badge: {
    padding: '4px 12px', borderRadius: '999px', color: 'white', fontSize: '12px', fontWeight: '600',
    whiteSpace: 'nowrap', alignSelf: 'flex-start', minWidth: '84px', textAlign: 'center', display: 'inline-block',
  },
  actionBtn: {
    padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
    cursor: 'pointer', border: '1px solid transparent', whiteSpace: 'nowrap',
    minWidth: '76px', textAlign: 'center',
  },
  actionBtnMobile: { flex: 1, textAlign: 'center', padding: '8px 12px' },
  acceptBtn: { color: '#2E7D32', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' },
  declineBtn: { color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fecaca' },
  noteBtn: { color: '#3b82f6', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' },
  completeBtn: { color: '#2E7D32', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' },
  viewBtn: { color: '#3b82f6', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' },
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

const detailStyles = {
  row: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f3f4f6' },
  label: { fontSize: '13px', color: '#6b7280', fontWeight: '500' },
  value: { fontSize: '13px', color: '#111827', fontWeight: '600' },
  block: { marginTop: '14px' },
  text: { fontSize: '13px', color: '#374151', lineHeight: '1.5', marginTop: '4px' },
}

const historyStyles = {
  modal: {
    backgroundColor: '#F0EBDD', borderRadius: '20px', width: '560px', maxWidth: '90%',
    maxHeight: '90vh', overflowY: 'auto', position: 'relative', padding: 0,
  },
  close: {
    position: 'absolute', top: '16px', right: '16px', fontSize: '16px',
    color: 'white', cursor: 'pointer', lineHeight: 1, zIndex: 2,
    width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.15)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  heroHeader: {
    display: 'flex', alignItems: 'center', gap: '14px',
    padding: '24px 24px 20px', backgroundColor: '#1B4332',
    borderRadius: '20px 20px 0 0',
  },
  avatar: {
    width: '52px', height: '52px', borderRadius: '50%', backgroundColor: '#1B4332',
    color: '#F2B84B', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '18px', fontWeight: '700', flexShrink: 0, border: '2px solid #F2B84B',
  },
  farmName: { fontSize: '18px', fontWeight: '700', color: 'white' },
  ownerName: { fontSize: '13px', color: '#C9DDCE', marginTop: '2px' },
  body: { padding: '20px 24px 24px' },
  sectionLabel: {
    fontSize: '12px', fontWeight: '700', color: '#1B4332',
    textTransform: 'uppercase', letterSpacing: '0.4px', margin: '18px 0 10px',
  },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  infoGridMobile: { gridTemplateColumns: '1fr' },
  infoCard: {
    backgroundColor: 'white', borderRadius: '12px', padding: '12px 14px',
    display: 'flex', alignItems: 'center', gap: '10px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  infoIcon: { fontSize: '16px', flexShrink: 0 },
  infoLabel: { fontSize: '10px', color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.3px' },
  infoValue: { fontSize: '14px', color: '#111827', fontWeight: '700', marginTop: '2px' },
  infoValueSub: { fontSize: '11px', color: '#6b7280', fontWeight: '500' },
  emptyBox: {
    backgroundColor: 'white', borderRadius: '12px', padding: '24px', textAlign: 'center',
  },
  recordList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  recordCard: {
    backgroundColor: 'white', borderRadius: '12px', padding: '12px 14px',
    border: '1.5px solid #e5e7eb', cursor: 'pointer', transition: 'border-color 0.15s ease',
  },
  recordTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' },
  recordBadge: {
    padding: '3px 10px', borderRadius: '999px', color: 'white', fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap',
  },
  recordDateRow: { display: 'flex', alignItems: 'center', gap: '6px' },
  recordDate: { fontSize: '12px', color: '#6b7280' },
  chevron: { fontSize: '12px', color: '#9ca3af', transition: 'transform 0.15s ease', display: 'inline-block' },
  recordNotes: { fontSize: '13px', color: '#374151', marginTop: '8px', marginBottom: 0, lineHeight: '1.4' },
  expandedBox: {
    backgroundColor: '#f9fafb', borderRadius: '10px', padding: '12px 14px', marginTop: '10px',
  },
  expandedRow: {
    display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px',
  },
  expandedLabel: { color: '#9ca3af', fontWeight: '600' },
  expandedValue: { color: '#111827', fontWeight: '600' },
  expandedNotes: { fontSize: '13px', color: '#374151', marginTop: '4px', marginBottom: 0, lineHeight: '1.4' },
  footer: { marginTop: '20px' },
  closeBtn: {
    width: '100%', padding: '10px 18px', borderRadius: '8px',
    border: '1px solid #d1d5db', backgroundColor: 'white', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
  },
}