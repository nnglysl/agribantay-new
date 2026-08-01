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
      <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>
        Welcome back, {data.vet_name || 'Doctor'}
      </h1>
      <p style={styles.subtitle}>Municipal Veterinarian — San Jose, Batangas</p>

      <div style={{ ...styles.statsGrid, ...(isMobile ? styles.statsGridMobile : {}) }}>
        <StatCard value={data.assigned_requests ?? 0} label="Assigned Requests" foot="All requests routed to you" isMobile={isMobile} />
        <StatCard value={data.pending ?? 0} label="Pending" foot="Awaiting action" isMobile={isMobile} />
        <StatCard value={data.completed ?? 0} label="Completed" foot="Closed out" isMobile={isMobile} />
      </div>

      <h3 style={styles.mapTitle}>Scheduled visits map</h3>
      <p style={styles.mapSubtitle}>
        Farms with a confirmed vaccination or blood test date
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
const ITEM_HEIGHT = 61 // one row incl. padding + divider

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

      <div style={styles.panelHead}>
        <div>
          <h3 style={styles.panelTitle}>{tab === 'Blood Test' ? 'Blood Tests' : 'Vaccinations'}</h3>
          <p style={styles.panelSub}>Upcoming activities</p>
        </div>
        <span style={styles.panelCount}>{filtered.length}</span>
      </div>

      <div ref={listRef} style={styles.panelBody}>
        {visible.length === 0 && <p style={styles.emptyText}>No {tab.toLowerCase()} activities scheduled.</p>}
        {visible.map((r, i) => {
          const type = (r.service_type || 'Visit').replace(' Request', '')
          const c = REQ_COLOR[type] || REQ_COLOR.default
          return (
            <div key={r.id ?? i} style={styles.row}>
              <div style={{ ...styles.rowBar, backgroundColor: c.bar }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.rowName}>{r.farm_name}</div>
                <div style={styles.rowDetail}>
                  {new Date(r.scheduled_at).toLocaleDateString()} · {type}
                </div>
              </div>
              <span style={{ ...styles.rowTag, color: c.bar, background: c.chip }}>{type}</span>
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
  Vaccine: { bar: '#2c8047', chip: '#eaf3ec' },
  'Blood Test': { bar: '#2f6bb0', chip: '#e8eff8' },
  Consultation: { bar: '#b45309', chip: '#fbf1e2' },
  Visit: { bar: '#2c8047', chip: '#eaf3ec' },
  default: { bar: '#2c8047', chip: '#eaf3ec' },
}

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },
  title: { fontFamily: SANS, fontSize: '24px', fontWeight: 800, letterSpacing: '-0.015em', color: '#16311d', margin: 0 },
  titleMobile: { fontSize: '20px' },
  subtitle: { fontFamily: SANS, fontSize: '13.5px', color: '#6b7770', marginTop: '5px', marginBottom: '24px' },

  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' },
  statsGridMobile: { gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' },

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
  panel: { fontFamily: SANS, background: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '520px' },
  panelMobile: { height: 'auto', maxHeight: '460px' },

  tabs: { display: 'flex', gap: '4px', margin: '14px 18px 0', padding: '4px', background: '#f4f5f0', border: '1px solid #e7e8e0', borderRadius: '10px', flexShrink: 0 },
  tab: {
    flex: 1, fontFamily: SANS, fontSize: '13px', fontWeight: 700, color: '#6b7770', cursor: 'pointer',
    background: 'transparent', border: 'none', borderRadius: '7px', padding: '8px', textAlign: 'center',
  },
  tabActive: { background: '#2c8047', color: '#fff' },

  panelHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 12px', borderBottom: '1px solid #f0efe8', flexShrink: 0 },
  panelTitle: { fontSize: '15px', fontWeight: 700, color: '#16311d', margin: 0 },
  panelSub: { fontSize: '11.5px', color: '#8a968d', margin: '3px 0 0' },
  panelCount: { fontSize: '11px', fontWeight: 700, color: '#2c8047', background: '#eaf3ec', borderRadius: '999px', padding: '2px 9px' },

  panelBody: { padding: '4px 18px', flex: 1, minHeight: 0, overflowY: 'auto' },
  emptyText: { fontSize: '13px', color: '#9aa79d', padding: '12px 0' },
  row: { display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 0', borderBottom: '1px solid #f0efe8' },
  rowBar: { width: '4px', height: '34px', borderRadius: '2px', flexShrink: 0 },
  rowName: { fontSize: '13.5px', fontWeight: 600, color: '#16311d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowDetail: { fontSize: '11.5px', color: '#6b7770', marginTop: '2px' },
  rowTag: { fontSize: '10.5px', fontWeight: 700, padding: '3px 9px', borderRadius: '999px', whiteSpace: 'nowrap', flexShrink: 0 },

  seeAll: { border: 'none', borderTop: '1px solid #f0efe8', background: 'transparent', color: '#2c8047', fontSize: '12px', fontWeight: 700, padding: '13px', cursor: 'pointer', fontFamily: SANS, flexShrink: 0 },
}