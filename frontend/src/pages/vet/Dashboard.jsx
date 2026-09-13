import { useEffect, useMemo, useState, useRef, useLayoutEffect, useCallback } from 'react'
import VetLayout from '../../components/VetLayout'
import VetScheduleMap from '../../components/VetScheduleMap'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

export default function VetDashboard() {
  const { data, loading, error, refetch } = useCachedFetch('/vet/dashboard')
  const isMobile = useIsMobile()

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
      <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Dashboard</h1>
      <p style={styles.subtitle}>Wellcome back, {data.vet_name || 'Doctor'}</p>

      <div style={{ ...styles.statsGrid, ...(isMobile ? styles.statsGridMobile : {}) }}>
        <StatCard value={data.assigned_requests ?? 0} label="Assigned Requests" isMobile={isMobile} />
        <StatCard value={data.pending ?? 0} label="Pending" isMobile={isMobile} />
        <StatCard value={data.completed ?? 0} label="Completed" isMobile={isMobile} />
      </div>

      <h3 style={styles.mapTitle}>Scheduled Visits Map</h3>
      <p style={styles.mapSubtitle}>
        Farms with confirmed vaccination or blood test schedules
      </p>

      <div style={{ ...styles.mainGrid, ...(isMobile ? styles.mainGridMobile : {}) }}>
        <VetScheduleMap requests={mapRequests} />
        <ScheduledPanel items={scheduled} isMobile={isMobile} />
      </div>
    </VetLayout>
  )
}

function StatCard({ value, label, foot, isMobile }) {
  return (
    <div style={{ ...styles.statCard, ...(isMobile ? styles.statCardMobile : {}) }}>
      <div style={{ ...styles.statValue, ...(isMobile ? styles.statValueMobile : {}) }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
      {foot && <div style={styles.statFoot}>{foot}</div>}
    </div>
  )
}

const TABS = ['Vaccine', 'Blood Test']
const ITEM_HEIGHT = 60 // matches FarmMap's list row height (Admin Dashboard)

function ScheduledPanel({ items, isMobile, onSeeAll }) {
  const [tab, setTab] = useState('Vaccine')
  const [visibleCount, setVisibleCount] = useState(4)
  const listRef = useRef(null)

  const filtered = useMemo(
    () => items.filter(i => (i.service_type || '').replace(' Request', '') === tab),
    [items, tab]
  )

  // Fit as many rows as the list area can show, then hide the rest.
  const recomputeFit = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const fits = Math.max(1, Math.floor(el.clientHeight / ITEM_HEIGHT))
    setVisibleCount(prev => (prev === fits ? prev : fits))
  }, [])

  useLayoutEffect(() => {
    recomputeFit()
    const el = listRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(recomputeFit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [recomputeFit, tab, filtered.length])

  const visible = filtered.slice(0, visibleCount)
  const hiddenCount = Math.max(0, filtered.length - visible.length)

  return (
    <section style={{ ...styles.panel, ...(isMobile ? styles.panelMobile : {}) }}>
      <div style={styles.tabsWrap}>
        <div style={styles.tabs}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{ ...styles.tab, ...(t === tab ? styles.tabActive : {}) }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.panelHead}>
        <div style={styles.panelHeadLeft}>
          <span style={styles.panelTitle}>{tab === 'Blood Test' ? 'Blood Tests' : 'Vaccinations'}</span>
          <div style={styles.panelSub}>Upcoming activities</div>
        </div>
        <span style={styles.panelCount}>{filtered.length}</span>
      </div>

      <div ref={listRef} style={styles.panelBody}>
        {visible.length === 0 && <div style={styles.emptyText}>No {tab.toLowerCase()} activities scheduled.</div>}
        {visible.map((r, i) => {
          const type = (r.service_type || 'Visit').replace(' Request', '')
          const color = REQ_COLOR[type] || REQ_COLOR.default
          return (
            <div key={r.id ?? i} style={styles.row}>
              <span style={{ ...styles.rowDot, backgroundColor: color }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.rowName}>{r.farm_name}</div>
                <div style={styles.rowDetail}>
                  {new Date(r.scheduled_at).toLocaleDateString()} · {type}
                </div>
              </div>
              <span style={{ ...styles.rowTag, color }}>{type}</span>
            </div>
          )
        })}
      </div>

      {hiddenCount > 0 && (
        <button style={styles.seeAll} onClick={() => onSeeAll?.(tab)}>
          See all ({hiddenCount} more)
        </button>
      )}
    </section>
  )
}

