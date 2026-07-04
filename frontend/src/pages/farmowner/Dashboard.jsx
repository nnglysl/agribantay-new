import { useEffect } from 'react'
import FarmerLayout from '../../components/FarmerLayout'
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

export default function FarmerDashboard() {
  const { data, loading, error, refetch } = useCachedFetch('/farmer/dashboard')
  const { data: recommendations, loading: loadingRecs, refetch: refetchRecs } = useCachedFetch('/farmer/recommendations')

  useEffect(() => {
    const interval = setInterval(() => {
      refetch()
      refetchRecs()
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

  const badgeColor = {
    Priority: '#dc2626',
    Routine: '#2E7D32',
    Scheduled: '#3b82f6',
    Regional: '#f59e0b',
  }

  const recs = recommendations || []

  return (
    <FarmerLayout>
      <h1 style={styles.title}>Welcome back, {data.farm_name ? data.farm_name.split(' ')[0] : ''}</h1>
      <p style={styles.subtitle}>{data.farm_name} · {data.barangay}</p>

      <div style={{ ...styles.healthCard, backgroundColor: statusColor }}>
        <div>
          <div style={styles.healthLabel}>Farm Health Score</div>
          <div style={styles.healthScore}>{data.health_score}</div>
          <div style={styles.healthStatus}>{data.health_status}</div>
          <div style={styles.healthTimestamp}>
            {data.last_reading_at ? `Last updated ${timeAgo(data.last_reading_at)}` : 'No readings yet'}
          </div>
        </div>
        <div style={styles.sensorMini}>
          <div>Ammonia<br /><strong>{data.ammonia ?? '—'} ppm</strong></div>
          <div>Temperature<br /><strong>{data.temperature ?? '—'}°C</strong></div>
          <div>Humidity<br /><strong>{data.humidity ?? '—'}%</strong></div>
          <div>Moisture<br /><strong>{data.moisture ?? '—'}%</strong></div>
        </div>
      </div>

      <div style={styles.grid}>
        <SensorGauge label="Ammonia" value={data.ammonia} status={data.ammonia_status} unit="ppm" />
        <SensorGauge label="Temperature" value={data.temperature} status={data.temperature_status} unit="°C" />
        <SensorGauge label="Humidity" value={data.humidity} status={data.humidity_status} unit="%" />
        <SensorGauge label="Soil Moisture" value={data.moisture} status={data.moisture_status} unit="%" />
      </div>

      <div style={styles.recsHeader}>
        <h3 style={styles.recsTitle}>Recommendations</h3>
      </div>

      {!loadingRecs && recs.length === 0 && (
        <div style={styles.recsEmpty}>
          No active recommendations right now — your farm conditions look good.
        </div>
      )}

      {!loadingRecs && recs.length > 0 && (
        <div style={styles.recsGrid}>
          {recs.map((rec, i) => (
            <div key={i} style={styles.recCard}>
              <div style={styles.recHeader}>
                <span style={styles.recCardTitle}>{rec.title}</span>
                <span style={{ ...styles.badge, backgroundColor: badgeColor[rec.badge] || '#6b7280' }}>
                  {rec.badge}
                </span>
              </div>
              <div style={styles.recText}>{rec.root_cause}</div>
              <div style={styles.recAction}>{rec.preventive_action}</div>
              <div style={styles.recNext}>Next: {rec.next_step}</div>
            </div>
          ))}
        </div>
      )}
    </FarmerLayout>
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
  subtitle: { fontSize: '13px', color: '#6B6B5F', marginTop: '4px', marginBottom: '24px' },
  healthCard: {
    borderRadius: '16px',
    padding: '24px 28px',
    color: 'white',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  healthLabel: { fontSize: '13px', opacity: 0.9 },
  healthScore: { fontSize: '40px', fontWeight: '700', lineHeight: 1.1 },
  healthStatus: { fontSize: '13px', opacity: 0.9, marginTop: '4px' },
  healthTimestamp: { fontSize: '11px', opacity: 0.7, marginTop: '8px' },
  sensorMini: { display: 'flex', gap: '24px', fontSize: '12px', textAlign: 'right' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' },
  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  cardLabel: { fontSize: '13px', color: '#6b7280', marginBottom: '4px' },
  gaugeValue: { fontSize: '22px', fontWeight: '700' },
  gaugeStatus: { fontSize: '12px', fontWeight: '600', marginTop: '2px' },
  recsHeader: { marginBottom: '12px' },
  recsTitle: { fontSize: '16px', fontWeight: '700', color: '#111827', margin: 0 },
  recsEmpty: {
    backgroundColor: 'white', borderRadius: '12px', padding: '20px',
    color: '#9ca3af', fontSize: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  recsGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' },
  recCard: {
    backgroundColor: 'white', borderRadius: '12px', padding: '18px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  recHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  recCardTitle: { fontSize: '14px', fontWeight: '700', color: '#111827' },
  badge: { padding: '3px 10px', borderRadius: '999px', color: 'white', fontSize: '11px', fontWeight: '600' },
  recText: { fontSize: '13px', color: '#374151', lineHeight: '1.4', marginBottom: '6px' },
  recAction: { fontSize: '12px', color: '#6b7280', lineHeight: '1.4' },
  recNext: { fontSize: '12px', color: '#2E7D32', fontWeight: '600', marginTop: '6px' },
}