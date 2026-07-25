import { useState } from 'react'
import AdminLayout from '../../components/AdminLayout'
import FarmMap from '../../components/FarmMap'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useMonthFilter, filterByMonth } from '../../hooks/useMonthFilter'

export default function AdminDashboard() {
  const { data, loading, error } = useCachedFetch('/admin/dashboard')
  const { data: mapFarms } = useCachedFetch('/admin/farms-map')
  const { data: inspectionsData } = useCachedFetch('/admin/inspections')
  const isMobile = useIsMobile()
  const [modalOpen, setModalOpen] = useState(null)

  const { month, prevMonth, nextMonth, label: monthLabel } = useMonthFilter()

  const allInspections = inspectionsData || []
  const monthInspections = filterByMonth(allInspections, month)
  const upcomingThisMonth = monthInspections
    .filter(i => i.status === 'Scheduled')
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))

  if (loading) return <AdminLayout><p style={styles.stateText}>Loading...</p></AdminLayout>
  if (error) return <AdminLayout><p style={{ ...styles.stateText, color: '#b91c1c' }}>{error}</p></AdminLayout>

  return (
    <AdminLayout>
      <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Dashboard</h1>
      <p style={styles.subtitle}>Welcome back, Administrator</p>

       <div style={{ ...styles.statsGrid, ...(isMobile ? styles.statsGridMobile : {}) }}>
        <StatCard value={data.total_farms} label="Total Farms" isMobile={isMobile} />
        <StatCard value={data.active_requests} label="Active Requests" isMobile={isMobile} />
        <StatCard value={data.resolved_requests} label="Resolved Requests" isMobile={isMobile} />
      </div>

      <h3 style={styles.mapTitle}>Farm monitoring map</h3>
      <FarmMap
        farms={mapFarms || []}
        alerts={data.critical_farms}
        inspections={upcomingThisMonth}
        onSeeAllAlerts={() => setModalOpen('critical')}
        onSeeAllInspections={() => setModalOpen('inspections')}
        monthLabel={monthLabel}
        onPrevMonth={prevMonth}
        onNextMonth={nextMonth}
      />
      <p style={styles.mapNote}>
        Note: Critical Alerts reflect live sensor status and aren't affected by the month filter above — only Inspections are month-scoped.
      </p>

      {modalOpen === 'critical' && (
        <ListModal title="Critical Alerts" onClose={() => setModalOpen(null)} isMobile={isMobile}>
          {data.critical_farms.length === 0 && <p style={styles.emptyText}>No critical alerts right now.</p>}
          {data.critical_farms.map(f => (
            <div key={f.farm_id} style={styles.alertRow}>
              <div style={styles.alertBar} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.alertFarm}>{f.farm_name}</div>
                <div style={styles.alertDetail}>Ammonia {f.ammonia} ppm</div>
              </div>
              <span style={{ ...styles.badge, backgroundColor: '#c0392b' }}>{f.ammonia_status}</span>
            </div>
          ))}
        </ListModal>
      )}

      {modalOpen === 'inspections' && (
        <ListModal title={`Inspections — ${monthLabel}`} onClose={() => setModalOpen(null)} isMobile={isMobile}>
          {monthInspections.length === 0 && <p style={styles.emptyText}>No inspections scheduled for {monthLabel}.</p>}
          {monthInspections.map(i => {
            const c = i.inspection_type === 'Follow-up' ? '#d9880f' : '#2c8047'
            return (
              <div key={i.id} style={styles.alertRow}>
                <div style={{ ...styles.alertBar, backgroundColor: c }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.alertFarm}>{i.farm_name}</div>
                  <div style={styles.alertDetail}>
                    {new Date(i.scheduled_at).toLocaleDateString()} · {i.inspection_type}
                  </div>
                </div>
                <span style={{ ...styles.badge, backgroundColor: c }}>
                  {i.inspection_type === 'Follow-up' ? 'Follow-up' : 'General'}
                </span>
              </div>
            )
          })}
        </ListModal>
      )}
    </AdminLayout>
  )
}

function ListModal({ title, onClose, children, isMobile }) {
  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={{ ...modalStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>{title}</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>
        <div style={modalStyles.body}>{children}</div>
      </div>
    </div>
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

const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

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

  mapTitle: { fontFamily: SANS, fontSize: '15px', fontWeight: 700, color: '#16311d', marginTop: '20px', marginBottom: '13px' },
  mapNote: { fontFamily: SANS, fontSize: '11.5px', color: '#9aa79d', marginTop: '12px', lineHeight: 1.5 },

  emptyText: { fontFamily: SANS, fontSize: '13px', color: '#9aa79d' },
  alertRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid #f0efe8' },
  alertBar: { width: '4px', height: '32px', backgroundColor: '#c0392b', borderRadius: '2px', flexShrink: 0 },
  alertFarm: { fontSize: '14px', fontWeight: 600, color: '#16311d' },
  alertDetail: { fontSize: '12px', color: '#6b7770', marginTop: '2px' },
  badge: { padding: '4px 10px', borderRadius: '999px', color: 'white', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 },
}

const modalStyles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(15,38,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  modal: { fontFamily: SANS, backgroundColor: 'white', borderRadius: '16px', padding: '24px', width: '480px', maxWidth: '90%', maxHeight: '80vh', overflowY: 'auto' },
  modalMobile: { width: '100%', maxWidth: '100%', borderRadius: '16px 16px 0 0', padding: '20px', margin: 0, position: 'fixed', bottom: 0, left: 0, maxHeight: '80vh' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  title: { fontSize: '17px', fontWeight: 800, color: '#16311d', margin: 0 },
  close: { fontSize: '24px', cursor: 'pointer', color: '#8a968d', lineHeight: 1 },
  body: { display: 'flex', flexDirection: 'column' },
}