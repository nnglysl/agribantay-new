import { useEffect } from 'react'
import VetLayout from '../../components/VetLayout'
import VetScheduleMap from '../../components/VetScheduleMap'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

export default function VetDashboard() {
  const { data, loading, error, refetch } = useCachedFetch('/vet/dashboard')
  const isMobile = useIsMobile()

  // The dashboard's cached data can go stale the moment a request is
  // accepted/scheduled from the Vaccination & Blood Test Requests page (a
  // different screen, so it has no way to invalidate this page's cache).
  // Forcing a fresh fetch every time this page mounts fixes the "have to
  // manually reload to see the new schedule" issue — this now happens
  // silently in the background (no loading flash) since useCachedFetch
  // only shows the full loading state when there's no data yet.
  useEffect(() => {
    refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return <VetLayout><p>Loading...</p></VetLayout>
  if (error) return <VetLayout><p style={{ color: '#dc2626' }}>{error}</p></VetLayout>
  if (!data) return <VetLayout><p>Loading...</p></VetLayout>

  const mapRequests = data.map_requests ?? []

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

      <div style={styles.mapSection}>
        <h3 style={styles.mapSectionTitle}>Scheduled visits map</h3>
        <p style={styles.mapSectionSubtitle}>
          Farms with a confirmed vaccination or blood test date — useful for planning which visits to group together
        </p>
        <VetScheduleMap requests={mapRequests} />
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

  mapSection: {
    backgroundColor: 'white', borderRadius: '12px', padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '20px',
  },
  mapSectionTitle: { fontSize: '15px', fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: '4px' },
  mapSectionSubtitle: { fontSize: '12.5px', color: '#9ca3af', marginTop: 0, marginBottom: '16px' },
}