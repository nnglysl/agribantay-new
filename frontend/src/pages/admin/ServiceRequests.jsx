import { useState } from 'react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

export default function ServiceRequests() {
  const [tab, setTab] = useState('pending')
  const [acceptTarget, setAcceptTarget] = useState(null)
  const [confirmDecline, setConfirmDecline] = useState(null)
  const [confirmComplete, setConfirmComplete] = useState(null)
  const isMobile = useIsMobile()

  const { data, loading, error, refetch } = useCachedFetch('/admin/service-requests')
  const allRequests = data || []

  const list = allRequests.filter(r => {
    if (tab === 'pending') return r.status === 'Pending'
    if (tab === 'scheduled') return r.status === 'Scheduled'
    return r.status === 'Completed' || r.status === 'Cancelled'
  })

  const statusColor = {
    Pending: '#f59e0b',
    Scheduled: '#3b82f6',
    Completed: '#2E7D32',
    Cancelled: '#6b7280',
  }

  const handleDeclineAction = async () => {
    await api.patch(`/admin/service-requests/${confirmDecline.id}/decline`)
    setConfirmDecline(null)
    refetch()
  }

  const handleCompleteAction = async () => {
    await api.patch(`/admin/service-requests/${confirmComplete.id}/complete`)
    setConfirmComplete(null)
    refetch()
  }

  return (
    <AdminLayout>
      <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Service Requests</h1>
      <p style={styles.subtitle}>Odor control, fly control, and other farmer-submitted service requests</p>

      <div style={styles.tabs}>
        <div style={{ ...styles.tab, ...(tab === 'pending' ? styles.tabActive : {}) }} onClick={() => setTab('pending')}>
          Pending
        </div>
        <div style={{ ...styles.tab, ...(tab === 'scheduled' ? styles.tabActive : {}) }} onClick={() => setTab('scheduled')}>
          Scheduled
        </div>
        <div style={{ ...styles.tab, ...(tab === 'history' ? styles.tabActive : {}) }} onClick={() => setTab('history')}>
          History
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
            <div key={r.id} style={{ ...styles.card, ...(isMobile ? styles.cardMobile : {}) }}>
              <div style={{ ...styles.cardBar, backgroundColor: statusColor[r.status] || '#9ca3af' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.cardTitleRow}>
                  <span style={styles.cardTitle}>{r.service_type}</span>
                  {r.request_number && <span style={styles.reqNumber}>#{r.request_number}</span>}
                </div>
                <div style={styles.cardMeta}>
                  {r.farm_name} · Requested by {r.requested_by}
                  {r.assigned_to && ` · Assigned to ${r.assigned_to}`}
                  {r.scheduled_at && ` · ${new Date(r.scheduled_at).toLocaleDateString()}`}
                </div>
                {r.notes && <div style={styles.cardNotes}>{r.notes}</div>}
              </div>

              <div style={{ ...styles.rightGroup, ...(isMobile ? styles.rightGroupMobile : {}) }}>
                <span style={{ ...styles.badge, backgroundColor: statusColor[r.status] || '#6b7280' }}>
                  {r.status}
                </span>
                <div style={{ display: 'flex', gap: '8px', ...(isMobile ? { width: '100%' } : {}) }}>
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
                    <span
                      style={{ ...styles.actionBtn, ...styles.completeBtn, ...(isMobile ? styles.actionBtnMobile : {}) }}
                      onClick={() => setConfirmComplete(r)}
                    >
                      Mark Completed
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
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
            <h3 style={confirmStyles.title}>Complete Request</h3>
            <p style={confirmStyles.message}>
              Mark the {confirmComplete.service_type} at {confirmComplete.farm_name} as completed?
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
    </AdminLayout>
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

const styles = {
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  titleMobile: { fontSize: '18px' },
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
  cardMobile: { flexDirection: 'column', alignItems: 'stretch', padding: '14px 16px' },
  cardBar: { width: '4px', height: '40px', borderRadius: '2px', flexShrink: 0 },
  cardTitleRow: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  cardTitle: { fontSize: '15px', fontWeight: '700', color: '#111827' },
  reqNumber: { fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' },
  cardMeta: { fontSize: '13px', color: '#6b7280', marginTop: '4px' },
  cardNotes: { fontSize: '13px', color: '#374151', marginTop: '6px' },
  rightGroup: { display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 },
  rightGroupMobile: {
    flexDirection: 'column', alignItems: 'stretch', width: '100%',
    borderTop: '1px solid #f3f4f6', paddingTop: '10px', marginTop: '4px', gap: '8px',
  },
  badge: { padding: '4px 12px', borderRadius: '999px', color: 'white', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap', textAlign: 'center' },
  actionBtn: {
    padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
    cursor: 'pointer', border: '1px solid transparent', whiteSpace: 'nowrap',
  },
  actionBtnMobile: { flex: 1, textAlign: 'center', padding: '8px 12px' },
  acceptBtn: { color: '#2E7D32', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' },
  declineBtn: { color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fecaca' },
  completeBtn: { color: '#2E7D32', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' },
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