const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const REQ_COLOR = {
  Vaccine: '#2c8047',
  'Blood Test': '#2f6bb0',
  Consultation: '#b45309',
  Visit: '#2c8047',
  default: '#2c8047',
}

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },
  title: { fontFamily: SANS, fontSize: '24px', fontWeight: 800, letterSpacing: '-0.015em', color: '#16311d', margin: 0 },
  titleMobile: { fontSize: '20px' },
  subtitle: { fontFamily: SANS, fontSize: '13.5px', color: '#6b7770', marginTop: '5px', marginBottom: '24px' },

  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '28px' },
  statsGridMobile: { gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' },

  statCard: { fontFamily: SANS, background: '#234A35', border: '1px solid #1c3c2b', borderRadius: '14px', padding: '20px 22px' },
  statCardMobile: { padding: '16px' },
  statValue: { fontSize: '30px', fontWeight: 800, letterSpacing: '-0.02em', color: '#ffffff', lineHeight: 1 },
  statValueMobile: { fontSize: '24px' },
  statLabel: { fontSize: '13px', fontWeight: 700, color: '#eaf3ec', marginTop: '8px' },
  statFoot: { fontSize: '12px', color: 'rgba(234,243,236,0.7)', marginTop: '3px' },

  mapTitle: { fontFamily: SANS, fontSize: '15px', fontWeight: 700, color: '#16311d', margin: '0 0 4px' },
  mapSubtitle: { fontFamily: SANS, fontSize: '12.5px', color: '#8a968d', margin: '0 0 13px' },

  mainGrid: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: '16px', alignItems: 'start' },
  mainGridMobile: { gridTemplateColumns: '1fr', gap: '20px' },

  // Fixed height on desktop so the list can fill the space and "See all" is meaningful.
  // Mirrors FarmMap's side-panel container (Admin Dashboard) so the two look identical.
  panel: { fontFamily: SANS, background: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '520px' },
  panelMobile: { height: 'auto', maxHeight: '460px' },

  tabsWrap: { padding: '12px', borderBottom: '1px solid #eceee7', flexShrink: 0 },
  tabs: { display: 'flex', gap: '3px', background: '#f3f4ef', borderRadius: '10px', padding: '3px' },
  tab: {
    flex: 1, fontFamily: SANS, fontSize: '12.5px', fontWeight: 700, color: '#6b7770', cursor: 'pointer',
    background: 'transparent', border: 'none', borderRadius: '8px', padding: '8px', textAlign: 'center',
  },
  tabActive: { background: '#2c8047', color: '#fff' },

  panelHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', padding: '14px 16px 10px', flexShrink: 0 },
  panelHeadLeft: { minWidth: 0 },
  panelTitle: { fontSize: '13px', fontWeight: 800, color: '#16311d' },
  panelSub: { fontSize: '11px', color: '#8a968d', fontWeight: 600, marginTop: '6px' },
  panelCount: { fontSize: '11px', fontWeight: 700, color: '#2c8047', background: '#eaf3ec', borderRadius: '999px', padding: '3px 9px', flexShrink: 0 },

  panelBody: { overflowY: 'auto', padding: '0 8px', flex: 1, minHeight: 0 },
  emptyText: { padding: '18px 8px', textAlign: 'center', fontSize: '12.5px', color: '#9aa79d' },
  row: { display: 'flex', alignItems: 'flex-start', gap: '11px', padding: '11px 8px', borderRadius: '9px' },
  rowDot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, marginTop: '3px' },
  rowName: { fontSize: '13px', fontWeight: 700, color: '#16311d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowDetail: { fontSize: '11px', color: '#8a968d', marginTop: '1px' },
  rowTag: { fontSize: '10.5px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 },

  seeAll: { border: 'none', borderTop: '1px solid #eceee7', background: 'transparent', color: '#2c8047', fontSize: '12px', fontWeight: 700, padding: '12px', cursor: 'pointer', fontFamily: SANS, flexShrink: 0 },
}