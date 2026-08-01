import { useState } from 'react'
import FarmerLayout from '../../components/FarmerLayout'
import api from '../../api/axios'
import { useCachedFetch } from '../../hooks/useCachedFetch'

const responsiveCss = `
  .fd-manure-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  @media (max-width: 720px) {
    .fd-manure-grid { grid-template-columns: 1fr; }
  }

  .fd-modal-card {
    background: white;
    border-radius: 16px;
    width: 100%;
    max-width: 440px;
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 12px 32px rgba(15,38,22,0.22);
  }
  @media (max-width: 640px) {
    .fd-modal-card {
      max-width: 100%;
      border-radius: 16px 16px 0 0;
      position: fixed;
      bottom: 0; left: 0; right: 0;
      max-height: 90vh;
    }
  }
`

export default function ManureRecords() {
  const { data: maintenance, loading: maintenanceLoading, refetch: refetchMaintenance } = useCachedFetch('/farmer/maintenance')
  const { data: disposalRecords, loading: disposalLoading, refetch: refetchDisposal } = useCachedFetch('/farmer/disposal-records')

  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false)
  const [maintenanceDate, setMaintenanceDate] = useState('')
  const [maintenanceNotes, setMaintenanceNotes] = useState('')
  const [maintenancePhoto, setMaintenancePhoto] = useState(null)
  const [maintenanceSubmitting, setMaintenanceSubmitting] = useState(false)
  const [maintenanceError, setMaintenanceError] = useState('')

  const [showDisposalForm, setShowDisposalForm] = useState(false)
  const [disposalMethod, setDisposalMethod] = useState('Sold')
  const [disposalQuantity, setDisposalQuantity] = useState('')
  const [disposalBuyerName, setDisposalBuyerName] = useState('')
  const [disposalDate, setDisposalDate] = useState('')
  const [disposalNotes, setDisposalNotes] = useState('')
  const [disposalSubmitting, setDisposalSubmitting] = useState(false)
  const [disposalError, setDisposalError] = useState('')

  const handleDisposalSubmit = async (e) => {
    e.preventDefault()
    setDisposalError('')

    if (!disposalQuantity || !disposalDate) {
      setDisposalError('Quantity and date are both required.')
      return
    }

    setDisposalSubmitting(true)
    try {
      await api.post('/farmer/disposal-records', {
        disposal_method: disposalMethod,
        quantity: disposalQuantity,
        buyer_name: disposalMethod === 'Sold' ? disposalBuyerName : null,
        disposal_date: disposalDate,
        notes: disposalNotes,
      })
      setShowDisposalForm(false)
      setDisposalMethod('Sold')
      setDisposalQuantity('')
      setDisposalBuyerName('')
      setDisposalDate('')
      setDisposalNotes('')
      refetchDisposal()
    } catch (err) {
      setDisposalError(err.response?.data?.message || 'Failed to log disposal record. Please try again.')
    } finally {
      setDisposalSubmitting(false)
    }
  }

  const handleMaintenanceSubmit = async (e) => {
    e.preventDefault()
    setMaintenanceError('')

    if (!maintenanceDate || !maintenancePhoto) {
      setMaintenanceError('Date and a photo are both required.')
      return
    }

    const formData = new FormData()
    formData.append('performed_at', maintenanceDate)
    formData.append('notes', maintenanceNotes)
    formData.append('photo', maintenancePhoto)

    setMaintenanceSubmitting(true)
    try {
      await api.post('/farmer/maintenance', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setShowMaintenanceForm(false)
      setMaintenanceDate('')
      setMaintenanceNotes('')
      setMaintenancePhoto(null)
      refetchMaintenance()
    } catch (err) {
      setMaintenanceError(err.response?.data?.message || 'Failed to log clean-out. Please try again.')
    } finally {
      setMaintenanceSubmitting(false)
    }
  }

  if (maintenanceLoading && disposalLoading) {
    return <FarmerLayout><p style={styles.stateText}>Loading...</p></FarmerLayout>
  }

  const recentMaintLogs = (maintenance?.recent_logs || []).slice(0, 5)
  const recentDisposalRecords = (disposalRecords || []).slice(0, 5)

  return (
    <FarmerLayout>
      <style>{responsiveCss}</style>

      <h1 style={styles.title}>Manure Records</h1>
      <p style={styles.subtitle}>
        Two simple logs — when you last cleaned out, and where the manure went
      </p>

      <div className="fd-manure-grid">
        {/* Manure clean-out status */}
        {!maintenanceLoading && maintenance && (
          <div style={styles.manureCard}>
            <div style={styles.manureHeadRow}>
              <div style={styles.manureHeadLeft}>
                <span style={styles.manureIcon}><CleanIcon /></span>
                <span style={styles.manureTitle}>Manure clean-out</span>
              </div>
              <span style={{ ...styles.manureBadge, ...maintBadgeStyle(maintenance.status.status) }}>
                <span style={{ ...styles.manureBadgeDot, backgroundColor: maintBadgeStyle(maintenance.status.status).color }}></span>
                {maintenance.status.status}
              </span>
            </div>

            <div style={styles.manureStatRow}>
              <span style={styles.manureStatValue}>{maintenance.status.days_since}</span>
              <span style={styles.manureStatLabel}>days since your last clean-out</span>
            </div>
            <p style={styles.manureInterval}>
              Recommended about every ~{Math.round(maintenance.status.expected_interval_days / 30)} months
              &nbsp;·&nbsp; Last done {maintenance.status.last_performed_at || 'never'}
            </p>

            <button style={styles.fullPrimaryBtn} onClick={() => setShowMaintenanceForm(true)}>
              + Log a clean-out
            </button>

            {recentMaintLogs.length > 0 && (
              <div style={styles.manureHistory}>
                <div style={styles.manureHistoryLabel}>Recent clean-outs</div>
                {recentMaintLogs.map(log => (
                  <div key={log.id} style={styles.manureHistoryRow}>
                    <span style={styles.manureHistoryDate}>{log.performed_at}</span>
                    <span style={styles.manureHistoryNote}>{log.notes || '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Manure disposal records */}
        {!disposalLoading && (
          <div style={styles.manureCard}>
            <div style={styles.manureHeadLeft}>
              <span style={styles.manureIcon}><DisposalIcon /></span>
              <div>
                <div style={styles.manureTitle}>Manure disposal records</div>
                <div style={styles.manureSub}>Where the manure went — sold, composted, or hauled away</div>
              </div>
            </div>

            <button style={styles.fullOutlineBtn} onClick={() => setShowDisposalForm(true)}>
              + Log a disposal record
            </button>

            {recentDisposalRecords.length > 0 && (
              <div style={styles.manureHistory}>
                <div style={styles.manureHistoryLabel}>Recent records</div>
                {recentDisposalRecords.map(r => (
                  <div key={r.id} style={styles.disposalRow}>
                    <div>
                      <div style={styles.disposalRowTitle}>{r.disposal_date} — {r.disposal_method}</div>
                      {r.buyer_name && <div style={styles.disposalRowSub}>Buyer: {r.buyer_name}</div>}
                    </div>
                    <span style={styles.disposalRowQty}>{r.quantity} kg</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showMaintenanceForm && (
        <Modal title="Log a clean-out" onClose={() => { setShowMaintenanceForm(false); setMaintenanceError('') }}>
          <form onSubmit={handleMaintenanceSubmit} style={styles.maintForm}>
            {maintenanceError && <div style={styles.maintFormError}>{maintenanceError}</div>}

            <label style={styles.maintFormLabel}>Date performed *</label>
            <input
              type="date"
              value={maintenanceDate}
              onChange={e => setMaintenanceDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              style={styles.maintFormInput}
              required
            />

            <label style={styles.maintFormLabel}>Notes (optional)</label>
            <textarea
              value={maintenanceNotes}
              onChange={e => setMaintenanceNotes(e.target.value)}
              placeholder="Removed all litter, added fresh bedding"
              style={{ ...styles.maintFormInput, minHeight: '60px', resize: 'vertical' }}
            />

            <label style={styles.maintFormLabel}>Photo *</label>
            <input
              type="file"
              accept="image/*"
              onChange={e => setMaintenancePhoto(e.target.files?.[0] || null)}
              style={styles.maintFormInput}
              required
            />

            <div style={styles.maintFormActions}>
              <button
                type="button"
                onClick={() => { setShowMaintenanceForm(false); setMaintenanceError('') }}
                style={styles.maintCancelBtn}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={maintenanceSubmitting || !maintenanceDate || !maintenancePhoto}
                style={{
                  ...styles.fullPrimaryBtn,
                  width: 'auto',
                  padding: '11px 20px',
                  marginTop: 0,
                  opacity: (maintenanceSubmitting || !maintenanceDate || !maintenancePhoto) ? 0.6 : 1,
                  cursor: (maintenanceSubmitting || !maintenanceDate || !maintenancePhoto) ? 'not-allowed' : 'pointer',
                }}
              >
                {maintenanceSubmitting ? 'Saving...' : 'Save log'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showDisposalForm && (
        <Modal title="Log a disposal record" onClose={() => { setShowDisposalForm(false); setDisposalError('') }}>
          <form onSubmit={handleDisposalSubmit} style={styles.maintForm}>
            {disposalError && <div style={styles.maintFormError}>{disposalError}</div>}

            <label style={styles.maintFormLabel}>Disposal method *</label>
            <select
              value={disposalMethod}
              onChange={e => setDisposalMethod(e.target.value)}
              style={styles.maintFormInput}
            >
              <option value="Sold">Sold</option>
              <option value="Composted on-site">Composted on-site</option>
              <option value="Other">Other</option>
            </select>

            <label style={styles.maintFormLabel}>Quantity (kg) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={disposalQuantity}
              onChange={e => setDisposalQuantity(e.target.value)}
              placeholder="e.g. 200"
              style={styles.maintFormInput}
              required
            />

            {disposalMethod === 'Sold' && (
              <>
                <label style={styles.maintFormLabel}>Buyer name (optional)</label>
                <input
                  type="text"
                  value={disposalBuyerName}
                  onChange={e => setDisposalBuyerName(e.target.value)}
                  placeholder="e.g. Mang Rudy"
                  style={styles.maintFormInput}
                />
              </>
            )}

            <label style={styles.maintFormLabel}>Date *</label>
            <input
              type="date"
              value={disposalDate}
              onChange={e => setDisposalDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              style={styles.maintFormInput}
              required
            />

            <label style={styles.maintFormLabel}>Notes (optional)</label>
            <textarea
              value={disposalNotes}
              onChange={e => setDisposalNotes(e.target.value)}
              placeholder="Any additional details"
              style={{ ...styles.maintFormInput, minHeight: '60px', resize: 'vertical' }}
            />

            <div style={styles.maintFormActions}>
              <button
                type="button"
                onClick={() => { setShowDisposalForm(false); setDisposalError('') }}
                style={styles.maintCancelBtn}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={disposalSubmitting || !disposalQuantity || !disposalDate}
                style={{
                  ...styles.fullPrimaryBtn,
                  width: 'auto',
                  padding: '11px 20px',
                  marginTop: 0,
                  opacity: (disposalSubmitting || !disposalQuantity || !disposalDate) ? 0.6 : 1,
                  cursor: (disposalSubmitting || !disposalQuantity || !disposalDate) ? 'not-allowed' : 'pointer',
                }}
              >
                {disposalSubmitting ? 'Saving...' : 'Save record'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </FarmerLayout>
  )
}

function maintBadgeStyle(status) {
  if (status === 'Overdue') return { backgroundColor: '#fbe3e3', color: '#b91c1c' }
  if (status === 'Due') return { backgroundColor: '#fdf3e6', color: '#b45309' }
  return { backgroundColor: '#eaf3ec', color: '#256b3d' }
}

function Modal({ title, onClose, children }) {
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div className="fd-modal-card" onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <p style={styles.modalTitle}>{title}</p>
          <button style={styles.modalCloseBtn} onClick={onClose} aria-label="Close">×</button>
        </div>
        <div style={styles.modalBody}>{children}</div>
      </div>
    </div>
  )
}

const iconBase = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }

function CleanIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" {...iconBase} strokeWidth="1.8" style={{ color: '#2c8047' }}><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
}
function DisposalIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" {...iconBase} strokeWidth="1.8" style={{ color: '#2c8047' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 15l2 2 4-4" /></svg>
}

const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },

  title: { fontSize: '26px', fontWeight: 800, letterSpacing: '-0.015em', color: '#16311d', margin: 0, fontFamily: SANS },
  subtitle: { fontSize: '14.5px', color: '#6b7770', marginTop: '5px', marginBottom: '24px', fontFamily: SANS, lineHeight: 1.5 },

  manureCard: { background: '#fff', border: '1px solid #e7e8e0', borderRadius: '18px', padding: '22px 24px', display: 'flex', flexDirection: 'column', fontFamily: SANS },
  manureHeadRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' },
  manureHeadLeft: { display: 'flex', alignItems: 'center', gap: '11px' },
  manureIcon: { width: '40px', height: '40px', borderRadius: '11px', background: '#eaf3ec', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  manureTitle: { fontSize: '15px', fontWeight: 800, color: '#16311d' },
  manureSub: { fontSize: '12.5px', color: '#8a968d', marginTop: '1px' },
  manureBadge: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' },
  manureBadgeDot: { width: '6px', height: '6px', borderRadius: '50%' },
  manureStatRow: { display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '20px' },
  manureStatValue: { fontSize: '34px', fontWeight: 800, letterSpacing: '-0.02em', color: '#16311d' },
  manureStatLabel: { fontSize: '15px', color: '#5c6b60', fontWeight: 600 },
  manureInterval: { fontSize: '12.5px', color: '#8a968d', margin: '6px 0 0', lineHeight: 1.5 },

  fullPrimaryBtn: { marginTop: '18px', width: '100%', padding: '13px', borderRadius: '12px', border: 'none', background: '#2c8047', color: '#fff', fontFamily: SANS, fontSize: '14px', fontWeight: 700, cursor: 'pointer' },
  fullOutlineBtn: { marginTop: '18px', width: '100%', padding: '13px', borderRadius: '12px', border: '1px solid #cfe0d5', background: '#f5faf6', color: '#2c8047', fontFamily: SANS, fontSize: '14px', fontWeight: 700, cursor: 'pointer' },

  manureHistory: { marginTop: '18px' },
  manureHistoryLabel: { fontSize: '11px', fontWeight: 700, color: '#8a968d', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' },
  manureHistoryRow: { display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '11px 0', borderBottom: '1px solid #f2f3ed', fontSize: '13px' },
  manureHistoryDate: { fontWeight: 700, color: '#16311d' },
  manureHistoryNote: { color: '#8a968d', textAlign: 'right' },
  disposalRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '11px 0', borderBottom: '1px solid #f2f3ed' },
  disposalRowTitle: { fontSize: '13.5px', fontWeight: 700, color: '#16311d' },
  disposalRowSub: { fontSize: '12px', color: '#8a968d', marginTop: '2px' },
  disposalRowQty: { fontSize: '13px', fontWeight: 700, color: '#5c6b60', whiteSpace: 'nowrap' },

  maintForm: { display: 'flex', flexDirection: 'column', gap: '4px' },
  maintFormError: { backgroundColor: '#fdf2f2', border: '1px solid #f3c9c9', color: '#b91c1c', padding: '10px 14px', borderRadius: '9px', fontSize: '13px', marginBottom: '8px' },
  maintFormLabel: { fontSize: '12.5px', fontWeight: 600, color: '#33413a', marginTop: '10px', marginBottom: '4px' },
  maintFormInput: { width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #dcdfd6', fontSize: '13.5px', boxSizing: 'border-box', fontFamily: SANS, color: '#16311d' },
  maintFormActions: { display: 'flex', gap: '10px', marginTop: '16px' },
  maintCancelBtn: { padding: '11px 18px', borderRadius: '10px', border: '1px solid #d9dcd4', backgroundColor: 'white', fontSize: '14px', fontWeight: 600, color: '#33413a', cursor: 'pointer', fontFamily: SANS },

  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(15,38,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f2f3ed', position: 'sticky', top: 0, backgroundColor: 'white', borderRadius: '16px 16px 0 0' },
  modalTitle: { fontSize: '16px', fontWeight: 800, color: '#16311d', margin: 0 },
  modalCloseBtn: { background: 'none', border: 'none', fontSize: '22px', lineHeight: 1, color: '#9aa79d', cursor: 'pointer', padding: '2px 6px' },
  modalBody: { padding: '18px 20px 20px' },
}