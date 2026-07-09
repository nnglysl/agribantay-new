import { Link } from 'react-router-dom'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from 'chart.js'
import VetLayout from '../../components/VetLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

export default function VetDashboard() {
  const { data, loading, error } = useCachedFetch('/vet/dashboard')

  if (loading) return <VetLayout><p>Loading...</p></VetLayout>
  if (error) return <VetLayout><p style={{ color: '#dc2626' }}>{error}</p></VetLayout>
  if (!data) return <VetLayout><p>Loading...</p></VetLayout>

  const monthlyProgress = data.monthly_progress ?? []
  const scheduledVaccinations = data.scheduled_vaccinations ?? []
  const recentRequests = data.recent_requests ?? []
  const assignedFarms = data.assigned_farms ?? []

  return (
    <VetLayout>
      <h1 style={styles.title}>Welcome back, {data.vet_name || 'Doctor'}</h1>
      <p style={styles.subtitle}>Municipal Veterinarian — San Jose</p>

      <div style={styles.statsGrid}>
        <StatCard value={data.assigned_requests ?? 0} label="Assigned Requests" />
        <StatCard value={data.todays_schedule ?? 0} label="Today's Schedule" />
        <StatCard value={data.pending ?? 0} label="Pending" />
        <StatCard value={data.completed ?? 0} label="Completed" />
      </div>

      <div style={styles.actionsGrid}>
        <Link to="/vet/vaccination-requests" style={styles.actionCard}>
          <div style={styles.actionTitle}>Vaccination requests</div>
          <div style={styles.actionMeta}>Review and schedule</div>
        </Link>
        <Link to="/vet/reports" style={styles.actionCard}>
          <div style={styles.actionTitle}>Reports</div>
          <div style={styles.actionMeta}>Sensor data and advisories</div>
        </Link>
      </div>

      <div style={styles.twoCol}>
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Recent Vaccination Requests</h3>
          {recentRequests.length === 0 && (
            <p style={styles.emptyText}>No completed requests yet.</p>
          )}
          {recentRequests.map(r => (
            <div key={r.id} style={styles.listRow}>
              <span style={styles.rowTitle}>{r.farm_name}</span>
              <span style={styles.rowMeta}>
                {r.completed_at ? new Date(r.completed_at).toLocaleDateString() : '—'} — {r.status}
              </span>
            </div>
          ))}
        </div>

        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Farms You Serve</h3>
          {assignedFarms.length === 0 && (
            <p style={styles.emptyText}>No farms assigned yet.</p>
          )}
          {assignedFarms.map(f => (
            <div key={f.id} style={styles.listRow}>
              <span style={styles.rowTitle}>{f.farm_name}</span>
              <span style={styles.rowMeta}>{f.barangay}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={styles.twoCol}>
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <h3 style={styles.panelTitle}>Today's Schedule</h3>
          </div>
          {scheduledVaccinations.length === 0 && (
            <p style={styles.emptyText}>No vaccinations scheduled for today.</p>
          )}
          {scheduledVaccinations.map(v => (
            <div key={v.id} style={styles.row}>
              <div style={styles.rowBar} />
              <div style={{ flex: 1 }}>
                <div style={styles.rowTitle}>{v.farm_name}</div>
                <div style={styles.rowMeta}>
                  {v.owner_name} · {v.scheduled_at ? new Date(v.scheduled_at).toLocaleDateString() : '—'}
                </div>
              </div>
              <span style={styles.badge}>{v.status}</span>
            </div>
          ))}
        </div>

        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Monthly Vaccination Progress</h3>
          {monthlyProgress.length === 0 ? (
            <p style={styles.emptyText}>No vaccination history yet.</p>
          ) : (
            <div style={{ height: '160px' }}>
              <Bar
                data={{
                  labels: monthlyProgress.map(m => m.month),
                  datasets: [{
                    data: monthlyProgress.map(m => m.count),
                    backgroundColor: '#2E7D32',
                    borderRadius: 4,
                    maxBarThickness: 32,
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1, color: '#6b7280' }, grid: { color: '#f3f4f6' } },
                    x: { ticks: { color: '#6b7280' }, grid: { display: false } },
                  },
                }}
              />
            </div>
          )}
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
  actionsGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '20px' },
  actionCard: {
    display: 'block', backgroundColor: 'white', borderRadius: '12px', padding: '16px 20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)', textDecoration: 'none', cursor: 'pointer',
  },
  actionTitle: { fontSize: '14px', fontWeight: '700', color: '#111827' },
  actionMeta: { fontSize: '12px', color: '#6b7280', marginTop: '2px' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' },
  panel: {
    backgroundColor: 'white', borderRadius: '12px', padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  panelTitle: { fontSize: '15px', fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: '16px' },
  emptyText: { fontSize: '13px', color: '#9ca3af' },
  listRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 0', borderBottom: '1px solid #f3f4f6',
  },
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
}