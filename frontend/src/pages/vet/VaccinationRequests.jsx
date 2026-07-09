import { useState } from 'react'
import api from '../../api/axios'
import VetLayout from '../../components/VetLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'

const BIRD_ESTIMATES = {
  'Small': 'Below 10,000 layers',
  'Medium': '10,000–50,000 layers',
  'Large': 'Above 50,000 layers',
}

export default function VaccinationRequests() {
  const [tab, setTab] = useState('scheduled')
  const [acceptTarget, setAcceptTarget] = useState(null)
  const [noteTarget, setNoteTarget] = useState(null)
  const [viewTarget, setViewTarget] = useState(null)
  const [confirmDecline, setConfirmDecline] = useState(null)
  const [confirmComplete, setConfirmComplete] = useState(null)

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

  const list = tab === 'scheduled' ? requestData.scheduled : requestData.completed

  return (
    <VetLayout>
      <h1 style={styles.title}>Vaccination Requests</h1>
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

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {!loading && !error && list.length === 0 && (
        <div style={styles.empty}>No requests here yet.</div>
      )}

      {!loading && !error && (
        <div style={styles.list}>
          {list.map(r => (
            <div key={r.id} style={styles.card}>
              <div style={{ ...styles.cardBar, backgroundColor: r.status === 'Pending' ? '#f59e0b' : '#3b82f6' }} />
              <div style={{ flex: 1 }}>
                <div style={styles.cardTitle}>{r.farm_name}</div>
                <div style={styles.cardMeta}>
                  {r.owner_name} · {r.barangay} · {BIRD_ESTIMATES[r.farm_size] || 'Size unknown'}
                  {r.scheduled_at && <> · {new Date(r.scheduled_at).toLocaleDateString()}</>}
                </div>
                {r.notes && <div style={styles.cardNotes}>{r.notes}</div>}
              </div>
              <span style={{
                ...styles.badge,
                backgroundColor: r.status === 'Pending' ? '#f59e0b' : r.status === 'Completed' ? '#2E7D32' : '#3b82f6',
              }}>
                {r.status}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
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
              </div>
            </div>
          ))}
        </div>
      )}

      {acceptTarget && (
        <AcceptModal
          request={acceptTarget}
          onClose={() => setAcceptTarget(null)}
          onSuccess={() => { setAcceptTarget(null); refetch() }}
        />
      )}

      {noteTarget && (
        <NoteModal
          request={noteTarget}
          onClose={() => setNoteTarget(null)}
          onSuccess={() => { setNoteTarget(null); refetch() }}
        />
      )}

      {viewTarget && (
        <div style={modalStyles.overlay} onClick={() => setViewTarget(null)}>
          <div style={modalStyles.modal} onClick={e => e.stopPropagation()}>
            <div style={modalStyles.header}>
              <h3 style={modalStyles.title}>{viewTarget.farm_name}</h3>
              <span style={modalStyles.close} onClick={() => setViewTarget(null)}>×</span>
            </div>

            <div style={detailStyles.row}>
              <span style={detailStyles.label}>Owner</span>
              <span style={detailStyles.value}>{viewTarget.owner_name}</span>
            </div>
            <div style={detailStyles.row}>
              <span style={detailStyles.label}>Barangay</span>
              <span style={detailStyles.value}>{viewTarget.barangay}</span>
            </div>
            <div style={detailStyles.row}>
              <span style={detailStyles.label}>Est. Birds</span>
              <span style={detailStyles.value}>{BIRD_ESTIMATES[viewTarget.farm_size] || '—'}</span>
            </div>
            <div style={detailStyles.row}>
              <span style={detailStyles.label}>Status</span>
              <span style={detailStyles.value}>{viewTarget.status}</span>
            </div>
            {viewTarget.scheduled_at && (
              <div style={detailStyles.row}>
                <span style={detailStyles.label}>Scheduled</span>
                <span style={detailStyles.value}>{new Date(viewTarget.scheduled_at).toLocaleString()}</span>
              </div>
            )}
            {viewTarget.completed_at && (
              <div style={detailStyles.row}>
                <span style={detailStyles.label}>Completed</span>
                <span style={detailStyles.value}>{new Date(viewTarget.completed_at).toLocaleString()}</span>
              </div>
            )}
            {viewTarget.notes && (
              <div style={detailStyles.block}>
                <span style={detailStyles.label}>Notes</span>
                <p style={detailStyles.text}>{viewTarget.notes}</p>
              </div>
            )}

            <div style={modalStyles.actions}>
              <button onClick={() => setViewTarget(null)} style={modalStyles.cancelBtn}>Close</button>
            </div>
          </div>
        </div>
      )}

      {confirmDecline && (
        <div style={modalStyles.overlay} onClick={() => setConfirmDecline(null)}>
          <div style={confirmStyles.modal} onClick={e => e.stopPropagation()}>
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
          <div style={confirmStyles.modal} onClick={e => e.stopPropagation()}>
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

function AcceptModal({ request, onClose, onSuccess }) {
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
      <div style={modalStyles.modal} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>Accept & Schedule Vaccination</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>
        <p style={modalStyles.dateLabel}>Farm: {request.farm_name} · Owner: {request.owner_name}</p>

        <form onSubmit={handleSubmit}>
          {error && <div style={modalStyles.errorBox}>{error}</div>}

          <div style={modalStyles.row}>
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

          <div style={modalStyles.actions}>
            <button type="button" onClick={onClose} style={modalStyles.cancelBtn}>Cancel</button>
            <button type="submit" disabled={loading} style={modalStyles.submitBtn}>
              {loading ? 'Scheduling...' : 'Confirm Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function NoteModal({ request, onClose, onSuccess }) {
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
      <div style={modalStyles.modal} onClick={e => e.stopPropagation()}>
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

          <div style={modalStyles.actions}>
            <button type="button" onClick={onClose} style={modalStyles.cancelBtn}>Cancel</button>
            <button type="submit" disabled={loading} style={modalStyles.submitBtn}>
              {loading ? 'Saving...' : 'Save Note'}
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
  cardBar: { width: '4px', height: '36px', borderRadius: '2px', flexShrink: 0 },
  cardTitle: { fontSize: '14px', fontWeight: '600', color: '#111827' },
  cardMeta: { fontSize: '12px', color: '#6b7280', marginTop: '4px' },
  cardNotes: { fontSize: '13px', color: '#374151', marginTop: '6px' },
  badge: { padding: '4px 12px', borderRadius: '999px', color: 'white', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' },
  actionBtn: {
    padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
    cursor: 'pointer', border: '1px solid transparent', whiteSpace: 'nowrap',
  },
  acceptBtn: { color: '#2E7D32', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' },
  declineBtn: { color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fecaca' },
  noteBtn: { color: '#3b82f6', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' },
  completeBtn: { color: '#2E7D32', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' },
  viewBtn: { color: '#3b82f6', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' },
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