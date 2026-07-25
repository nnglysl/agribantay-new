import { useEffect } from 'react'
import VetLayout from '../../components/VetLayout'
import VetScheduleMap from '../../components/VetScheduleMap'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

export default function VetDashboard() {
  const { data, loading, error, refetch } = useCachedFetch('/vet/dashboard')
  const isMobile = useIsMobile()

  // Force a fresh fetch on mount so a request accepted/scheduled from the
  // Vaccination & Blood Test Requests page shows up here without a manual
  // reload. Silent (no loading flash) since useCachedFetch only shows the
  // full loading state when there's no data yet.
  useEffect(() => {
    refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return <VetLayout><p style={styles.stateText}>Loading...</p></VetLayout>
  if (error) return <VetLayout><p style={{ ...styles.stateText, color: '#b91c1c' }}>{error}</p></VetLayout>
  if (!data) return <VetLayout><p style={styles.stateText}>Loading...</p></VetLayout>

  const mapRequests = data.map_requests ?? []
  const scheduled = [...mapRequests]
    .filter(r => r.scheduled_at)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))

  return (
    <VetLayout>
      <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>
        Welcome back, {data.vet_name || 'Doctor'}
      </h1>
      <p style={styles.subtitle}>Municipal Veterinarian — San Jose, Batangas</p>

      <div style={{ ...styles.statsGrid, ...(isMobile ? styles.statsGridMobile : {}) }}>
        <StatCard value={data.assigned_requests ?? 0} label="Assigned Requests" foot="All requests routed to you" tone="green" isMobile={isMobile} />
        <StatCard value={data.pending ?? 0} label="Pending" foot="Awaiting action" tone="amber" badge="Awaiting" isMobile={isMobile} />
        <StatCard value={data.completed ?? 0} label="Completed" foot="Closed out" tone="green" isMobile={isMobile} />
      </div>

      <div style={{ ...styles.mainGrid, ...(isMobile ? styles.mainGridMobile : {}) }}>
        <section>
          <h3 style={styles.mapTitle}>Scheduled visits map</h3>
          <p style={styles.mapSubtitle}>
            Farms with a confirmed vaccination or blood test date — useful for planning which visits to group together
          </p>
          <VetScheduleMap requests={mapRequests} />
        </section>

        <ScheduledPanel items={scheduled} isMobile={isMobile} />
      </div>
    </VetLayout>
  )
}

function StatCard({ value, label, foot, tone, badge, isMobile }) {
  const t = TONES[tone] || TONES.green
  return (
    <div style={{ ...styles.statCard, ...(isMobile ? styles.statCardMobile : {}) }}>
      {badge && (
        <div style={styles.statTop}>
          <span style={{ ...styles.statBadge, color: t.fg, background: t.bg }}>{badge}</span>
        </div>
      )}
      <div style={{ ...styles.statValue, ...(isMobile ? styles.statValueMobile : {}) }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
      {foot && <div style={styles.statFoot}>{foot}</div>}
    </div>
  )
}

function ScheduledPanel({ items, isMobile }) {
  return (
    <section style={styles.panel}>
      <div style={styles.panelHead}>
        <div>
          <h3 style={styles.panelTitle}>Scheduled</h3>
          <p style={styles.panelSub}>Upcoming activities</p>
        </div>
        <span style={styles.panelCount}>{items.length}</span>
      </div>

      <div style={styles.panelBody}>
        {items.length === 0 && <p style={styles.emptyText}>No scheduled visits.</p>}
        {items.map((r, i) => {
          const c = REQ_COLOR[r.request_type] || REQ_COLOR.default
          return (
            <div key={r.id ?? i} style={styles.row}>
              <div style={{ ...styles.rowBar, backgroundColor: c.bar }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.rowName}>{r.farm_name}</div>
                <div style={styles.rowDetail}>
                  {new Date(r.scheduled_at).toLocaleDateString()} · {r.request_type || 'Visit'}
                </div>
              </div>
              <span style={{ ...styles.rowTag, color: c.bar, background: c.chip }}>
                {r.request_type || 'Visit'}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const TONES = {
  green: { bg: '#eaf3ec', fg: '#2c8047' },
  amber: { bg: '#fbf1e2', fg: '#b45309' },
}

const REQ_COLOR = {
  Vaccine: { bar: '#2c8047', chip: '#eaf3ec' },
  Vaccination: { bar: '#2c8047', chip: '#eaf3ec' },
  'Blood Test': { bar: '#2f6bb0', chip: '#e8eff8' },
  default: { bar: '#2c8047', chip: '#eaf3ec' },
}

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },
  title: { fontFamily: SANS, fontSize: '24px', fontWeight: 800, letterSpacing: '-0.015em', color: '#16311d', margin: 0 },
  titleMobile: { fontSize: '20px' },
  subtitle: { fontFamily: SANS, fontSize: '13.5px', color: '#6b7770', marginTop: '5px', marginBottom: '24px' },

  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' },
  statsGridMobile: { gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' },

  statCard: { fontFamily: SANS, background: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', padding: '20px 22px' },
  statCardMobile: { padding: '16px' },
  statTop: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '16px' },
  statBadge: { fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '999px' },
  statValue: { fontSize: '30px', fontWeight: 800, letterSpacing: '-0.02em', color: '#14301c', lineHeight: 1 },
  statValueMobile: { fontSize: '24px' },
  statLabel: { fontSize: '13px', fontWeight: 700, color: '#33413a', marginTop: '8px' },
  statFoot: { fontSize: '12px', color: '#8a968d', marginTop: '3px' },

  mainGrid: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: '16px', alignItems: 'start' },
  mainGridMobile: { gridTemplateColumns: '1fr', gap: '20px' },

  mapTitle: { fontFamily: SANS, fontSize: '15px', fontWeight: 700, color: '#16311d', margin: '0 0 4px' },
  mapSubtitle: { fontFamily: SANS, fontSize: '12.5px', color: '#8a968d', margin: '0 0 13px' },

  panel: { fontFamily: SANS, background: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', overflow: 'hidden' },
  panelHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 14px', borderBottom: '1px solid #f0efe8' },
  panelTitle: { fontSize: '15px', fontWeight: 700, color: '#16311d', margin: 0 },
  panelSub: { fontSize: '11.5px', color: '#8a968d', margin: '3px 0 0' },
  panelCount: { fontSize: '11px', fontWeight: 700, color: '#2c8047', background: '#eaf3ec', borderRadius: '999px', padding: '2px 9px' },
  panelBody: { padding: '4px 18px 12px' },

  emptyText: { fontSize: '13px', color: '#9aa79d' },
  row: { display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 0', borderBottom: '1px solid #f0efe8' },
  rowBar: { width: '4px', height: '34px', borderRadius: '2px', flexShrink: 0 },
  rowName: { fontSize: '13.5px', fontWeight: 600, color: '#16311d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowDetail: { fontSize: '11.5px', color: '#6b7770', marginTop: '2px' },
  rowTag: { fontSize: '10.5px', fontWeight: 700, padding: '3px 9px', borderRadius: '999px', whiteSpace: 'nowrap', flexShrink: 0 },
}