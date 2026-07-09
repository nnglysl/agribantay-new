import AdminLayout from '../../components/AdminLayout'
import FarmMap from '../../components/FarmMap'
import { useCachedFetch } from '../../hooks/useCachedFetch'

export default function AdminDashboard() {
  const { data, loading, error } = useCachedFetch('/admin/dashboard')
  const { data: mapFarms } = useCachedFetch('/admin/farms-map')

  if (loading) return <AdminLayout><p>Loading...</p></AdminLayout>
  if (error) return <AdminLayout><p style={{ color: '#dc2626' }}>{error}</p></AdminLayout>

  return (
    <AdminLayout>
      <h1 style={styles.title}>Dashboard</h1>
      <p style={styles.subtitle}>Welcome back, Administrator</p>

      <div style={styles.statsGrid}>
        <StatCard value={data.total_farms} label="Total Farms" />
        <StatCard value={data.active_requests} label="Active Requests" />
        <StatCard value={data.resolved_requests} label="Resolved Requests" />
      </div>

      <div style={styles.twoCol}>
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Critical Alerts</h3>
          {data.critical_farms.length === 0 && (
            <p style={styles.emptyText}>No critical alerts right now.</p>
          )}
          {data.critical_farms.map(f => (
            <div key={f.farm_id} style={styles.alertRow}>
              <div style={styles.alertBar} />
              <div style={{ flex: 1 }}>
                <div style={styles.alertFarm}>{f.farm_name}</div>
                <div style={styles.alertDetail}>Ammonia {f.ammonia} ppm</div>
              </div>
              <span style={{ ...styles.badge, backgroundColor: '#dc2626' }}>
                {f.ammonia_status}
              </span>
            </div>
          ))}
        </div>

        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Upcoming Inspections</h3>
          {data.upcoming_inspections.length === 0 && (
            <p style={styles.emptyText}>No upcoming inspections.</p>
          )}
          {data.upcoming_inspections.map(i => (
            <div key={i.id} style={styles.alertRow}>
              <div style={{ ...styles.alertBar, backgroundColor: '#3b82f6' }} />
              <div style={{ flex: 1 }}>
                <div style={styles.alertFarm}>{i.farm_name}</div>
                <div style={styles.alertDetail}>
                  📅 {new Date(i.scheduled_at).toLocaleDateString()} · {i.inspection_type}
                </div>
              </div>
              <span style={{ ...styles.badge, backgroundColor: '#3b82f6' }}>
                {i.inspection_type === 'Follow-up' ? 'Follow-up' : 'General'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '20px' }}>
        <h3 style={styles.panelTitle}>Farm monitoring map</h3>
        <FarmMap farms={mapFarms || []} />
      </div>
    </AdminLayout>
  )
}

function StatCard({ value, label }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  )
}

const styles = {
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  subtitle: { fontSize: '13px', color: '#6B6B5F', marginTop: '4px', marginBottom: '24px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' },
  statCard: {
    backgroundColor: 'white', borderRadius: '12px', padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  statValue: { fontSize: '28px', fontWeight: '700', color: '#111827' },
  statLabel: { fontSize: '13px', color: '#6b7280', marginTop: '2px' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
  panel: {
    backgroundColor: 'white', borderRadius: '12px', padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  panelTitle: { fontSize: '15px', fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: '16px' },
  emptyText: { fontSize: '13px', color: '#9ca3af' },
  alertRow: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '12px 0', borderBottom: '1px solid #f3f4f6',
  },
  alertBar: { width: '4px', height: '32px', backgroundColor: '#dc2626', borderRadius: '2px' },
  alertFarm: { fontSize: '14px', fontWeight: '600', color: '#111827' },
  alertDetail: { fontSize: '12px', color: '#6b7280', marginTop: '2px' },
  badge: { padding: '4px 10px', borderRadius: '999px', color: 'white', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap' },
}