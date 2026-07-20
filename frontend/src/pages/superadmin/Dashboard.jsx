import { useState } from 'react'
import AdminLayout from '../../components/AdminLayout'
import FarmMap from '../../components/FarmMap'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useMonthFilter, filterByMonth } from '../../hooks/useMonthFilter'

export default function SuperAdminDashboard() {
  // Reused as-is from the Admin dashboard — Critical Alerts and the
  // Farm Monitoring Map genuinely are system-wide oversight info, not
  // day-to-day operational busywork, so they stay here unchanged.
  const { data, loading, error } = useCachedFetch('/admin/dashboard')
  const { data: mapFarms } = useCachedFetch('/admin/farms-map')
  const { data: inspectionsData } = useCachedFetch('/admin/inspections')

  // New for Super Admin — account counts and cross-role pending totals,
  // none of which the Admin dashboard shows.
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

  if (loading) return <AdminLayout><p>Loading...</p></AdminLayout>
  if (error) return <AdminLayout><p style={{ color: '#dc2626' }}>{error}</p></AdminLayout>

  return (
    <AdminLayout>
      <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Dashboard</h1>
      <p style={styles.subtitle}>Welcome back, Super Administrator</p>

      <div style={{ ...styles.statsGrid, ...(isMobile ? styles.statsGridMobile : {}) }}>
        <StatCard
          value={totalAdmins}
          label="Admin Accounts"
          foot="Agriculture & Environmental Offices"
          variant="green"
          isMobile={isMobile}
        />
        <StatCard
          value={totalVets}
          label="Veterinarian Accounts"
          foot="Registered vets"
          variant="green"
          isMobile={isMobile}
        />
        <StatCard
          value={data.total_farms}
          label="Total Farms"
          foot="Registered in San Jose"
          variant="clay"
          isMobile={isMobile}
        />
        <StatCard
          value={pendingAdminServices}
          label="Pending — Admin"
          foot="Odor & fly control requests"
          variant="gold"
          isMobile={isMobile}
        />
        <StatCard
          value={pendingVetServices}
          label="Pending — Veterinary"
          foot="Vaccine & blood test requests"
          variant="gold"
          isMobile={isMobile}
        />
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
                <div style={styles.alertFarm}>{f.farm_name}</div>
                <div style={styles.alertDetail}>Ammonia {f.ammonia} ppm</div>
              </div>
              <span style={{ ...styles.badge, backgroundColor: '#dc2626' }}>
                {f.ammonia_status}
              </span>
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
          {monthInspections.map(i => (
            <div key={i.id} style={styles.alertRow}>
              <div style={{ ...styles.alertBar, backgroundColor: i.inspection_type === 'Follow-up' ? '#f59e0b' : '#3b82f6' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.alertFarm}>{i.farm_name}</div>
                <div style={styles.alertDetail}>
                  📅 {new Date(i.scheduled_at).toLocaleDateString()} · {i.inspection_type}
                </div>
              </div>
              <span style={{ ...styles.badge, backgroundColor: i.inspection_type === 'Follow-up' ? '#f59e0b' : '#3b82f6' }}>
                {i.inspection_type === 'Follow-up' ? 'Follow-up' : 'General'}
              </span>
            </div>
          ))}
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
  subtitle: { fontSize: '13px', color: '#6B6B5F', marginTop: '4px', marginBottom: '20px' },

  // auto-fit instead of a fixed repeat(3,...) — 5 cards now instead of 3
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '20px' },
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

  mapTitle: { fontSize: '15px', fontWeight: '700', color: '#111827', marginTop: '20px', marginBottom: '12px' },
  mapNote: { fontSize: '11.5px', color: '#9ca3af', marginTop: '10px', lineHeight: '1.5' },

  emptyText: { fontSize: '13px', color: '#9ca3af' },
  alertRow: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '12px 0', borderBottom: '1px solid #f3f4f6',
  },
  alertBar: { width: '4px', height: '32px', backgroundColor: '#dc2626', borderRadius: '2px', flexShrink: 0 },
  alertFarm: { fontSize: '14px', fontWeight: '600', color: '#111827' },
  alertDetail: { fontSize: '12px', color: '#6b7280', marginTop: '2px' },
  badge: { padding: '4px 10px', borderRadius: '999px', color: 'white', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap', flexShrink: 0 },
}

const modalStyles = {
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
  },
  modal: {
    backgroundColor: 'white', borderRadius: '16px', padding: '24px',
    width: '480px', maxWidth: '90%', maxHeight: '80vh', overflowY: 'auto',
  },
  modalMobile: {
    width: '100%', maxWidth: '100%', borderRadius: '16px 16px 0 0',
    padding: '20px', margin: '0', position: 'fixed', bottom: 0, left: 0,
    maxHeight: '80vh',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  title: { fontSize: '17px', fontWeight: '700', color: '#111827', margin: 0 },
  close: { fontSize: '22px', cursor: 'pointer', color: '#6b7280' },
  body: { display: 'flex', flexDirection: 'column' },
}