import { useEffect, useState } from 'react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'

export default function ActivityLogs() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const loadLogs = () => {
    setLoading(true)
    const params = {}
    if (roleFilter) params.role = roleFilter
    if (typeFilter) params.type = typeFilter

    api.get('/admin/activity-logs', { params })
      .then(res => setLogs(res.data.data))
      .catch(err => setError(err.response?.data?.message || 'Failed to load activity logs.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadLogs() }, [roleFilter, typeFilter])

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

  return (
    <AdminLayout>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Activity Logs</h1>
          <p style={styles.subtitle}>Full audit trail — all users</p>
        </div>
      </div>

      <div style={styles.filters}>
        <FilterPill label="All" active={!roleFilter} onClick={() => setRoleFilter('')} />
        <FilterPill label="Admin" active={roleFilter === 'admin'} onClick={() => setRoleFilter('admin')} />
        <FilterPill label="Farm Owner" active={roleFilter === 'farm_owner'} onClick={() => setRoleFilter('farm_owner')} />
        <FilterPill label="Vet" active={roleFilter === 'vet'} onClick={() => setRoleFilter('vet')} />
        <FilterPill label="System" active={roleFilter === 'System'} onClick={() => setRoleFilter('System')} />

        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={styles.select}>
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
        <div style={styles.tableCard}>
          <table style={styles.table}>
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
              {logs.map(log => (
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
          {logs.length === 0 && <div style={styles.empty}>No activity recorded yet.</div>}
        </div>
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
  subtitle: { fontSize: '13px', color: '#6b7280', marginTop: '4px' },
  filters: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' },
  filterPill: {
    padding: '6px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: '500',
    color: '#374151', backgroundColor: 'white', border: '1px solid #d1d5db', cursor: 'pointer',
  },
  filterPillActive: {
    backgroundColor: '#2E7D32', color: 'white', border: '1px solid #2E7D32',
  },
  select: {
    marginLeft: 'auto', padding: '8px 12px', borderRadius: '8px',
    border: '1px solid #d1d5db', fontSize: '13px',
  },
  tableCard: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '14px 16px', fontSize: '12px', color: '#6b7280', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase' },
  td: { padding: '14px 16px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #f3f4f6' },
  badge: { padding: '3px 10px', borderRadius: '999px', color: 'white', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap' },
  empty: { padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' },
}