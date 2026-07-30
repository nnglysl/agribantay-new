import { useState } from 'react'
import AdminLayout from '../../components/AdminLayout'
import FarmMap from '../../components/FarmMap'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useMonthFilter, filterByMonth } from '../../hooks/useMonthFilter'

export default function SuperAdminDashboard() {
  const { data, loading, error } = useCachedFetch('/admin/dashboard')
  const { data: mapFarms } = useCachedFetch('/admin/farms-map')
  const { data: inspectionsData } = useCachedFetch('/admin/inspections')

  const { data: accounts } = useCachedFetch('/superadmin/accounts')
  const { data: adminReportData } = useCachedFetch('/admin/reports')
  const { data: vetReportData } = useCachedFetch('/vet/reports')

  const isMobile = useIsMobile()
  const [modalOpen, setModalOpen] = useState(null)

  const { month, prevMonth, nextMonth, label: monthLabel } = useMonthFilter()

  const allInspections = inspectionsData || []
  const monthInspections = filterByMonth(allInspections, month)
  const upcomingThisMonth = monthInspections
    .filter(i => i.status === 'Scheduled')
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))

  const totalAdmins = (accounts || []).filter(a => a.role === 'admin').length
  const totalVets = (accounts || []).filter(a => a.role === 'vet').length
  const pendingAdminServices = adminReportData?.service_summary?.pending ?? 0
  const pendingVetServices = vetReportData?.total_pending ?? 0

  if (loading) return <AdminLayout><p style={{ fontSize: '14px', color: '#6b7770' }}>Loading...</p></AdminLayout>
  if (error) return <AdminLayout><p style={{ color: '#dc2626' }}>{error}</p></AdminLayout>

  return (
    <AdminLayout>
      <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Dashboard</h1>
      <p style={styles.subtitle}>Welcome back, Super Administrator</p>

      <div style={{ ...styles.statsGrid, ...(isMobile ? styles.statsGridMobile : {}) }}>
        <StatCard value={totalAdmins} label="Admin Accounts" isMobile={isMobile} />
        <StatCard value={totalVets} label="Veterinarian Accounts" isMobile={isMobile} />
        <StatCard value={data.total_farms} label="Total Farms" isMobile={isMobile} />
      </div>

      <h3 style={styles.mapTitle}>Farm monitoring map</h3>
      <div style={styles.mapWrap}>
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
      </div>
      <p style={styles.mapNote}>
        Note: Critical Alerts reflect live sensor status and aren't affected by the month filter above — only Inspections are month-scoped.
      </p>

      {modalOpen === 'critical' && (
        <ListModal
          title="Critical Alerts"
          onClose={() => setModalOpen(null)}
          isMobile={isMobile}
        >
          {data.critical_farms.length === 0 && (
            <p style={styles.emptyText}>No critical alerts right now.</p>
          )}
          {data.critical_farms.map(f => (
            <div key={f.farm_id} style={styles.alertRow}>
              <div style={styles.alertBar} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.alertTopRow}>
                  <span style={styles.alertFarm}>{f.farm_name}</span>
                  <span style={styles.critBadge}>{f.critical_count} Critical</span>
                </div>
                <div style={styles.sensorTableRow}>
                  {(f.all_sensors || []).map(s => (
                    <div key={s.type} style={styles.sensorCell}>
                      <span style={styles.sensorCellLabel}>{s.type}</span>
                      <span style={{ ...styles.sensorCellValue, ...(s.critical ? styles.sensorCellValueCritical : {}) }}>
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
        <ListModal
          title={`Inspections — ${monthLabel}`}
          onClose={() => setModalOpen(null)}
          isMobile={isMobile}
        >
          {monthInspections.length === 0 && (
            <p style={styles.emptyText}>No inspections scheduled for {monthLabel}.</p>
          )}
          {monthInspections.map(i => {
            const followUp = i.inspection_type === 'Follow-up'
            return (
              <div key={i.id} style={styles.alertRow}>
                <div style={{ ...styles.alertBar, backgroundColor: followUp ? '#e0a24a' : '#2f6bb0' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.alertFarm}>{i.farm_name}</div>
                  <div style={styles.alertDetail}>
                    {new Date(i.scheduled_at).toLocaleDateString()} · {i.inspection_type}
                  </div>
                </div>
                <span style={{ ...styles.softBadge, color: followUp ? '#b45309' : '#2f6bb0', backgroundColor: followUp ? '#fbf1e2' : '#e8eff8' }}>
                  {followUp ? 'Follow-up' : 'General'}
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
      <div
        style={{ ...modalStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }}
        onClick={e => e.stopPropagation()}
      >
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>{title}</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>
        <div style={modalStyles.body}>
          {children}
        </div>
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

const styles = {
  title: { fontSize: '24px', fontWeight: 800, letterSpacing: '-0.015em', color: '#16311d', margin: 0 },
  titleMobile: { fontSize: '20px' },
  subtitle: { fontSize: '13.5px', color: '#6b7770', marginTop: '5px', marginBottom: '24px' },

  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '28px' },
  statsGridMobile: { gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '20px' },

  statCard: {
    background: '#234A35', border: '1px solid #1b3a29', borderRadius: '14px', padding: '20px 22px',
  },
  statCardMobile: { padding: '14px 16px' },

  statValue: { fontSize: '30px', fontWeight: 800, letterSpacing: '-0.02em', color: '#ffffff', lineHeight: 1 },
  statValueMobile: { fontSize: '24px' },
  statLabel: { fontSize: '13px', fontWeight: 700, color: '#eaf3ec', marginTop: '8px' },
  statFoot: { fontSize: '12px', color: '#a9c6b3', marginTop: '3px' },

  mapTitle: { fontSize: '15px', fontWeight: 700, color: '#16311d', marginTop: '4px', marginBottom: '12px' },
  mapWrap: { border: '1px solid #e7e8e0', borderRadius: '14px', overflow: 'hidden' },
  mapNote: { fontSize: '11.5px', color: '#9aa79d', marginTop: '12px', lineHeight: 1.5 },

  emptyText: { fontSize: '13px', color: '#9aa79d' },
  alertRow: {
    display: 'flex', alignItems: 'flex-start', gap: '12px',
    padding: '13px 0', borderBottom: '1px solid #f0efe8',
  },
  alertTopRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' },
  alertBar: { width: '4px', height: '34px', backgroundColor: '#dc2626', borderRadius: '2px', flexShrink: 0 },
  alertFarm: { fontSize: '14px', fontWeight: 700, color: '#16311d' },
  alertDetail: { fontSize: '12px', color: '#6b7770', marginTop: '2px' },
  critBadge: { padding: '4px 10px', borderRadius: '999px', color: '#dc2626', backgroundColor: '#fbeaea', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 },
  softBadge: { padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 },

  sensorTableRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginTop: '8px' },
  sensorCell: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start' },
  sensorCellLabel: { fontSize: '9.5px', fontWeight: 700, color: '#9aa79d', textTransform: 'uppercase', letterSpacing: '0.02em' },
  sensorCellValue: { fontSize: '12px', fontWeight: 700, color: '#4b5a50', marginTop: '2px' },
  sensorCellValueCritical: { color: '#dc2626' },
}

const modalStyles = {
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(16,44,27,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
  },
  modal: {
    backgroundColor: '#fff', borderRadius: '16px', padding: '24px',
    width: '480px', maxWidth: '90%', maxHeight: '80vh', overflowY: 'auto', border: '1px solid #e7e8e0',
  },
  modalMobile: {
    width: '100%', maxWidth: '100%', borderRadius: '16px 16px 0 0',
    padding: '20px', margin: '0', position: 'fixed', bottom: 0, left: 0,
    maxHeight: '80vh',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  title: { fontSize: '17px', fontWeight: 700, color: '#16311d', margin: 0 },
  close: { fontSize: '22px', cursor: 'pointer', color: '#8a968d' },
  body: { display: 'flex', flexDirection: 'column' },
}