import { useState } from 'react'
import { GREEN } from '../../theme/green'
import FarmIcon from '../../components/farm-details/FarmIcon'
import AdminLayout from '../../components/AdminLayout'
import FarmMap from '../../components/FarmMap'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { BACKGROUND_POLL_MS } from '../../constants/polling'
import { useIsMobile } from '../../hooks/useIsMobile'
import { DISPLAY_TIME_ZONE } from '../../utils/formatDate'
import { SkeletonStatCards, SkeletonBlock } from '../../components/Loading'

export default function AdminDashboard() {
  const { data, loading, error } = useCachedFetch('/admin/dashboard', {}, { pollMs: BACKGROUND_POLL_MS })
  const { data: mapFarms } = useCachedFetch('/admin/farms-map', {}, { pollMs: BACKGROUND_POLL_MS })
  const { data: inspectionsData } = useCachedFetch('/admin/inspections', {}, { pollMs: BACKGROUND_POLL_MS })
  const isMobile = useIsMobile()
  const [modalOpen, setModalOpen] = useState(null)

  // Dashboard = current operational state, not a historical/date-range
  // view (that's what Reports is for) — every list below is the live set
  // of records still in an active status, with no month/year filtering.
  const allInspections = inspectionsData || []
  const scheduledInspections = allInspections
    .filter(i => i.status === 'Scheduled')
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))






  if (loading) return <AdminLayout><SkeletonStatCards count={3} columns={`repeat(${isMobile ? 2 : 3}, minmax(0, 1fr))`} /><SkeletonBlock height={320} /></AdminLayout>
  if (error) return <AdminLayout><p style={{ ...styles.stateText, color: '#b91c1c' }}>{error}</p></AdminLayout>

  return (
    <AdminLayout>
      <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Dashboard</h1>
      <p style={styles.subtitle}>Welcome back, Staff</p>
      <div className="staff-dashboard-stats" style={{ ...styles.statsGrid, ...(isMobile ? styles.statsGridMobile : {}) }}>
        <StatCard value={data.total_farms} label="Total Farms" icon="farm" isMobile={isMobile} />
        <StatCard value={scheduledInspections.length} label="Scheduled Inspections" icon="calendar" isMobile={isMobile} />
        <StatCard label="Annual Clean-out Compliance" icon="check" isMobile={isMobile} wideOnMobile foot={data.cleanout_compliance?.undetermined > 0 ? `Undetermined: ${data.cleanout_compliance.undetermined}` : null}>
          <dl style={styles.complianceCounts}>
            <div style={styles.complianceCount}>
              <dt style={styles.complianceLabel}>Compliant</dt>
              <dd style={{ ...styles.statValue, ...(isMobile ? styles.statValueMobile : {}) }}>{data.cleanout_compliance?.compliant ?? '—'}</dd>
            </div>
            <div style={{ ...styles.complianceCount, ...styles.complianceDivider }}>
              <dt style={styles.complianceLabel}>Non-Compliant</dt>
              <dd style={{ ...styles.statValue, ...(isMobile ? styles.statValueMobile : {}) }}>{data.cleanout_compliance?.non_compliant ?? '—'}</dd>
            </div>
          </dl>
        </StatCard>
      </div>

      <h3 style={styles.mapTitle}>Farm monitoring map</h3>
      <FarmMap
        farms={mapFarms || []}
        alerts={data.critical_farms}
        inspections={scheduledInspections}
        onSeeAllAlerts={() => setModalOpen('critical')}
        onSeeAllInspections={() => setModalOpen('inspections')}
      />
      {modalOpen === 'critical' && (
        <ListModal title="Critical Alerts" onClose={() => setModalOpen(null)} isMobile={isMobile}>
          {data.critical_farms.length === 0 && <p style={styles.emptyText}>No critical alerts right now.</p>}
          {data.critical_farms.map(f => (
            <div key={f.farm_id} style={styles.alertRow}>
              <div style={styles.alertBar} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.alertTopRow}>
                  <span style={styles.alertFarm}>{f.farm_name}</span>
                  <span style={{ ...styles.badge, backgroundColor: '#c0392b' }}>{f.critical_count} Critical</span>
                  {f.monitoring_assessment?.incomplete_data && <span>Incomplete Data</span>}
                </div>
                <div style={styles.sensorTableRow}>
                  {(f.all_sensors || []).map(s => (
                    <div key={s.type} style={styles.sensorCell}>
                      <span style={styles.sensorCellLabel}>{s.type}</span>
                      {/* Advisory metrics are shown for context — they are what
                          drives ammonia — but they can never be red here, so
                          they sit back a shade and let the two that can be
                          critical take the eye. */}
                      <span style={{
                        ...styles.sensorCellValue,
                        ...(s.advisory ? styles.sensorCellValueAdvisory : {}),
                        ...(s.critical ? styles.sensorCellValueCritical : {}),
                      }}>
                        {s.value ?? '—'}{s.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </ListModal>
      )}

      {modalOpen === 'inspections' && (
        <ListModal title="Scheduled Inspections" onClose={() => setModalOpen(null)} isMobile={isMobile}>
          {scheduledInspections.length === 0 && <p style={styles.emptyText}>No inspections currently scheduled.</p>}
          {scheduledInspections.map(i => {
            const c = i.inspection_type === 'Follow-up' ? '#d9880f' : '#2c8047'
            return (
              <div key={i.id} style={styles.alertRow}>
                <div style={{ ...styles.alertBar, backgroundColor: c }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.alertFarm}>{i.farm_name}</div>
                  <div style={styles.alertDetail}>
                    {new Date(i.scheduled_at).toLocaleDateString(undefined, { timeZone: DISPLAY_TIME_ZONE })} · {i.inspection_type}
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

function StatCard({ value, label, icon, foot, isMobile, wideOnMobile, children }) {
  return (
    <section className="staff-dashboard-stat" aria-label={label} style={{ ...styles.statCard, ...(isMobile ? styles.statCardMobile : {}), ...(isMobile && wideOnMobile ? { gridColumn: '1 / -1' } : {}) }}>
      <h2 style={{ ...styles.statLabel, ...(isMobile && !wideOnMobile ? { minHeight: '36px' } : {}) }}><span style={styles.statIcon}><FarmIcon name={icon} size={16} /></span><span>{label}</span></h2>
      {children || <div className="staff-dashboard-stat-value" style={{ ...styles.statValue, ...(isMobile ? styles.statValueMobile : {}) }}>{value}</div>}
      {foot && <div style={styles.statFoot}>{foot}</div>}
    </section>
  )
}

const SANS = "'Inter', sans-serif"

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },
  title: { fontFamily: SANS, fontSize: '24px', fontWeight: 800, letterSpacing: '-0.015em', color: '#16311d', margin: 0 },
  titleMobile: { fontSize: '20px' },
  subtitle: { fontFamily: SANS, fontSize: '13.5px', color: '#6b7770', marginTop: '5px', marginBottom: '24px' },

  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px', marginBottom: '28px' },
  statsGridMobile: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px', marginBottom: '20px' },

  statCard: { fontFamily: SANS, background: GREEN.primary, border: `1px solid ${GREEN.hover}`, borderRadius: '14px', padding: '16px 20px', minWidth: 0, minHeight: '108px', display: 'flex', flexDirection: 'column', gap: '8px' },
  statCardMobile: { padding: '14px 16px', minHeight: '104px' },
  statValue: { fontSize: '30px', fontWeight: 800, letterSpacing: '-0.02em', color: '#ffffff', lineHeight: 1.1, margin: 0 },
  statValueMobile: { fontSize: '24px' },
  statLabel: { fontSize: '13px', fontWeight: 600, color: GREEN.soft, margin: 0, lineHeight: 1.4, minHeight: '20px', display: 'flex', alignItems: 'center', gap: '8px' },
  statIcon: { display: 'inline-flex', flexShrink: 0 },
  statFoot: { fontSize: '12px', color: GREEN.soft, lineHeight: 1.4 },
  complianceCounts: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', margin: 0 },
  complianceCount: { minWidth: 0, display: 'flex', flexDirection: 'column' },
  complianceDivider: { borderLeft: '1px solid #ffffff40', paddingLeft: '16px', marginLeft: '8px' },
  complianceLabel: { fontSize: '12px', color: GREEN.soft, marginTop: '6px', lineHeight: 1.4, order: 1 },

  mapTitle: { fontFamily: SANS, fontSize: '15px', fontWeight: 700, color: '#16311d', marginTop: '20px', marginBottom: '13px' },

  emptyText: { fontFamily: SANS, fontSize: '13px', color: '#9aa79d' },
  alertRow: { display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 0', borderBottom: '1px solid #f0efe8' },
  alertTopRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' },
  alertBar: { width: '4px', height: '32px', backgroundColor: '#c0392b', borderRadius: '2px', flexShrink: 0 },
  alertFarm: { fontSize: '14px', fontWeight: 600, color: '#16311d' },
  alertDetail: { fontSize: '12px', color: '#6b7770', marginTop: '2px' },
  badge: { padding: '4px 10px', borderRadius: '999px', color: 'white', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 },

  sensorTableRow: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px', marginTop: '8px' },
  sensorCell: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start' },
  sensorCellLabel: { fontSize: '9.5px', fontWeight: 700, color: '#9aa79d', textTransform: 'uppercase', letterSpacing: '0.02em' },
  sensorCellValue: { fontSize: '12px', fontWeight: 700, color: '#4b5a50', marginTop: '2px' },
  sensorCellValueAdvisory: { color: '#8a968d', fontWeight: 600 },
  sensorCellValueCritical: { color: '#dc2626' },
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
