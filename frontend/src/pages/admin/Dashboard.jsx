import { useState } from 'react'
import AdminLayout from '../../components/AdminLayout'
import FarmMap from '../../components/FarmMap'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

const VISIBLE_LIMIT = 3

export default function AdminDashboard() {
  const { data, loading, error } = useCachedFetch('/admin/dashboard')
  const { data: mapFarms } = useCachedFetch('/admin/farms-map')
  const isMobile = useIsMobile()
  const [modalOpen, setModalOpen] = useState(null)

  if (loading) return <AdminLayout><p>Loading...</p></AdminLayout>
  if (error) return <AdminLayout><p style={{ color: '#dc2626' }}>{error}</p></AdminLayout>

  const visibleCritical = data.critical_farms.slice(0, VISIBLE_LIMIT)
  const visibleInspections = data.upcoming_inspections.slice(0, VISIBLE_LIMIT)

  return (
    <AdminLayout>
      <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Dashboard</h1>
      <p style={styles.subtitle}>Welcome back, Administrator</p>

      <div style={{ ...styles.statsGrid, ...(isMobile ? styles.statsGridMobile : {}) }}>
        <StatCard value={data.total_farms} label="Total Farms" isMobile={isMobile} />
        <StatCard value={data.active_requests} label="Active Requests" isMobile={isMobile} />
        <StatCard value={data.resolved_requests} label="Resolved Requests" isMobile={isMobile} />
      </div>

      <div style={{ ...styles.twoCol, ...(isMobile ? styles.twoColMobile : {}) }}>
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Critical Alerts</h3>
          {data.critical_farms.length === 0 && (
            <p style={styles.emptyText}>No critical alerts right now.</p>
          )}
          {visibleCritical.map(f => (
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
          {data.critical_farms.length > VISIBLE_LIMIT && (
            <button style={styles.seeMoreBtn} onClick={() => setModalOpen('critical')}>
              See more ({data.critical_farms.length - VISIBLE_LIMIT} more)
            </button>
          )}
        </div>

        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Upcoming Inspections</h3>
          {data.upcoming_inspections.length === 0 && (
            <p style={styles.emptyText}>No upcoming inspections.</p>
          )}
          {visibleInspections.map(i => (
            <div key={i.id} style={styles.alertRow}>
              <div style={{ ...styles.alertBar, backgroundColor: '#3b82f6' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.alertFarm}>{i.farm_name}</div>
                <div style={styles.alertDetail}>
                  📅 {new Date(i.scheduled_at).toLocaleDateString()} · {i.inspection_type}
                </div>
              </div>
              <span style={{ ...styles.badge, backgroundColor: '#3b82f6' }}>
                {i.inspection_type === 'Follow-up' ? 'Follow-up' : 'General'}
              </span>
            </div>
          ))}
          {data.upcoming_inspections.length > VISIBLE_LIMIT && (
            <button style={styles.seeMoreBtn} onClick={() => setModalOpen('inspections')}>
              See more ({data.upcoming_inspections.length - VISIBLE_LIMIT} more)
            </button>
          )}
        </div>
      </div>

      <div style={{ marginTop: '20px' }}>
        <h3 style={styles.panelTitle}>Farm monitoring map</h3>
        <div style={isMobile ? styles.mapWrapMobile : undefined}>
          <FarmMap farms={mapFarms || []} />
        </div>
      </div>

      {modalOpen === 'critical' && (
        <ListModal
          title="Critical Alerts"
          onClose={() => setModalOpen(null)}
          isMobile={isMobile}
        >
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
          title="Upcoming Inspections"
          onClose={() => setModalOpen(null)}
          isMobile={isMobile}
        >
          {data.upcoming_inspections.map(i => (
            <div key={i.id} style={styles.alertRow}>
              <div style={{ ...styles.alertBar, backgroundColor: '#3b82f6' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.alertFarm}>{i.farm_name}</div>
                <div style={styles.alertDetail}>
                  📅 {new Date(i.scheduled_at).toLocaleDateString()} · {i.inspection_type}
                </div>
              </div>
              <span style={{ ...styles.badge, backgroundColor: '#3b82f6' }}>
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

function StatCard({ value, label, isMobile }) {
  return (
    <div style={{ ...styles.statCard, ...(isMobile ? styles.statCardMobile : {}) }}>
      <div style={{ ...styles.statValue, ...(isMobile ? styles.statValueMobile : {}) }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  )
}

const styles = {
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  titleMobile: { fontSize: '18px' },
  subtitle: { fontSize: '13px', color: '#6B6B5F', marginTop: '4px', marginBottom: '24px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' },
  statsGridMobile: { gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '18px' },
  statCard: {
    backgroundColor: 'white', borderRadius: '12px', padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  statCardMobile: { padding: '14px' },
  statValue: { fontSize: '28px', fontWeight: '700', color: '#111827' },
  statValueMobile: { fontSize: '22px' },
  statLabel: { fontSize: '13px', color: '#6b7280', marginTop: '2px' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
  twoColMobile: { gridTemplateColumns: '1fr', gap: '12px' },
  panel: {
    backgroundColor: 'white', borderRadius: '12px', padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  panelTitle: { fontSize: '15px', fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: '16px' },
  emptyText: { fontSize: '13px', color: '#9ca3af' },
  alertRow: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '12px 0', borderBottom: '1px solid #f3f4f6',
  },
  alertBar: { width: '4px', height: '32px', backgroundColor: '#dc2626', borderRadius: '2px', flexShrink: 0 },
  alertFarm: { fontSize: '14px', fontWeight: '600', color: '#111827' },
  alertDetail: { fontSize: '12px', color: '#6b7280', marginTop: '2px' },
  badge: { padding: '4px 10px', borderRadius: '999px', color: 'white', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap', flexShrink: 0 },
  mapWrapMobile: { overflow: 'hidden', borderRadius: '12px' },
  seeMoreBtn: {
    display: 'block', width: '100%', textAlign: 'center',
    background: 'none', border: 'none', color: '#2E7D32',
    fontSize: '13px', fontWeight: '600', cursor: 'pointer',
    padding: '12px 0 2px',
  },
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