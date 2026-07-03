import { useEffect, useState } from 'react'
import api from '../../api/axios'
import FarmerLayout from '../../components/FarmerLayout'

export default function FarmerDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/farmer/dashboard')
      .then(res => setData(res.data.data))
      .catch(err => setError(err.response?.data?.message || 'Failed to load dashboard.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <FarmerLayout><p>Loading...</p></FarmerLayout>
  if (error) return <FarmerLayout><p style={{ color: '#dc2626' }}>{error}</p></FarmerLayout>

  const statusColor = {
    Healthy: '#2E7D32',
    Warning: '#f59e0b',
    Critical: '#dc2626',
  }[data.health_status] || '#6b7280'

  return (
    <FarmerLayout>
      <h1 style={styles.title}>Welcome back, {data.farm_name ? data.farm_name.split(' ')[0] : ''}</h1>
      <p style={styles.subtitle}>{data.farm_name} · {data.barangay}</p>

      <div style={{ ...styles.healthCard, backgroundColor: statusColor }}>
        <div>
          <div style={styles.healthLabel}>Farm Health Score</div>
          <div style={styles.healthScore}>{data.health_score}</div>
          <div style={styles.healthStatus}>{data.health_status}</div>
        </div>
        <div style={styles.sensorMini}>
          <div>Ammonia<br /><strong>{data.ammonia ?? '—'} ppm</strong></div>
          <div>Temperature<br /><strong>{data.temperature ?? '—'}°C</strong></div>
          <div>Humidity<br /><strong>{data.humidity ?? '—'}%</strong></div>
        </div>
      </div>

      <div style={styles.grid}>
        <SensorGauge label="Ammonia" value={data.ammonia} status={data.ammonia_status} unit="ppm" />
        <SensorGauge label="Temperature" value={data.temperature} status={data.temperature_status} unit="°C" />
        <SensorGauge label="Humidity" value={data.humidity} status={data.humidity_status} unit="%" />
      </div>

      <div style={styles.statsGrid}>
        <StatCard label="Pending Requests" value={data.pending_requests} />
        <StatCard label="Alerts This Week" value={data.alerts_this_week} />
        <StatCard label="Completed Services" value={data.completed_services} />
      </div>
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

function StatCard({ label, value }) {
  return (
    <div style={styles.card}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.cardLabel}>{label}</div>
    </div>
  )
}

const styles = {
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  subtitle: { fontSize: '13px', color: '#6b7280', marginTop: '4px', marginBottom: '24px' },
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
  sensorMini: { display: 'flex', gap: '24px', fontSize: '12px', textAlign: 'right' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' },
  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  cardLabel: { fontSize: '13px', color: '#6b7280', marginBottom: '4px' },
  gaugeValue: { fontSize: '22px', fontWeight: '700' },
  gaugeStatus: { fontSize: '12px', fontWeight: '600', marginTop: '2px' },
  statValue: { fontSize: '28px', fontWeight: '700', color: '#111827' },
}