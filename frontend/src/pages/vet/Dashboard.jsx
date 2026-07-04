import VetLayout from '../../components/VetLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'

export default function VetDashboard() {
  const { data, loading, error } = useCachedFetch('/vet/dashboard')

  if (loading) return <VetLayout><p>Loading...</p></VetLayout>
  if (error) return <VetLayout><p style={{ color: '#dc2626' }}>{error}</p></VetLayout>

  const maxCount = Math.max(...data.monthly_progress.map(m => m.count), 1)

  return (
    <VetLayout>
      <h1 style={styles.title}>Welcome back, {data.vet_name || 'Doctor'}</h1>
      <p style={styles.subtitle}>Municipal Veterinarian — San Jose</p>

      <div style={styles.statsGrid}>
        <StatCard value={data.assigned_requests} label="Assigned Requests" />
        <StatCard value={data.todays_schedule} label="Today's Schedule" />
        <StatCard value={data.pending} label="Pending" />
        <StatCard value={data.completed} label="Completed" />
      </div>

      <div style={styles.twoCol}>
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <h3 style={styles.panelTitle}>Scheduled Vaccinations</h3>
          </div>
          {data.scheduled_vaccinations.length === 0 && (
            <p style={styles.emptyText}>No scheduled vaccinations right now.</p>
          )}
          {data.scheduled_vaccinations.map(v => (
            <div key={v.id} style={styles.row}>
              <div style={styles.rowBar} />
              <div style={{ flex: 1 }}>
                <div style={styles.rowTitle}>{v.farm_name}</div>
                <div style={styles.rowMeta}>
                  {v.owner_name} · {new Date(v.scheduled_at).toLocaleDateString()}
                </div>
              </div>
              <span style={styles.badge}>{v.status}</span>
            </div>
          ))}
        </div>

        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Monthly Vaccination Progress</h3>
          <div style={styles.chart}>
            {data.monthly_progress.map((m, i) => (
              <div key={i} style={styles.chartCol}>
                <div style={styles.chartBarWrap}>
                  <div style={{
                    ...styles.chartBar,
                    height: `${(m.count / maxCount) * 100}%`,
                  }} />
                </div>
                <div style={styles.chartLabel}>{m.month}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ ...styles.panel, marginTop: '20px' }}>
        <h3 style={styles.panelTitle}>Farms Covered</h3>
        <div style={styles.statsRow}>
          <StatRow label="Total farms served" value={data.farms_covered.total_farms_served} />
          <StatRow label="Vaccinations this month" value={data.farms_covered.vaccinations_this_month} />
          <StatRow label="Pending requests" value={data.farms_covered.pending_requests} />
        </div>
      </div>
    </VetLayout>
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

function StatRow({ label, value }) {
  return (
    <div style={styles.statRowItem}>
      <span style={styles.statRowValue}>{value}</span>
      <span style={styles.statRowLabel}>{label}</span>
    </div>
  )
}

const styles = {
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  subtitle: { fontSize: '13px', color: '#6B6B5F', marginTop: '4px', marginBottom: '24px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' },
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
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  panelTitle: { fontSize: '15px', fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: '16px' },
  emptyText: { fontSize: '13px', color: '#9ca3af' },
  row: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '10px 0', borderBottom: '1px solid #f3f4f6',
  },
  rowBar: { width: '4px', height: '32px', backgroundColor: '#3b82f6', borderRadius: '2px', flexShrink: 0 },
  rowTitle: { fontSize: '14px', fontWeight: '600', color: '#111827' },
  rowMeta: { fontSize: '12px', color: '#6b7280', marginTop: '2px' },
  badge: {
    padding: '4px 10px', borderRadius: '999px', backgroundColor: '#3b82f6',
    color: 'white', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap',
  },
  chart: { display: 'flex', alignItems: 'flex-end', gap: '10px', height: '140px', paddingTop: '10px' },
  chartCol: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' },
  chartBarWrap: { flex: 1, display: 'flex', alignItems: 'flex-end', width: '100%' },
  chartBar: { width: '100%', backgroundColor: '#2E7D32', borderRadius: '4px 4px 0 0', minHeight: '4px' },
  chartLabel: { fontSize: '11px', color: '#6b7280', marginTop: '6px' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' },
  statRowItem: { textAlign: 'center' },
  statRowValue: { display: 'block', fontSize: '24px', fontWeight: '700', color: '#111827' },
  statRowLabel: { fontSize: '12px', color: '#6b7280', marginTop: '4px' },
}