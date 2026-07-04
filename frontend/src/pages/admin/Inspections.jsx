import { useState } from 'react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export default function Inspections() {
  const [tab, setTab] = useState('schedule')
  const [viewDate, setViewDate] = useState(new Date())
  const [modalDate, setModalDate] = useState(null)
  const [confirmCancel, setConfirmCancel] = useState(null)
  const [completeInspection, setCompleteInspection] = useState(null)
  const [viewInspection, setViewInspection] = useState(null)

  const { data: inspectionsData, loading: loadingInspections, error: errorInspections, refetch: refetchInspections } = useCachedFetch('/admin/inspections')
  const { data: farmsData, loading: loadingFarms, error: errorFarms, refetch: refetchFarms } = useCachedFetch('/admin/farms')

  const inspections = inspectionsData || []
  const farms = farmsData || []
  const loading = loadingInspections || loadingFarms
  const error = errorInspections || errorFarms

  const refetchAll = () => {
    refetchInspections()
    refetchFarms()
  }

  const handleCancel = (inspection) => {
    setConfirmCancel(inspection)
  }

  const confirmCancelAction = async () => {
    await api.patch(`/admin/inspections/${confirmCancel.id}/cancel`)
    setConfirmCancel(null)
    refetchInspections()
  }

  const scheduled = inspections.filter(i => i.status === 'Scheduled')
  const completed = inspections.filter(i => i.status === 'Completed')

  const statusColor = { Scheduled: '#3b82f6', Completed: '#2E7D32', Cancelled: '#6b7280' }

  return (
    <AdminLayout>
      <h1 style={styles.title}>Inspections</h1>
      <p style={styles.subtitle}>Farm inspection scheduling & records</p>

      <div style={styles.tabs}>
        {['schedule', 'scheduled', 'completed', 'history'].map(t => (
          <div
            key={t}
            style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </div>
        ))}
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {!loading && !error && tab === 'schedule' && (
        <CalendarView
          inspections={inspections}
          viewDate={viewDate}
          setViewDate={setViewDate}
          onSelectDate={(date) => setModalDate(date)}
        />
      )}

      {!loading && !error && tab === 'scheduled' && (
        <InspectionList list={scheduled} statusColor={statusColor} onCancel={handleCancel} onComplete={setCompleteInspection} />
      )}

      {!loading && !error && tab === 'completed' && (
        <InspectionList list={completed} statusColor={statusColor} onView={setViewInspection} />
      )}

      {!loading && !error && tab === 'history' && (
        <InspectionList
          list={inspections.filter(i => i.status === 'Completed' || i.status === 'Cancelled')}
          statusColor={statusColor}
          onView={setViewInspection}
        />
      )}

      {modalDate && (
        <ScheduleModal
          date={modalDate}
          farms={farms}
          onClose={() => setModalDate(null)}
          onSuccess={() => { setModalDate(null); refetchInspections() }}
        />
      )}

      {completeInspection && (
        <CompleteModal
          inspection={completeInspection}
          onClose={() => setCompleteInspection(null)}
          onSuccess={() => { setCompleteInspection(null); refetchInspections() }}
        />
      )}

      {viewInspection && (
        <div style={modalStyles.overlay} onClick={() => setViewInspection(null)}>
          <div style={modalStyles.modal} onClick={e => e.stopPropagation()}>
            <div style={modalStyles.header}>
              <h3 style={modalStyles.title}>{viewInspection.inspection_number}</h3>
              <span style={modalStyles.close} onClick={() => setViewInspection(null)}>×</span>
            </div>

            <div style={detailStyles.row}>
              <span style={detailStyles.label}>Farm</span>
              <span style={detailStyles.value}>{viewInspection.farm_name}</span>
            </div>
            <div style={detailStyles.row}>
              <span style={detailStyles.label}>Type</span>
              <span style={detailStyles.value}>{viewInspection.inspection_type}</span>
            </div>
            <div style={detailStyles.row}>
              <span style={detailStyles.label}>Status</span>
              <span style={detailStyles.value}>{viewInspection.status}</span>
            </div>
            <div style={detailStyles.row}>
              <span style={detailStyles.label}>Scheduled</span>
              <span style={detailStyles.value}>
                {new Date(viewInspection.scheduled_at).toLocaleString()}
              </span>
            </div>
            {viewInspection.completed_at && (
              <div style={detailStyles.row}>
                <span style={detailStyles.label}>Completed</span>
                <span style={detailStyles.value}>
                  {new Date(viewInspection.completed_at).toLocaleString()}
                </span>
              </div>
            )}
            {viewInspection.notes && (
              <div style={detailStyles.block}>
                <span style={detailStyles.label}>Notes</span>
                <p style={detailStyles.text}>{viewInspection.notes}</p>
              </div>
            )}
            {viewInspection.findings && (
              <div style={detailStyles.block}>
                <span style={detailStyles.label}>Findings</span>
                <p style={detailStyles.text}>{viewInspection.findings}</p>
              </div>
            )}

            <div style={modalStyles.actions}>
              <button onClick={() => setViewInspection(null)} style={modalStyles.cancelBtn}>Close</button>
            </div>
          </div>
        </div>
      )}

      {confirmCancel && (
        <div style={modalStyles.overlay} onClick={() => setConfirmCancel(null)}>
          <div style={confirmStyles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={confirmStyles.title}>Cancel Inspection</h3>
            <p style={confirmStyles.message}>
              Cancel {confirmCancel.inspection_number} for {confirmCancel.farm_name}?
            </p>
            <div style={modalStyles.actions}>
              <button onClick={() => setConfirmCancel(null)} style={modalStyles.cancelBtn}>Keep it</button>
              <button onClick={confirmCancelAction} style={{ ...modalStyles.submitBtn, backgroundColor: '#dc2626' }}>
                Cancel Inspection
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function InspectionList({ list, statusColor, onCancel, onComplete, onView, showAll }) {
  if (list.length === 0) return <div style={styles.empty}>No inspections here yet.</div>

  return (
    <div style={styles.list}>
      {list.map(i => (
        <div key={i.id} style={styles.card}>
          <div style={styles.cardBar} />
          <div style={{ flex: 1 }}>
            <div style={styles.cardTitle}>{i.inspection_number} — {i.farm_name}</div>
            <div style={styles.cardMeta}>
              📅 {new Date(i.scheduled_at).toLocaleDateString()} ·{' '}
              🕐 {new Date(i.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ·{' '}
              {i.inspection_type}
            </div>
            {i.findings && <div style={styles.cardFindings}>{i.findings}</div>}
          </div>
          <span style={{ ...styles.badge, backgroundColor: statusColor[i.status] || '#6b7280' }}>
            {i.status}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {onView && (
              <span style={{ ...styles.actionBtn, ...styles.viewLink }} onClick={() => onView(i)}>
                View
              </span>
            )}
            {i.status === 'Scheduled' && onComplete && (
              <span style={{ ...styles.actionBtn, ...styles.completeLink }} onClick={() => onComplete(i)}>
                Complete
              </span>
            )}
            {i.status === 'Scheduled' && onCancel && (
              <span style={{ ...styles.actionBtn, ...styles.cancelLink }} onClick={() => onCancel(i)}>
                Cancel
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function CalendarView({ inspections, viewDate, setViewDate, onSelectDate }) {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const today = new Date()

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = new Date(year, month, 1).getDay()

  const cells = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const getInspectionsForDay = (day) => {
    if (!day) return []
    return inspections.filter(i => {
      const d = new Date(i.scheduled_at)
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day
    })
  }

  const isToday = (day) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  const goPrev = () => setViewDate(new Date(year, month - 1, 1))
  const goNext = () => setViewDate(new Date(year, month + 1, 1))

  return (
    <div style={styles.calendarCard}>
      <div style={styles.calendarHeader}>
        <h3 style={styles.calendarMonth}>{MONTH_NAMES[month]} {year}</h3>
        <div style={styles.calendarNav}>
          <span style={styles.navBtn} onClick={goPrev}>‹</span>
          <span style={styles.navBtn} onClick={goNext}>›</span>
        </div>
      </div>

      <div style={styles.calendarGrid}>
        {DAY_NAMES.map(d => <div key={d} style={styles.calendarDayName}>{d}</div>)}

        {cells.map((day, idx) => {
          const dayInspections = getInspectionsForDay(day)
          return (
            <div
              key={idx}
              style={{
                ...styles.calendarCell,
                ...(day ? {} : styles.calendarCellEmpty),
                ...(isToday(day) ? styles.calendarCellToday : {}),
              }}
              onClick={() => day && onSelectDate(new Date(year, month, day))}
            >
              {day && (
                <>
                  <div style={styles.calendarDayNum}>{day}</div>
                  {dayInspections.slice(0, 2).map((insp, i) => (
                    <div key={i} style={{
                      ...styles.calendarDot,
                      backgroundColor: insp.inspection_type === 'Follow-up' ? '#f59e0b' : '#3b82f6',
                    }}>
                      {insp.inspection_type === 'Follow-up' ? 'Follow-up' : 'General'}
                    </div>
                  ))}
                </>
              )}
            </div>
          )
        })}
      </div>

      <div style={styles.legend}>
        <span style={styles.legendItem}><span style={{ ...styles.legendDot, backgroundColor: '#3b82f6' }} /> General Inspection</span>
        <span style={styles.legendItem}><span style={{ ...styles.legendDot, backgroundColor: '#f59e0b' }} /> Follow-up</span>
      </div>
    </div>
  )
}

function ScheduleModal({ date, farms, onClose, onSuccess }) {
  const [farmId, setFarmId] = useState('')
  const [farmSearch, setFarmSearch] = useState('')
  const [showFarmList, setShowFarmList] = useState(false)
  const [time, setTime] = useState('09:00')
  const [inspectionType, setInspectionType] = useState('General Inspection')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const filteredFarms = farms.filter(f =>
    f.farm_name.toLowerCase().includes(farmSearch.toLowerCase()) ||
    f.owner_name.toLowerCase().includes(farmSearch.toLowerCase())
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!farmId) {
      setError('Please select a farm.')
      return
    }

    setLoading(true)
    try {
      const [hours, minutes] = time.split(':')
      const scheduledAt = new Date(date)
      scheduledAt.setHours(parseInt(hours), parseInt(minutes), 0)

      const pad = (n) => String(n).padStart(2, '0')
      const formatted = `${scheduledAt.getFullYear()}-${pad(scheduledAt.getMonth() + 1)}-${pad(scheduledAt.getDate())} ${pad(scheduledAt.getHours())}:${pad(scheduledAt.getMinutes())}:00`

      await api.post('/admin/inspections', {
        farm_id: farmId,
        inspection_type: inspectionType,
        scheduled_at: formatted,
        notes,
      })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to schedule inspection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>Schedule Inspection</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>
        <p style={modalStyles.dateLabel}>Date selected: {dateLabel}</p>

        <form onSubmit={handleSubmit}>
          {error && <div style={modalStyles.errorBox}>{error}</div>}

          <label style={modalStyles.label}>Farm *</label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search by farm or owner name..."
              value={farmSearch}
              onChange={e => {
                setFarmSearch(e.target.value)
                setFarmId('')
                setShowFarmList(true)
              }}
              onFocus={() => setShowFarmList(true)}
              style={modalStyles.input}
            />
            {showFarmList && (
              <div style={modalStyles.dropdownList}>
                {filteredFarms.map(f => (
                  <div
                    key={f.id}
                    style={modalStyles.dropdownItem}
                    onClick={() => {
                      setFarmId(f.id)
                      setFarmSearch(`${f.farm_name} — ${f.owner_name}`)
                      setShowFarmList(false)
                    }}
                  >
                    {f.farm_name} — {f.owner_name}
                  </div>
                ))}
                {filteredFarms.length === 0 && (
                  <div style={modalStyles.dropdownEmpty}>No farms match your search.</div>
                )}
              </div>
            )}
          </div>

          <div style={modalStyles.row}>
            <div>
              <label style={modalStyles.label}>Time *</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} style={modalStyles.input} />
            </div>
            <div>
              <label style={modalStyles.label}>Inspection Type *</label>
              <select value={inspectionType} onChange={e => setInspectionType(e.target.value)} style={modalStyles.input}>
                <option value="General Inspection">General Inspection</option>
                <option value="Follow-up">Follow-up</option>
              </select>
            </div>
          </div>

          <label style={modalStyles.label}>Notes for Inspection (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ ...modalStyles.input, minHeight: '70px', resize: 'vertical' }}
            placeholder="Add context or specific concerns"
          />

          <div style={modalStyles.actions}>
            <button type="button" onClick={onClose} style={modalStyles.cancelBtn}>Cancel</button>
            <button type="submit" disabled={loading} style={modalStyles.submitBtn}>
              {loading ? 'Scheduling...' : 'Schedule Inspection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CompleteModal({ inspection, onClose, onSuccess }) {
  const [findings, setFindings] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!findings.trim()) {
      setError('Please enter your findings for this inspection.')
      return
    }

    setLoading(true)
    try {
      await api.patch(`/admin/inspections/${inspection.id}/complete`, { findings })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to complete inspection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>Complete Inspection</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>
        <p style={modalStyles.dateLabel}>{inspection.inspection_number} — {inspection.farm_name}</p>

        <form onSubmit={handleSubmit}>
          {error && <div style={modalStyles.errorBox}>{error}</div>}

          <label style={modalStyles.label}>Findings *</label>
          <textarea
            value={findings}
            onChange={e => setFindings(e.target.value)}
            style={{ ...modalStyles.input, minHeight: '100px', resize: 'vertical' }}
            placeholder="e.g. All systems normal. No violations observed."
          />

          <div style={modalStyles.actions}>
            <button type="button" onClick={onClose} style={modalStyles.cancelBtn}>Cancel</button>
            <button type="submit" disabled={loading} style={modalStyles.submitBtn}>
              {loading ? 'Saving...' : 'Mark as Completed'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const styles = {
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  subtitle: { fontSize: '13px', color: '#6b7280', marginTop: '4px', marginBottom: '20px' },
  tabs: { display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid #e5e7eb' },
  tab: { padding: '10px 16px', fontSize: '14px', color: '#6b7280', cursor: 'pointer', borderBottom: '2px solid transparent' },
  tabActive: { color: '#2E7D32', fontWeight: '600', borderBottom: '2px solid #2E7D32' },
  empty: { color: '#9ca3af', fontSize: '14px', padding: '24px 0' },
  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  card: {
    backgroundColor: 'white', borderRadius: '12px', padding: '16px 20px',
    display: 'flex', alignItems: 'center', gap: '14px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  cardBar: { width: '4px', height: '36px', backgroundColor: '#3b82f6', borderRadius: '2px', flexShrink: 0 },
  cardTitle: { fontSize: '14px', fontWeight: '600', color: '#111827' },
  cardMeta: { fontSize: '12px', color: '#6b7280', marginTop: '4px' },
  cardFindings: { fontSize: '13px', color: '#374151', marginTop: '6px' },
  badge: { padding: '4px 12px', borderRadius: '999px', color: 'white', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' },
  actionBtn: {
    padding: '5px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    border: '1px solid transparent',
    whiteSpace: 'nowrap',
  },
  completeLink: {
    color: '#2E7D32',
    backgroundColor: '#f0fdf4',
    border: '1px solid #bbf7d0',
  },
  cancelLink: {
    color: '#dc2626',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
  },
  viewLink: {
    color: '#3b82f6',
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
  },

  calendarCard: { backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
  calendarHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  calendarMonth: { fontSize: '16px', fontWeight: '700', color: '#111827', margin: 0 },
  calendarNav: { display: 'flex', gap: '8px' },
  navBtn: {
    width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '16px', color: '#374151',
  },
  calendarGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' },
  calendarDayName: { fontSize: '11px', fontWeight: '600', color: '#9ca3af', textAlign: 'center', padding: '6px 0' },
  calendarCell: {
    minHeight: '80px', border: '1px solid #f3f4f6', borderRadius: '6px', padding: '6px',
    cursor: 'pointer', fontSize: '12px',
  },
  calendarCellEmpty: { cursor: 'default', backgroundColor: 'transparent', border: 'none' },
  calendarCellToday: { backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' },
  calendarDayNum: { fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' },
  calendarDot: {
    fontSize: '10px', color: 'white', borderRadius: '4px', padding: '2px 6px',
    marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  legend: { display: 'flex', gap: '20px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f3f4f6' },
  legendItem: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#6b7280' },
  legendDot: { width: '8px', height: '8px', borderRadius: '50%' },
}

const modalStyles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  modal: { backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '440px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  title: { fontSize: '17px', fontWeight: '700', color: '#111827', margin: 0 },
  close: { fontSize: '22px', cursor: 'pointer', color: '#6b7280' },
  dateLabel: { fontSize: '13px', color: '#6b7280', marginBottom: '16px' },
  label: { display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px', marginTop: '12px' },
  input: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'inherit' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  errorBox: { backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' },
  cancelBtn: { padding: '10px 18px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: 'white', fontSize: '14px', cursor: 'pointer' },
  submitBtn: { padding: '10px 18px', borderRadius: '8px', border: 'none', backgroundColor: '#2E7D32', color: 'white', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  dropdownList: {
    position: 'absolute', top: '100%', left: 0, right: 0,
    backgroundColor: 'white', border: '1px solid #d1d5db', borderRadius: '8px',
    marginTop: '4px', maxHeight: '180px', overflowY: 'auto', zIndex: 10,
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  },
  dropdownItem: {
    padding: '10px 14px', fontSize: '14px', cursor: 'pointer', color: '#374151',
  },
  dropdownEmpty: {
    padding: '10px 14px', fontSize: '13px', color: '#9ca3af',
  },
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