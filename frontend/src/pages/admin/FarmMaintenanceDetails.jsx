import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AdminLayout from '../../components/AdminLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

const STATUS_COLOR = { Overdue: '#b45309', 'Non-Compliant': '#b91c1c' }
const STATUS_BG = { Overdue: '#fbf1e2', 'Non-Compliant': '#fbeaea' }

const RECENT_NOTIFICATIONS_LIMIT = 3

export default function FarmMaintenanceDetails() {
  const { farmId } = useParams()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [showAllNotifications, setShowAllNotifications] = useState(false)

  const { data, loading, error } = useCachedFetch(`/admin/maintenance/${farmId}/details`)

  const farm = data?.farm
  const m = data?.maintenance
  const notifications = data?.notifications || []
  const recentNotifications = notifications.slice(0, RECENT_NOTIFICATIONS_LIMIT)

  return (
    <AdminLayout>
      <button type="button" style={styles.backBtn} onClick={() => navigate('/admin/maintenance/overdue')}>
        ← Back
      </button>

      {loading && <p style={styles.stateText}>Loading...</p>}
      {error && <p style={{ ...styles.stateText, color: '#b91c1c' }}>{error}</p>}

      {farm && m && (
        <>
          <div style={styles.headerCard}>
            <div>
              <div style={styles.farmName}>{farm.farm_name}</div>
              <div style={styles.ownerSub}>{farm.owner_name} · {farm.barangay}</div>
            </div>
            <span style={{
              ...styles.statusPill,
              color: STATUS_COLOR[m.status] || '#6b7280',
              backgroundColor: STATUS_BG[m.status] || '#eef1ea',
            }}>
              {m.status}
            </span>
          </div>

          <div style={{ ...styles.infoColumns, ...(isMobile ? styles.infoColumnsMobile : {}) }}>
            <div style={styles.infoColumn}>
              <Card title="Farm Information">
                <div style={{ ...acctStyles.row, ...(isMobile ? acctStyles.rowMobile : {}) }}>
                  <InfoField label="Farm Owner" value={farm.owner_name} />
                  <InfoField label="Contact Number" value={farm.mobile_number} />
                </div>

                <div style={styles.sectionDivider}>
                  <span style={styles.sectionDividerLabel}>Farm Details</span>
                </div>

                <div style={{ ...acctStyles.row, ...(isMobile ? acctStyles.rowMobile : {}) }}>
                  <InfoField label="Farm ID" value={farm.id} />
                  <InfoField label="Farm Name" value={farm.farm_name} />
                </div>
                <div style={{ ...acctStyles.row, ...(isMobile ? acctStyles.rowMobile : {}) }}>
                  <InfoField label="Farm Type" value={farm.farm_type} />
                  <InfoField label="Location" value={farm.barangay} />
                </div>
                <div style={{ ...acctStyles.row, ...(isMobile ? acctStyles.rowMobile : {}) }}>
                  <InfoField label="Farm Size" value={farm.farm_size} />
                  <InfoField label="Registration Date" value={farm.created_at} />
                </div>
              </Card>
            </div>

            <div style={styles.infoColumn}>
              <Card title="Maintenance Overview" badge={m.status} badgeColor={STATUS_COLOR[m.status] || '#6b7280'}>
                <div style={{ ...acctStyles.row, ...(isMobile ? acctStyles.rowMobile : {}) }}>
                  <InfoField label="Expected Clean-out Date" value={m.due_date} />
                  <InfoField label="Last Clean-out Date" value={m.last_performed_at} />
                </div>
                <div style={{ ...acctStyles.row, ...(isMobile ? acctStyles.rowMobile : {}) }}>
                  <InfoField
                    label="Days Overdue"
                    value={m.days_overdue === 0 ? 'Due Today' : `${m.days_overdue} day${m.days_overdue === 1 ? '' : 's'}`}
                  />
                  <InfoField label="Grace Period Status" value={m.grace_status} />
                </div>
              </Card>

              <Card title="SMS / Notification History">
                {notifications.length === 0 ? (
                  <p style={panelStyles.emptyText}>No notifications sent yet for this farm.</p>
                ) : (
                  <>
                    {recentNotifications.map((n, i) => (
                      <div key={i} style={{ ...panelStyles.notifRow, ...(i === recentNotifications.length - 1 ? panelStyles.rowLast : {}) }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={panelStyles.notifTopRow}>
                            <span style={panelStyles.notifTitle}>{n.event}</span>
                            <span style={{ ...panelStyles.notifStatus, color: n.status === 'Sent' ? '#256b3d' : '#b91c1c' }}>
                              {n.status}
                            </span>
                          </div>
                          <div style={panelStyles.notifDesc}>{n.description}</div>
                          <div style={panelStyles.notifTime}>{n.sent_at}</div>
                        </div>
                      </div>
                    ))}
                    {notifications.length > RECENT_NOTIFICATIONS_LIMIT && (
                      <button type="button" style={panelStyles.viewAllBtn} onClick={() => setShowAllNotifications(true)}>
                        View All Notifications ({notifications.length})
                      </button>
                    )}
                  </>
                )}
              </Card>
            </div>
          </div>

          {showAllNotifications && (
            <div style={modalStyles.overlay} onClick={() => setShowAllNotifications(false)}>
              <div style={modalStyles.modal} onClick={e => e.stopPropagation()}>
                <div style={modalStyles.header}>
                  <h3 style={modalStyles.title}>All Notifications</h3>
                  <span style={modalStyles.close} onClick={() => setShowAllNotifications(false)}>×</span>
                </div>
                <div style={modalStyles.body}>
                  {notifications.map((n, i) => (
                    <div key={i} style={{ ...panelStyles.notifRow, ...(i === notifications.length - 1 ? panelStyles.rowLast : {}) }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={panelStyles.notifTopRow}>
                          <span style={panelStyles.notifTitle}>{n.event}</span>
                          <span style={{ ...panelStyles.notifStatus, color: n.status === 'Sent' ? '#256b3d' : '#b91c1c' }}>
                            {n.status}
                          </span>
                        </div>
                        <div style={panelStyles.notifDesc}>{n.description}</div>
                        <div style={panelStyles.notifTime}>{n.sent_at}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={modalStyles.actions}>
                  <button onClick={() => setShowAllNotifications(false)} style={modalStyles.closeBtn}>Close</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  )
}

function Card({ title, children, badge, badgeColor }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <span style={styles.cardTitle}>{title}</span>
        {badge && (
          <span style={{ ...styles.sectionBadge, color: badgeColor, backgroundColor: `${badgeColor}18` }}>{badge}</span>
        )}
      </div>
      {children}
    </div>
  )
}

// Read-only field styled identically to the Farms module's Account
// Information fields (label above a disabled-look input box).
function InfoField({ label, value }) {
  return (
    <div style={acctStyles.fieldGroup}>
      <label style={acctStyles.label}>{label}</label>
      <input value={value || '—'} disabled style={{ ...acctStyles.input, ...acctStyles.inputDisabled }} />
    </div>
  )
}

const SANS = "'Inter', sans-serif"

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },

  backBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
    borderRadius: '999px', border: '1px solid #dcdfd6', backgroundColor: '#fff',
    color: '#33413a', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS,
    marginBottom: '16px',
  },

  headerCard: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px',
    backgroundColor: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', padding: '20px 22px', marginBottom: '20px',
    fontFamily: SANS,
  },
  farmName: { fontSize: '19px', fontWeight: 800, color: '#16311d', letterSpacing: '-0.01em' },
  ownerSub: { fontSize: '13px', color: '#7b8a80', marginTop: '4px' },
  statusPill: { display: 'inline-flex', alignItems: 'center', padding: '5px 13px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' },

  card: {
    backgroundColor: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px',
    padding: '20px 22px', fontFamily: SANS,
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  cardTitle: { fontSize: '14px', fontWeight: 800, color: '#16311d' },
  sectionBadge: { padding: '3px 10px', borderRadius: '999px', fontSize: '10.5px', fontWeight: 700 },

  sectionDivider: { borderTop: '1px solid #eceee7', marginTop: '4px', marginBottom: '18px', paddingTop: '14px' },
  sectionDividerLabel: { fontSize: '11px', fontWeight: 700, color: '#8a968d', textTransform: 'uppercase', letterSpacing: '0.05em' },

  infoColumns: { display: 'flex', gap: '16px', alignItems: 'flex-start' },
  infoColumnsMobile: { flexDirection: 'column' },
  infoColumn: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' },
}

const acctStyles = {
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  rowMobile: { gridTemplateColumns: '1fr', gap: '0px' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' },
  label: { fontSize: '13px', fontWeight: '500', color: '#374151' },
  input: {
    padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db',
    fontSize: '14px', boxSizing: 'border-box', width: '100%', fontFamily: SANS,
  },
  inputDisabled: { backgroundColor: '#f9fafb', color: '#6b7280', cursor: 'not-allowed' },
}

const panelStyles = {
  emptyText: { fontSize: '12.5px', color: '#9aa79d', fontStyle: 'italic', fontFamily: SANS, margin: '10px 0' },

  notifRow: { padding: '12px 0', borderBottom: '1px solid #eceee7' },
  rowLast: { borderBottom: 'none' },
  notifTopRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' },
  notifTitle: { fontSize: '13px', fontWeight: 700, color: '#16311d', fontFamily: SANS },
  notifStatus: { fontSize: '11.5px', fontWeight: 700, fontFamily: SANS, flexShrink: 0, whiteSpace: 'nowrap' },
  notifDesc: { fontSize: '12px', color: '#4b5a50', marginTop: '3px', lineHeight: 1.4, fontFamily: SANS },
  notifTime: { fontSize: '11px', color: '#9aa79d', marginTop: '5px', fontFamily: SANS },

  viewAllBtn: {
    display: 'block', width: '100%', textAlign: 'center', marginTop: '10px', padding: '9px 0',
    border: '1px solid #e3e6dd', borderRadius: '8px', backgroundColor: '#fff',
    fontSize: '12.5px', fontWeight: 600, color: '#2c8047', cursor: 'pointer', fontFamily: SANS,
  },
}

const modalStyles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(15,38,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' },
  modal: {
    fontFamily: SANS, backgroundColor: '#fff', borderRadius: '14px', padding: '24px',
    width: '480px', maxWidth: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', paddingBottom: '14px', borderBottom: '1px solid #e7e8e0', flexShrink: 0 },
  title: { fontSize: '16px', fontWeight: 800, color: '#16311d', margin: 0 },
  close: { fontSize: '20px', cursor: 'pointer', color: '#8a968d', lineHeight: 1 },
  body: { overflowY: 'auto', flex: 1, minHeight: 0 },
  actions: { display: 'flex', justifyContent: 'flex-end', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #e7e8e0', flexShrink: 0 },
  closeBtn: { padding: '9px 20px', borderRadius: '8px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#33413a', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS },
}
