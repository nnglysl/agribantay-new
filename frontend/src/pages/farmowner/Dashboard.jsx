import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FarmerLayout from '../../components/FarmerLayout'
import api from '../../api/axios'
import { useCachedFetch } from '../../hooks/useCachedFetch'

function timeAgo(dateString) {
  const seconds = Math.floor((new Date() - new Date(dateString)) / 1000)

  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

// Real CSS media queries instead of a JS width check — this guarantees the
// layout collapses correctly on mobile regardless of how/when useIsMobile()
// detects the viewport. All rules are scoped under the "fd-" prefix.
const responsiveCss = `
  .fd-overview {
    display: grid;
    grid-template-columns: minmax(180px, 260px) 1fr;
    gap: 16px;
    margin-bottom: 24px;
    background: white;
    border-radius: 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    overflow: hidden;
  }
  .fd-score-panel {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 18px;
    color: white;
    text-align: center;
  }
  .fd-stats-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    background: #f3f4f6;
  }
  .fd-stat {
    background: white;
    padding: 16px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
  @media (min-width: 640px) {
    .fd-stats-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }
  @media (max-width: 640px) {
    .fd-overview { grid-template-columns: 1fr; }
    .fd-score-panel { padding: 20px; }
  }

  .fd-two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 24px;
    align-items: start;
  }
  @media (max-width: 720px) {
    .fd-two-col { grid-template-columns: 1fr; }
  }

  .fd-modal-card {
    background: white;
    border-radius: 16px;
    width: 100%;
    max-width: 440px;
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 12px 32px rgba(0,0,0,0.25);
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

export default function FarmerDashboard() {
  const { data, loading, error, refetch } = useCachedFetch('/farmer/dashboard')
  const { data: insight, loading: insightLoading, refetch: refetchInsight } = useCachedFetch('/farmer/insights')
  const { data: maintenance, loading: maintenanceLoading, refetch: refetchMaintenance } = useCachedFetch('/farmer/maintenance')
  const { data: disposalRecords, loading: disposalLoading, refetch: refetchDisposal } = useCachedFetch('/farmer/disposal-records')
  const navigate = useNavigate()

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

  useEffect(() => {
    const interval = setInterval(() => {
      refetch()
      refetchInsight()
      refetchMaintenance()
      refetchDisposal()
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  if (loading) return <FarmerLayout><p>Loading...</p></FarmerLayout>
  if (error) return <FarmerLayout><p style={{ color: '#dc2626' }}>{error}</p></FarmerLayout>

  const statusColor = {
    Healthy: '#2E7D32',
    Warning: '#f59e0b',
    Critical: '#dc2626',
  }[data.health_status] || '#6b7280'

  // Used by the AI Insight's "Request X" buttons — navigates to Service
  // Requests with the given type pre-selected, same pattern as before.
  const goToServiceRequest = (serviceType) => {
    navigate('/farmowner/service-requests', { state: { prefillService: serviceType } })
  }

  const recentMaintLogs = (maintenance?.recent_logs || []).slice(0, 2)
  const recentDisposalRecords = (disposalRecords || []).slice(0, 2)

  return (
    <FarmerLayout>
      <style>{responsiveCss}</style>

      <h1 style={styles.title}>
        Welcome back, {data.farm_name ? data.farm_name.split(' ')[0] : ''}
      </h1>
      <p style={styles.subtitle}>{data.farm_name} · {data.barangay}</p>

      {/* ---------------------------------------------------- Farm Overview */}
      <div className="fd-overview">
        <div className="fd-score-panel" style={{ backgroundColor: statusColor }}>
          <div>
            <div style={styles.healthLabel}>Farm Health Score</div>
            <div style={styles.healthScore}>{data.health_score}</div>
            <div style={styles.healthStatus}>{data.health_status}</div>
            <div style={styles.healthTimestamp}>
              {data.last_reading_at ? `Last updated ${timeAgo(data.last_reading_at)}` : 'No readings yet'}
            </div>
          </div>
        </div>

        <div className="fd-stats-grid">
          <SensorGauge label="Ammonia" value={data.ammonia} status={data.ammonia_status} unit="ppm" />
          <SensorGauge label="Temperature" value={data.temperature} status={data.temperature_status} unit="°C" />
          <SensorGauge label="Humidity" value={data.humidity} status={data.humidity_status} unit="%" />
          <SensorGauge label="Soil Moisture" value={data.moisture} status={data.moisture_status} unit="%" />
        </div>
      </div>

      {/* ---------------------------------------------------------- AI Insight */}
      {!insightLoading && insight?.available && (
        <div style={styles.insightCard}>
          <div style={styles.insightHeader}>
            <div>
              <div style={styles.insightTitle}>Recommendations</div>
              <div style={styles.insightSubtitle}>Based on your farm's latest sensor readings</div>
            </div>
          </div>

          <div style={styles.insightExplanationBlock}>
            <p style={styles.insightExplanation}>
              {insight.explanation || insight.main_action}
            </p>
          </div>

          {insight.tips?.length > 0 && (
            <div style={styles.insightSection}>
              <div style={styles.insightSectionLabel}>What you can do</div>
              <div style={styles.insightTipsList}>
                {insight.tips.slice(0, 3).map((tip, i) => (
                  <div key={i} style={styles.insightTipRow}>
                    <span style={styles.insightTipCheck}><CheckIcon /></span>
                    <span style={styles.insightTipText}>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {insight.service_suggestions?.length > 0 && (
            <div style={styles.insightSection}>
              <div style={styles.insightSectionLabel}>Municipal services you can request</div>
              <div style={styles.serviceSuggestions}>
                {insight.service_suggestions.map((s, i) => (
                  <div key={i} style={styles.serviceSuggestionCard}>
                    <span style={styles.serviceSuggestionReason}>{s.reason}</span>
                    <button
                      style={styles.serviceSuggestionBtn}
                      onClick={() => goToServiceRequest(s.type)}
                    >
                      Request {s.type.replace(' Request', '')} →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------- Maintenance + Disposal (side by side) */}
      <div className="fd-two-col">
        {/* Manure clean-out status */}
        {!maintenanceLoading && maintenance && (
          <div style={styles.maintCard}>
            <div style={styles.maintHeader}>
              <p style={styles.maintTitle}>Manure clean-out status</p>
              <span style={{ ...styles.maintBadge, ...maintBadgeStyle(maintenance.status.status) }}>
                {maintenance.status.status}
              </span>
            </div>

            <div style={styles.maintStatRow}>
              <span style={styles.maintStatValue}>{maintenance.status.days_since}</span>
              <span style={styles.maintStatLabel}>days since last clean-out</span>
            </div>
            <p style={styles.maintInterval}>
              Expected every ~{Math.round(maintenance.status.expected_interval_days / 30)} months · Last logged{' '}
              {maintenance.status.last_performed_at || 'never'}
            </p>

            <button style={styles.maintLogBtn} onClick={() => setShowMaintenanceForm(true)}>
              + Log a clean-out
            </button>

            {recentMaintLogs.length > 0 && (
              <div style={styles.maintHistory}>
                <p style={styles.maintHistoryLabel}>Recent clean-outs</p>
                {recentMaintLogs.map(log => (
                  <div key={log.id} style={styles.maintHistoryRow}>
                    <span>{log.performed_at}</span>
                    <span style={styles.maintHistoryNote}>{log.notes || '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Manure disposal records */}
        {!disposalLoading && (
          <div style={styles.maintCard}>
            <div style={styles.maintHeader}>
              <p style={styles.maintTitle}>Manure disposal records</p>
            </div>
            <p style={styles.disposalSubtitle}>
              Sold, composted, or otherwise disposed of manure from this farm
            </p>

            <button style={styles.maintLogBtn} onClick={() => setShowDisposalForm(true)}>
              + Log a disposal record
            </button>

            {recentDisposalRecords.length > 0 && (
              <div style={styles.maintHistory}>
                <p style={styles.maintHistoryLabel}>Recent records</p>
                {recentDisposalRecords.map(r => (
                  <div key={r.id} style={styles.maintHistoryRow}>
                    <span>{r.disposal_date} — {r.disposal_method}</span>
                    <span style={styles.maintHistoryNote}>{r.quantity} kg{r.buyer_name ? ` · ${r.buyer_name}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------- Modals */}
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
                  ...styles.maintLogBtn,
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
                  ...styles.maintLogBtn,
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

