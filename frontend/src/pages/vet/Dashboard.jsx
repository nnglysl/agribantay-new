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
import { useIsMobile } from '../../hooks/useIsMobile'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

export default function VetDashboard() {
  const { data, loading, error } = useCachedFetch('/vet/dashboard')
  const isMobile = useIsMobile()

  if (loading) return <VetLayout><p>Loading...</p></VetLayout>
  if (error) return <VetLayout><p style={{ color: '#dc2626' }}>{error}</p></VetLayout>
  if (!data) return <VetLayout><p>Loading...</p></VetLayout>

  const monthlyProgress = data.monthly_progress ?? []
  const scheduledVaccinations = data.scheduled_vaccinations ?? []

  return (
    <VetLayout>
      <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>
        Welcome back, {data.vet_name || 'Doctor'}
      </h1>
      <p style={styles.subtitle}>Municipal Veterinarian — San Jose</p>

      <div style={{ ...styles.statsGrid, ...(isMobile ? styles.statsGridMobile : {}) }}>
        <StatCard value={data.assigned_requests ?? 0} label="Assigned Requests" foot="All requests routed to you" variant="green" isMobile={isMobile} />
        <StatCard value={data.pending ?? 0} label="Pending" foot="Awaiting action" variant="gold" isMobile={isMobile} />
        <StatCard value={data.completed ?? 0} label="Completed" foot="Closed out" variant="clay" isMobile={isMobile} />
      </div>

      <div style={styles.singleAction}>
        <Link to="/vet/vaccination-requests" style={styles.actionCard}>
          <div style={styles.actionTitle}>Vaccination requests</div>
          <div style={styles.actionMeta}>Review and schedule</div>
        </Link>
      </div>

      <div style={{ ...styles.twoCol, ...(isMobile ? styles.twoColMobile : {}) }}>
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
              <div style={{ flex: 1, minWidth: 0 }}>
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
            <div style={{ height: isMobile ? '180px' : '160px' }}>
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

function StatCard({ value, label, foot, variant, isMobile }) {
  return (
    <div style={{ ...styles.statCard, ...styles[`statCard_${variant}`], ...(isMobile ? styles.statCardMobile : {}) }}>
      <div style={{ ...styles.statValue, ...(isMobile ? styles.statValueMobile : {}) }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
      {foot && <div style={styles.statFoot}>{foot}</div>}
    </div>
  )
}

const styles = {
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  titleMobile: { fontSize: '18px' },
  subtitle: { fontSize: '13px', color: '#6B6B5F', marginTop: '4px', marginBottom: '24px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' },
  statsGridMobile: { gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '16px' },
  singleAction: { marginBottom: '20px' },

  // Matches AdminDashboard's gradient stat cards exactly (green / gold / clay).
  statCard: {
    position: 'relative', overflow: 'hidden', borderRadius: '14px', padding: '18px 20px',
    color: 'white', boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
  },
  statCard_green: { background: 'linear-gradient(135deg, #234A35 0%, #122A1E 100%)' },
  statCard_gold: { background: 'linear-gradient(135deg, #E8C766 0%, #D4AF37 55%, #B8912B 100%)', color: '#122A1E' },
  statCard_clay: { background: 'linear-gradient(135deg, #D68A46 0%, #B5651D 100%)' },
  statCardMobile: { padding: '14px' },

  statValue: { fontSize: '28px', fontWeight: '800', lineHeight: 1 },
  statValueMobile: { fontSize: '22px' },
  statLabel: { fontSize: '12.5px', fontWeight: '600', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.4px', opacity: 0.92 },
  statFoot: { fontSize: '11px', marginTop: '8px', opacity: 0.85 },

  actionsGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '20px' },
  actionsGridMobile: { gridTemplateColumns: '1fr', gap: '10px', marginBottom: '16px' },
  actionCard: {
    display: 'block', backgroundColor: 'white', borderRadius: '12px', padding: '16px 20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)', textDecoration: 'none', cursor: 'pointer',
  },
  actionTitle: { fontSize: '14px', fontWeight: '700', color: '#111827' },
  actionMeta: { fontSize: '12px', color: '#6b7280', marginTop: '2px' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' },
  twoColMobile: { gridTemplateColumns: '1fr', gap: '12px', marginBottom: '16px' },
  panel: {
    backgroundColor: 'white', borderRadius: '12px', padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  panelTitle: { fontSize: '15px', fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: '16px' },
  emptyText: { fontSize: '13px', color: '#9ca3af' },
  listRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 0', borderBottom: '1px solid #f3f4f6', gap: '8px',
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
    color: 'white', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap', flexShrink: 0,
  },
}