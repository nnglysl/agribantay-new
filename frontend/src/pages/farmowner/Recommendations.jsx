import FarmerLayout from '../../components/FarmerLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'

export default function Recommendations() {
  const { data, loading, error } = useCachedFetch('/farmer/recommendations')

  const badgeColor = {
    Priority: '#dc2626',
    Routine: '#2E7D32',
    Scheduled: '#3b82f6',
    Regional: '#f59e0b',
  }

  const icons = {
    'Ventilation Improvement': '💨',
    'Litter Management': '🌾',
    'Equipment Check': '🔧',
    'Community Alert': '📢',
  }

  return (
    <FarmerLayout>
      <h1 style={styles.title}>Recommendations</h1>
      <p style={styles.subtitle}>Automated insights based on your farm's sensor readings</p>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {!loading && !error && data.length === 0 && (
        <div style={styles.empty}>
          No active recommendations right now — your farm conditions look good.
        </div>
      )}

      {!loading && !error && (
        <div style={styles.grid}>
          {data.map((rec, i) => (
            <div key={i} style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardTitleRow}>
                  <span style={styles.icon}>{icons[rec.title] || '📋'}</span>
                  <span style={styles.cardTitle}>{rec.title}</span>
                </div>
                <span style={{ ...styles.badge, backgroundColor: badgeColor[rec.badge] || '#6b7280' }}>
                  {rec.badge}
                </span>
              </div>

              <div style={styles.section}>
                <div style={styles.sectionLabel}>Root Cause</div>
                <div style={styles.sectionText}>{rec.root_cause}</div>
              </div>

              <div style={styles.section}>
                <div style={styles.sectionLabel}>Preventive Action</div>
                <div style={styles.sectionText}>{rec.preventive_action}</div>
              </div>

              <div style={styles.section}>
                <div style={styles.sectionLabel}>Suggested Next Step</div>
                <div style={styles.sectionText}>{rec.next_step}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </FarmerLayout>
  )
}

const styles = {
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  subtitle: { fontSize: '13px', color: '#6b7280', marginTop: '4px', marginBottom: '24px' },
  empty: { color: '#9ca3af', fontSize: '14px', padding: '24px 0' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' },
  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '14px',
  },
  cardTitleRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  icon: { fontSize: '18px' },
  cardTitle: { fontSize: '15px', fontWeight: '700', color: '#111827' },
  badge: {
    padding: '3px 10px',
    borderRadius: '999px',
    color: 'white',
    fontSize: '11px',
    fontWeight: '600',
  },
  section: { marginBottom: '12px' },
  sectionLabel: { fontSize: '11px', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '2px' },
  sectionText: { fontSize: '13px', color: '#374151', lineHeight: '1.4' },
}