// Green for Up to date, amber for Due (the 30-day grace period), red for Overdue.
function maintBadgeStyle(status) {
  if (status === 'Overdue') return { backgroundColor: '#fef2f2', color: '#B91C1C' }
  if (status === 'Due') return { backgroundColor: '#fffbeb', color: '#B45309' }
  return { backgroundColor: '#f0fdf4', color: '#2E7D32' }
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

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function SensorGauge({ label, value, status, unit }) {
  const color = { Normal: '#2E7D32', Warning: '#f59e0b', Critical: '#dc2626' }[status] || '#6b7280'
  return (
    <div className="fd-stat">
      <div style={styles.cardLabel}>{label}</div>
      <div style={{ ...styles.gaugeValue, color }}>{value ?? '—'} {unit}</div>
      <div style={{ ...styles.gaugeStatus, color }}>{status ?? 'Offline'}</div>
    </div>
  )
}

const styles = {
  title: { fontSize: '20px', fontWeight: '700', color: '#111827', margin: 0 },
  subtitle: { fontSize: '13px', color: '#6B6B5F', marginTop: '4px', marginBottom: '20px' },

  healthLabel: { fontSize: '12px', opacity: 0.9 },
  healthScore: { fontSize: '34px', fontWeight: '700', lineHeight: 1.1 },
  healthStatus: { fontSize: '12px', opacity: 0.9, marginTop: '2px' },
  healthTimestamp: { fontSize: '10.5px', opacity: 0.7, marginTop: '6px' },

  insightCard: {
    backgroundColor: 'white', borderRadius: '14px', padding: '18px 20px',
    marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  insightHeader: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' },
  insightIconBadge: {
    width: '34px', height: '34px', borderRadius: '10px', flexShrink: 0,
    backgroundColor: '#F0EBDD', color: '#8A7A3E',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  insightTitle: { fontSize: '15px', fontWeight: '700', color: '#122A1E' },
  insightSubtitle: { fontSize: '12px', color: '#9ca3af', marginTop: '1px' },
  insightExplanationBlock: {
    backgroundColor: '#FDFBF6', border: '1px solid #F0EBDD', borderLeft: '3px solid #D4AF37',
    borderRadius: '8px', padding: '12px 14px',
  },
  insightExplanation: { fontSize: '13.5px', color: '#374151', lineHeight: '1.6', margin: 0 },
  insightSection: { marginTop: '16px' },
  insightSectionLabel: {
    fontSize: '11px', fontWeight: '700', color: '#8A7A3E', textTransform: 'uppercase',
    letterSpacing: '0.5px', marginBottom: '10px',
  },
  insightTipsList: { display: 'flex', flexDirection: 'column', gap: '9px' },
  insightTipRow: { display: 'flex', alignItems: 'flex-start', gap: '10px' },
  insightTipCheck: {
    width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#F0FDF4',
    color: '#2E7D32', display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: '1px',
  },
  insightTipText: { fontSize: '13px', color: '#4B5563', lineHeight: '1.55' },
  serviceSuggestions: { display: 'flex', flexDirection: 'column', gap: '10px' },
  serviceSuggestionCard: {
    backgroundColor: '#FAFAF8', border: '1px solid #ECE7DA', borderRadius: '10px',
    padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: '14px', flexWrap: 'wrap',
  },
  serviceSuggestionReason: { fontSize: '12.5px', color: '#6b7280', flex: 1, minWidth: '180px', lineHeight: '1.5' },
  serviceSuggestionBtn: {
    backgroundColor: '#2E7D32', color: 'white', border: 'none', borderRadius: '8px',
    padding: '9px 16px', fontSize: '12.5px', fontWeight: '600', cursor: 'pointer',
    whiteSpace: 'nowrap', flexShrink: 0,
  },

  maintCard: {
    backgroundColor: 'white', borderRadius: '14px', padding: '18px 20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  maintHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' },
  maintTitle: { fontSize: '14.5px', fontWeight: '600', color: '#111827', margin: 0 },
  maintBadge: { padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: '700' },
  maintStatRow: { display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '2px' },
  maintStatValue: { fontSize: '24px', fontWeight: '700', color: '#111827' },
  maintStatLabel: { fontSize: '13px', color: '#6b7280' },
  maintInterval: { fontSize: '12px', color: '#9ca3af', margin: '0 0 14px', lineHeight: '1.5' },
  disposalSubtitle: { fontSize: '12px', color: '#9ca3af', margin: '0 0 14px', lineHeight: '1.5' },

  maintLogBtn: {
    width: '100%', backgroundColor: '#2E7D32', color: 'white', border: 'none', borderRadius: '8px',
    padding: '10px', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer',
  },
  maintCancelBtn: {
    padding: '11px 18px', borderRadius: '8px', border: '1px solid #d1d5db',
    backgroundColor: 'white', fontSize: '14px', fontWeight: '600', color: '#374151', cursor: 'pointer',
  },
  maintForm: { display: 'flex', flexDirection: 'column', gap: '4px' },
  maintFormError: {
    backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626',
    padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '8px',
  },
  maintFormLabel: { fontSize: '12.5px', fontWeight: '600', color: '#374151', marginTop: '10px', marginBottom: '4px' },
  maintFormInput: {
    width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #d1d5db',
    fontSize: '13.5px', boxSizing: 'border-box', fontFamily: 'inherit',
  },
  maintFormActions: { display: 'flex', gap: '10px', marginTop: '16px' },
  maintHistory: { marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #f3f4f6' },
  maintHistoryLabel: { fontSize: '12px', color: '#6b7280', margin: '0 0 6px' },
  maintHistoryRow: {
    display: 'flex', justifyContent: 'space-between', fontSize: '12.5px',
    padding: '5px 0', borderTop: '1px solid #f9fafb', gap: '10px',
  },
  maintHistoryNote: { color: '#9ca3af', textAlign: 'right' },

  modalOverlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(17, 24, 39, 0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: '16px',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px', borderBottom: '1px solid #f3f4f6', position: 'sticky', top: 0,
    backgroundColor: 'white', borderRadius: '16px 16px 0 0',
  },
  modalTitle: { fontSize: '15px', fontWeight: '700', color: '#111827', margin: 0 },
  modalCloseBtn: {
    background: 'none', border: 'none', fontSize: '22px', lineHeight: 1, color: '#9ca3af',
    cursor: 'pointer', padding: '2px 6px',
  },
  modalBody: { padding: '18px 20px 20px' },

  cardLabel: { fontSize: '12px', color: '#6b7280', marginBottom: '4px' },
  gaugeValue: { fontSize: '28px', fontWeight: '700' },
  gaugeStatus: { fontSize: '12px', fontWeight: '600', marginTop: '2px' },
}