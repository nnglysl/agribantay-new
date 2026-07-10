import { useState, useEffect } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

export default function ActivityLogs() {
  const [roleFilter, setRoleFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const rowsPerPage = 10
  const isMobile = useIsMobile()

  const params = {}
  if (roleFilter) params.role = roleFilter
  if (typeFilter) params.type = typeFilter

  const { data: logs, loading, error } = useCachedFetch('/admin/activity-logs', params)

  useEffect(() => { setCurrentPage(1) }, [roleFilter, typeFilter])

  const roleColor = {
    admin: '#3b82f6',
    farm_owner: '#f59e0b',
    vet: '#8b5cf6',
    System: '#6b7280',
  }

  const typeColor = {
    Alert: '#dc2626',
    Vaccination: '#8b5cf6',
    Request: '#f59e0b',
    Inspection: '#3b82f6',
    Account: '#2E7D32',
    Farm: '#2E7D32',
  }

  const roleLabel = {
    admin: 'Admin',
    farm_owner: 'Farm Owner',
    vet: 'Vet',
    System: 'System',
  }

  const allLogs = logs || []
  const totalPages = Math.ceil(allLogs.length / rowsPerPage)
  const paginatedLogs = allLogs.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)

  return (
    <AdminLayout>
      <div style={styles.header}>
        <div>
          <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Activity Logs</h1>
          <p style={styles.subtitle}>Full audit trail — all users</p>
        </div>
      </div>

      <div style={{ ...styles.filters, ...(isMobile ? styles.filtersMobile : {}) }}>
        <div style={styles.pillRow}>
          <FilterPill label="All" active={!roleFilter} onClick={() => setRoleFilter('')} />
          <FilterPill label="Admin" active={roleFilter === 'admin'} onClick={() => setRoleFilter('admin')} />
          <FilterPill label="Farm Owner" active={roleFilter === 'farm_owner'} onClick={() => setRoleFilter('farm_owner')} />
          <FilterPill label="Vet" active={roleFilter === 'vet'} onClick={() => setRoleFilter('vet')} />
          <FilterPill label="System" active={roleFilter === 'System'} onClick={() => setRoleFilter('System')} />
        </div>

        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          style={{ ...styles.select, ...(isMobile ? styles.selectMobile : {}) }}
        >
          <option value="">All Types</option>
          <option value="Alert">Alert</option>
          <option value="Vaccination">Vaccination</option>
          <option value="Request">Request</option>
          <option value="Inspection">Inspection</option>
          <option value="Account">Account</option>
          <option value="Farm">Farm</option>
        </select>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {!loading && !error && (
        <>
          <div style={styles.tableCard}>
            {isMobile && paginatedLogs.length > 0 && (
              <p style={styles.scrollHint}>Swipe left/right to see all columns →</p>
            )}
            <div style={isMobile ? styles.tableScroll : undefined}>
              <table style={{ ...styles.table, ...(isMobile ? styles.tableMobile : {}) }}>
                <thead>
                  <tr>
                    <th style={styles.th}>Time</th>
                    <th style={styles.th}>Actor</th>
                    <th style={styles.th}>Role</th>
                    <th style={styles.th}>Action</th>
                    <th style={styles.th}>Details</th>
                    <th style={styles.th}>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.map(log => (
                    <tr key={log.id}>
                      <td style={styles.td}>{log.created_at}</td>
                      <td style={styles.td}>{log.user}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, backgroundColor: roleColor[log.role] || '#6b7280' }}>
                          {roleLabel[log.role] || log.role}
                        </span>
                      </td>
                      <td style={styles.td}>{log.action}</td>
                      <td style={styles.td}>{log.details}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, backgroundColor: typeColor[log.type] || '#6b7280' }}>
                          {log.type}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {allLogs.length === 0 && <div style={styles.empty}>No activity recorded yet.</div>}
          </div>

          {totalPages > 1 && (
            <div style={styles.pagination}>
              <span
                style={{ ...styles.pageBtn, ...(currentPage === 1 ? styles.pageBtnDisabled : {}) }}
                onClick={() => currentPage > 1 && setCurrentPage(currentPage - 1)}
              >
                ‹ Prev
              </span>
              <span style={styles.pageInfo}>Page {currentPage} of {totalPages}</span>
              <span
                style={{ ...styles.pageBtn, ...(currentPage === totalPages ? styles.pageBtnDisabled : {}) }}
                onClick={() => currentPage < totalPages && setCurrentPage(currentPage + 1)}
              >
                Next ›
              </span>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  )
}

function FilterPill({ label, active, onClick }) {
  return (
    <span
      onClick={onClick}
      style={{
        ...styles.filterPill,
        ...(active ? styles.filterPillActive : {}),
      }}
    >
      {label}
    </span>
  )
}

const styles = {
  header: { marginBottom: '20px' },
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  titleMobile: { fontSize: '18px' },
  subtitle: { fontSize: '13px', color: '#6b7280', marginTop: '4px' },
  filters: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' },
  filtersMobile: { flexDirection: 'column', alignItems: 'stretch' },
  pillRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  filterPill: {
    padding: '6px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: '500',
    color: '#374151', backgroundColor: 'white', border: '1px solid #d1d5db', cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  filterPillActive: {
    backgroundColor: '#2E7D32', color: 'white', border: '1px solid #2E7D32',
  },
  select: {
    marginLeft: 'auto', padding: '8px 12px', borderRadius: '8px',
    border: '1px solid #d1d5db', fontSize: '13px',
  },
  selectMobile: { marginLeft: 0, width: '100%', boxSizing: 'border-box' },
  tableCard: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' },
  scrollHint: { fontSize: '11px', color: '#9ca3af', margin: '12px 16px 0' },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableMobile: { minWidth: '760px' },
  th: { textAlign: 'left', padding: '14px 16px', fontSize: '12px', color: '#6b7280', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase', whiteSpace: 'nowrap' },
  td: { padding: '14px 16px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #f3f4f6' },
  badge: { padding: '3px 10px', borderRadius: '999px', color: 'white', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap' },
  empty: { padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' },
  pagination: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '16px', marginTop: '16px',
  },
  pageBtn: {
    padding: '8px 16px', borderRadius: '8px', border: '1px solid #d1d5db',
    backgroundColor: 'white', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer',
  },
  pageBtnDisabled: {
    opacity: 0.4, cursor: 'not-allowed',
  },
  pageInfo: { fontSize: '13px', color: '#6b7280' },
}