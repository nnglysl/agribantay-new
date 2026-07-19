import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import api from '../../api/axios'
import FarmerLayout from '../../components/FarmerLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

export default function ServiceRequests() {
  const [tab, setTab] = useState('active')
  const [showModal, setShowModal] = useState(false)
  const [prefillType, setPrefillType] = useState('')
  const isMobile = useIsMobile()
  const location = useLocation()

  // Arriving here from the dashboard's Critical-ammonia prompt pre-selects
  // Odor Control Request and opens the modal immediately, instead of
  // making the farmer navigate + pick it manually.
  useEffect(() => {
    if (location.state?.prefillService) {
      setPrefillType(location.state.prefillService)
      setShowModal(true)
    }
  }, [location.state])

  const { data, loading, error, refetch } = useCachedFetch('/farmer/service-requests')
  const requestData = data || { active: [], past: [] }

  const list = tab === 'active' ? requestData.active : requestData.past

  const statusColor = {
    Pending: '#f59e0b',
    Scheduled: '#3b82f6',
    Completed: '#2E7D32',
    Cancelled: '#6b7280',
  }

  return (
    <FarmerLayout>
      <div style={{ ...styles.header, ...(isMobile ? styles.headerMobile : {}) }}>
        <div>
          <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Service Requests</h1>
          <p style={styles.subtitle}>My requests & history</p>
        </div>
        <button
          style={{ ...styles.newBtn, ...(isMobile ? styles.newBtnMobile : {}) }}
          onClick={() => setShowModal(true)}
        >
          + Request a Service
        </button>
      </div>

      <div style={styles.tabs}>
        <div
          style={{ ...styles.tab, ...(tab === 'active' ? styles.tabActive : {}) }}
          onClick={() => setTab('active')}
        >
          My Requests
        </div>
        <div
          style={{ ...styles.tab, ...(tab === 'past' ? styles.tabActive : {}) }}
          onClick={() => setTab('past')}
        >
          Past Records
        </div>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {!loading && !error && list.length === 0 && (
        <div style={styles.empty}>No {tab === 'active' ? 'active requests' : 'past records'} yet.</div>
      )}

      {!loading && !error && (
        <div style={styles.list}>
          {list.map(r => (
            <div key={r.id} style={{ ...styles.card, ...(isMobile ? styles.cardMobile : {}) }}>
              <div style={{ minWidth: 0 }}>
                <div style={styles.cardTitle}>{r.service_type}</div>
                <div style={styles.cardMeta}>
                  {r.assigned_to && <>👤 {r.assigned_to} · </>}
                  {r.scheduled_at
                    ? `📅 ${new Date(r.scheduled_at).toLocaleDateString()}`
                    : 'Awaiting review'}
                </div>
                {r.notes && <div style={styles.cardNotes}>{r.notes}</div>}
              </div>
              <div style={{
                ...styles.badge,
                backgroundColor: statusColor[r.status] || '#6b7280',
                ...(isMobile ? styles.badgeMobile : {}),
              }}>
                {r.status}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <RequestModal
          isMobile={isMobile}
          initialServiceType={prefillType}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); refetch() }}
        />
      )}
    </FarmerLayout>
  )
}

function RequestModal({ onClose, onSuccess, isMobile, initialServiceType }) {
  const [serviceType, setServiceType] = useState(initialServiceType || '')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!serviceType) {
      setError('Please select a service type.')
      return
    }

    setLoading(true)
    try {
      await api.post('/farmer/service-requests', { service_type: serviceType, notes })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit request.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={{ ...modalStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>Request a Service</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div style={modalStyles.errorBox}>{error}</div>}

          <label style={modalStyles.label}>Service Type *</label>
          <select
            value={serviceType}
            onChange={e => setServiceType(e.target.value)}
            style={modalStyles.input}
          >
            <option value="">-- Select service type --</option>
            <option value="Vaccine Request">Vaccine Request</option>
            <option value="Blood Test Request">Blood Test Request</option>
            <option value="Odor Control Request">Odor Control Request</option>
            <option value="Fly Control Request">Fly Control Request</option>
          </select>

          <label style={modalStyles.label}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ ...modalStyles.input, minHeight: '80px', resize: 'vertical' }}
            placeholder="Add context or specific concerns"
          />

          <p style={modalStyles.hint}>
            Vaccine and blood test requests will be forwarded to the Municipal Veterinarian. Odor control and fly control requests will be reviewed by the Administrator.
          </p>

          <div style={{ ...modalStyles.actions, ...(isMobile ? modalStyles.actionsMobile : {}) }}>
            <button
              type="button"
              onClick={onClose}
              style={{ ...modalStyles.cancelBtn, ...(isMobile ? modalStyles.btnFull : {}) }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{ ...modalStyles.submitBtn, ...(isMobile ? modalStyles.btnFull : {}) }}
            >
              {loading ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' },
  headerMobile: { flexDirection: 'column', gap: '14px' },
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  titleMobile: { fontSize: '18px' },
  subtitle: { fontSize: '13px', color: '#6b7280', marginTop: '4px' },
  newBtn: {
    backgroundColor: '#2E7D32', color: 'white', border: 'none', borderRadius: '8px',
    padding: '10px 18px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
  },
  newBtnMobile: { width: '100%', boxSizing: 'border-box' },
  tabs: { display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid #e5e7eb' },
  tab: { padding: '10px 16px', fontSize: '14px', color: '#6b7280', cursor: 'pointer', borderBottom: '2px solid transparent' },
  tabActive: { color: '#2E7D32', fontWeight: '600', borderBottom: '2px solid #2E7D32' },
  empty: { color: '#9ca3af', fontSize: '14px', padding: '24px 0' },
  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  card: {
    backgroundColor: 'white', borderRadius: '12px', padding: '16px 20px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)', gap: '12px',
  },
  cardMobile: { padding: '14px 16px' },
  cardTitle: { fontSize: '15px', fontWeight: '600', color: '#111827' },
  cardMeta: { fontSize: '13px', color: '#6b7280', marginTop: '4px' },
  cardNotes: { fontSize: '13px', color: '#374151', marginTop: '6px' },
  badge: { padding: '4px 12px', borderRadius: '999px', color: 'white', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' },
  badgeMobile: { flexShrink: 0 },
}

const modalStyles = {
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
  },
  modal: { backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '420px', maxWidth: '90%' },
  modalMobile: { width: '100%', maxWidth: '100%', borderRadius: '16px 16px 0 0', padding: '20px', margin: '0', position: 'fixed', bottom: 0, left: 0, maxHeight: '85vh', overflowY: 'auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  title: { fontSize: '18px', fontWeight: '700', color: '#111827', margin: 0 },
  close: { fontSize: '22px', cursor: 'pointer', color: '#6b7280' },
  errorBox: {
    backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626',
    padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px',
  },
  label: { display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px', marginTop: '14px' },
  input: {
    width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db',
    fontSize: '14px', boxSizing: 'border-box', fontFamily: 'inherit',
  },
  hint: { fontSize: '12px', color: '#6b7280', marginTop: '14px', lineHeight: '1.5' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' },
  actionsMobile: { flexDirection: 'column-reverse' },
  btnFull: { width: '100%', boxSizing: 'border-box' },
  cancelBtn: {
    padding: '10px 18px', borderRadius: '8px', border: '1px solid #d1d5db',
    backgroundColor: 'white', fontSize: '14px', cursor: 'pointer',
  },
  submitBtn: {
    padding: '10px 18px', borderRadius: '8px', border: 'none',
    backgroundColor: '#2E7D32', color: 'white', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
  },
}