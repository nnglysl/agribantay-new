import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FarmerLayout from '../../components/FarmerLayout'
import api from '../../api/axios'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

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

export default function FarmerDashboard() {
  const { data, loading, error, refetch } = useCachedFetch('/farmer/dashboard')
  const { data: insight, loading: insightLoading, refetch: refetchInsight } = useCachedFetch('/farmer/insights')
  const { data: maintenance, loading: maintenanceLoading, refetch: refetchMaintenance } = useCachedFetch('/farmer/maintenance')
  const isMobile = useIsMobile()
  const navigate = useNavigate()

  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false)
  const [maintenanceDate, setMaintenanceDate] = useState('')
  const [maintenanceNotes, setMaintenanceNotes] = useState('')
  const [maintenancePhoto, setMaintenancePhoto] = useState(null)
  const [maintenanceSubmitting, setMaintenanceSubmitting] = useState(false)
  const [maintenanceError, setMaintenanceError] = useState('')

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

  return (
    <FarmerLayout>
      <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>
        Welcome back, {data.farm_name ? data.farm_name.split(' ')[0] : ''}
      </h1>
      <p style={styles.subtitle}>{data.farm_name} · {data.barangay}</p>

      <div style={{ ...styles.healthCard, ...(isMobile ? styles.healthCardMobile : {}), backgroundColor: statusColor }}>
        <div style={styles.healthCardContent}>
          <div style={styles.healthLabel}>Farm Health Score</div>
          <div style={{ ...styles.healthScore, ...(isMobile ? styles.healthScoreMobile : {}) }}>{data.health_score}</div>
          <div style={styles.healthStatus}>{data.health_status}</div>
          <div style={styles.healthTimestamp}>
            {data.last_reading_at ? `Last updated ${timeAgo(data.last_reading_at)}` : 'No readings yet'}
          </div>
        </div>
      </div>

      <div style={{ ...styles.grid, ...(isMobile ? styles.gridMobile : {}) }}>
        <SensorGauge label="Ammonia" value={data.ammonia} status={data.ammonia_status} unit="ppm" />
        <SensorGauge label="Temperature" value={data.temperature} status={data.temperature_status} unit="°C" />
        <SensorGauge label="Humidity" value={data.humidity} status={data.humidity_status} unit="%" />
        <SensorGauge label="Soil Moisture" value={data.moisture} status={data.moisture_status} unit="%" />
      </div>

      {!insightLoading && insight?.available && (
        <div style={styles.insightCard}>
          <div style={styles.insightHeader}>
            <div style={styles.insightIconBadge}>
              <SparkleIcon />
            </div>
            <div>
              <div style={styles.insightTitle}>AI Insight</div>
              <div style={styles.insightSubtitle}>Based on your farm's latest sensor readings</div>
            </div>
          </div>

          <div style={styles.insightExplanationBlock}>
            {insight.explanation ? (
              <p style={styles.insightExplanation}>{insight.explanation}</p>
            ) : (
              <p style={styles.insightExplanation}>{insight.main_action}</p>
            )}
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

      {/* ------------------------------------------------ Maintenance Status */}
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
            Expected every ~{Math.round(maintenance.status.expected_interval_days / 30)} months
          </p>

          <div style={styles.maintLastLogged}>
            <span style={styles.maintLastLoggedLabel}>Last logged</span>
            <span style={styles.maintLastLoggedValue}>
              {maintenance.status.last_performed_at || 'No clean-out logged yet'}
            </span>
          </div>

          {!showMaintenanceForm ? (
            <button style={styles.maintLogBtn} onClick={() => setShowMaintenanceForm(true)}>
              + Log a clean-out
            </button>
          ) : (
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
          )}

          {maintenance.recent_logs?.length > 0 && (
            <div style={styles.maintHistory}>
              <p style={styles.maintHistoryLabel}>Recent clean-outs</p>
              {maintenance.recent_logs.map(log => (
                <div key={log.id} style={styles.maintHistoryRow}>
                  <span>{log.performed_at}</span>
                  <span style={styles.maintHistoryNote}>{log.notes || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
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

function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M17.7 6.3l-2.1 2.1M8.4 15.6l-2.1 2.1" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
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
    <div style={styles.card}>
      <div style={styles.cardLabel}>{label}</div>
      <div style={{ ...styles.gaugeValue, color }}>{value ?? '—'} {unit}</div>
      <div style={{ ...styles.gaugeStatus, color }}>{status ?? 'Offline'}</div>
    </div>
  )
}

const styles = {
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  titleMobile: { fontSize: '18px' },
  subtitle: { fontSize: '13px', color: '#6B6B5F', marginTop: '4px', marginBottom: '24px' },
  healthCard: {
    borderRadius: '16px',
    padding: '24px 28px',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '24px',
  },
  healthCardMobile: {
    flexDirection: 'column', alignItems: 'center', padding: '20px', gap: '16px',
  },
  healthCardContent: { textAlign: 'center' },
  healthLabel: { fontSize: '13px', opacity: 0.9 },
  healthScore: { fontSize: '40px', fontWeight: '700', lineHeight: 1.1 },
  healthScoreMobile: { fontSize: '32px' },
  healthStatus: { fontSize: '13px', opacity: 0.9, marginTop: '4px' },
  healthTimestamp: { fontSize: '11px', opacity: 0.7, marginTop: '8px' },
  insightCard: {
    backgroundColor: 'white', borderRadius: '14px', padding: '22px 24px',
    marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  insightHeader: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' },
  insightIconBadge: {
    width: '34px', height: '34px', borderRadius: '10px', flexShrink: 0,
    backgroundColor: '#F0EBDD', color: '#8A7A3E',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  insightTitle: { fontSize: '15px', fontWeight: '700', color: '#122A1E' },
  insightSubtitle: { fontSize: '12px', color: '#9ca3af', marginTop: '1px' },
  insightExplanationBlock: {
    backgroundColor: '#FDFBF6', border: '1px solid #F0EBDD', borderLeft: '3px solid #D4AF37',
    borderRadius: '8px', padding: '14px 16px', marginBottom: '20px',
  },
  insightExplanation: { fontSize: '13.5px', color: '#374151', lineHeight: '1.65', margin: 0 },
  insightSection: { marginTop: '20px' },
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
    backgroundColor: 'white', borderRadius: '14px', padding: '20px 22px',
    marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  maintHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' },
  maintTitle: { fontSize: '14.5px', fontWeight: '600', color: '#111827', margin: 0 },
  maintBadge: { padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: '700' },
  maintStatRow: { display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '4px' },
  maintStatValue: { fontSize: '26px', fontWeight: '700', color: '#111827' },
  maintStatLabel: { fontSize: '13px', color: '#6b7280' },
  maintInterval: { fontSize: '12.5px', color: '#9ca3af', margin: '0 0 16px' },
  maintLastLogged: {
    borderTop: '1px solid #f3f4f6', paddingTop: '12px', marginBottom: '16px',
  },
  maintLastLoggedLabel: { fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '2px' },
  maintLastLoggedValue: { fontSize: '14px', color: '#111827', fontWeight: '600' },
  maintLogBtn: {
    width: '100%', backgroundColor: '#2E7D32', color: 'white', border: 'none', borderRadius: '8px',
    padding: '11px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
  },
  maintCancelBtn: {
    padding: '11px 18px', borderRadius: '8px', border: '1px solid #d1d5db',
    backgroundColor: 'white', fontSize: '14px', fontWeight: '600', color: '#374151', cursor: 'pointer',
  },
  maintForm: {
    marginTop: '4px', paddingTop: '16px', borderTop: '1px solid #f3f4f6',
    display: 'flex', flexDirection: 'column', gap: '4px',
  },
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
  maintHistory: { marginTop: '18px', paddingTop: '14px', borderTop: '1px solid #f3f4f6' },
  maintHistoryLabel: { fontSize: '12px', color: '#6b7280', margin: '0 0 8px' },
  maintHistoryRow: {
    display: 'flex', justifyContent: 'space-between', fontSize: '13px',
    padding: '6px 0', borderTop: '1px solid #f9fafb', gap: '10px',
  },
  maintHistoryNote: { color: '#9ca3af', textAlign: 'right' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' },
  gridMobile: { gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '20px' },
  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  cardLabel: { fontSize: '13px', color: '#6b7280', marginBottom: '4px' },
  gaugeValue: { fontSize: '22px', fontWeight: '700' },
  gaugeStatus: { fontSize: '12px', fontWeight: '600', marginTop: '2px' },
}