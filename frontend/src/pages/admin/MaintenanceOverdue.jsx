import AdminLayout from '../../components/AdminLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

export default function MaintenanceOverdue() {
  const { data: farms, loading, error } = useCachedFetch('/admin/maintenance/overdue')
  const isMobile = useIsMobile()

  const overdueFarms = farms || []

  return (
    <AdminLayout>
      <div style={styles.header}>
        <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Overdue Maintenance</h1>
        <p style={styles.subtitle}>
          Farms whose manure clean-out has passed both the expected interval and the 30-day grace period —
          sorted worst first
        </p>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {!loading && !error && (
        <div style={styles.tableCard}>
          {isMobile && overdueFarms.length > 0 && (
            <p style={styles.scrollHint}>Swipe left/right to see all columns →</p>
          )}
          <div style={isMobile ? styles.tableScroll : undefined}>
            <table style={{ ...styles.table, ...(isMobile ? styles.tableMobile : {}) }}>
              <thead>
                <tr>
                  <th style={styles.th}>Farm</th>
                  <th style={styles.th}>Owner</th>
                  <th style={styles.th}>Barangay</th>
                  <th style={styles.th}>Farm Size</th>
                  <th style={styles.th}>Last Clean-out</th>
                  <th style={styles.th}>Days Overdue</th>
                </tr>
              </thead>
              <tbody>
                {overdueFarms.map(f => (
                  <tr key={f.farm_id}>
                    <td style={styles.td}>{f.farm_name}</td>
                    <td style={styles.td}>{f.owner_name}</td>
                    <td style={styles.td}>{f.barangay}</td>
                    <td style={styles.td}>{f.farm_size}</td>
                    <td style={styles.td}>{f.last_performed_at || 'Never logged'}</td>
                    <td style={styles.td}>
                      <span style={styles.overdueBadge}>{f.days_overdue} day{f.days_overdue === 1 ? '' : 's'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {overdueFarms.length === 0 && (
            <div style={styles.empty}>No farms are currently overdue for a manure clean-out.</div>
          )}
        </div>
      )}
    </AdminLayout>
  )
}

const styles = {
  header: { marginBottom: '20px' },
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  titleMobile: { fontSize: '18px' },
  subtitle: { fontSize: '13px', color: '#6b7280', marginTop: '4px', maxWidth: '560px' },
  tableCard: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' },
  scrollHint: { fontSize: '11px', color: '#9ca3af', margin: '12px 16px 0' },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableMobile: { minWidth: '760px' },
  th: { textAlign: 'left', padding: '14px 16px', fontSize: '12px', color: '#6b7280', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase', whiteSpace: 'nowrap' },
  td: { padding: '14px 16px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #f3f4f6' },
  overdueBadge: {
    padding: '3px 10px', borderRadius: '999px', backgroundColor: '#fef2f2', color: '#B91C1C',
    fontSize: '12px', fontWeight: '700', whiteSpace: 'nowrap',
  },
  empty: { padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' },
}