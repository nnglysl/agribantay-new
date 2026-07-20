import { useState, useEffect } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

export default function AlertHistory() {
  const [statusFilter, setStatusFilter] = useState('')
  const [sensorFilter, setSensorFilter] = useState('')
  const [farmFilter, setFarmFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const rowsPerPage = 10
  const isMobile = useIsMobile()

  const params = {}
  if (statusFilter) params.status = statusFilter
  if (sensorFilter) params.sensor_type = sensorFilter
  if (farmFilter) params.farm_id = farmFilter

  const { data: history, loading, error } = useCachedFetch('/admin/alert-history', params)
  const { data: farms } = useCachedFetch('/admin/farms')

  useEffect(() => { setCurrentPage(1) }, [statusFilter, sensorFilter, farmFilter])

  const statusColor = { Warning: '#B45309', Critical: '#B91C1C' }
  const sensorTypes = ['Ammonia', 'Temperature', 'Humidity', 'Moisture']

  const allHistory = history || []
  const totalPages = Math.ceil(allHistory.length / rowsPerPage)
  const paginatedHistory = allHistory.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)

  const ongoingCount = allHistory.filter(h => h.is_ongoing).length

  return (
    <AdminLayout>
      <div style={styles.header}>
        <div>
          <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Alert History</h1>
          <p style={styles.subtitle}>
            A record of every sensor incident — not a live feed, a searchable log of what already happened
          </p>
        </div>
        {ongoingCount > 0 && (
          <span style={styles.ongoingBadge}>{ongoingCount} currently ongoing</span>
        )}
      </div>

      <div style={{ ...styles.filters, ...(isMobile ? styles.filtersMobile : {}) }}>
        <div style={styles.pillRow}>
          <FilterPill label="All" active={!statusFilter} onClick={() => setStatusFilter('')} />
          <FilterPill label="Warning" active={statusFilter === 'Warning'} onClick={() => setStatusFilter('Warning')} />
          <FilterPill label="Critical" active={statusFilter === 'Critical'} onClick={() => setStatusFilter('Critical')} />
        </div>

        <select
          value={sensorFilter}
          onChange={e => setSensorFilter(e.target.value)}
          style={{ ...styles.select, ...(isMobile ? styles.selectMobile : {}) }}
        >
          <option value="">All Sensors</option>
          {sensorTypes.map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}
        </select>

        <select
          value={farmFilter}
          onChange={e => setFarmFilter(e.target.value)}
          style={{ ...styles.select, ...(isMobile ? styles.selectMobile : {}) }}
        >
          <option value="">All Farms</option>
          {(farms || []).map(f => <option key={f.id} value={f.id}>{f.farm_name}</option>)}
        </select>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {!loading && !error && (
        <>
          <div style={styles.tableCard}>
            {isMobile && paginatedHistory.length > 0 && (
              <p style={styles.scrollHint}>Swipe left/right to see all columns →</p>
            )}
            <div style={isMobile ? styles.tableScroll : undefined}>
              <table style={{ ...styles.table, ...(isMobile ? styles.tableMobile : {}) }}>
                <thead>
                  <tr>
                    <th style={styles.th}>Farm</th>
                    <th style={styles.th}>Sensor</th>
                    <th style={styles.th}>Severity</th>
                    <th style={styles.th}>Value</th>
                    <th style={styles.th}>Triggered</th>
                    <th style={styles.th}>Resolved</th>
                    <th style={styles.th}>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedHistory.map(h => (
                    <tr key={h.id}>
                      <td style={styles.td}>{h.farm_name}</td>
                      <td style={styles.td}>{h.sensor_type}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, backgroundColor: statusColor[h.status] || '#6b7280' }}>
                          {h.status}
                        </span>
                      </td>
                      <td style={styles.td}>{h.value}</td>
                      <td style={styles.td}>{h.triggered_at}</td>
                      <td style={styles.td}>
                        {h.is_ongoing ? (
                          <span style={styles.ongoingText}>Ongoing</span>
                        ) : h.resolved_at}
                      </td>
                      <td style={styles.td}>{h.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {allHistory.length === 0 && <div style={styles.empty}>No alert history recorded yet.</div>}
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
      style={{ ...styles.filterPill, ...(active ? styles.filterPillActive : {}) }}
    >
      {label}
    </span>
  )
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' },
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  titleMobile: { fontSize: '18px' },
  subtitle: { fontSize: '13px', color: '#6b7280', marginTop: '4px', maxWidth: '480px' },
  ongoingBadge: {
    backgroundColor: '#fef2f2', color: '#B91C1C', border: '1px solid #fecaca',
    padding: '6px 14px', borderRadius: '999px', fontSize: '12.5px', fontWeight: '700', whiteSpace: 'nowrap',
  },
  filters: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' },
  filtersMobile: { flexDirection: 'column', alignItems: 'stretch' },
  pillRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  filterPill: {
    padding: '6px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: '500',
    color: '#374151', backgroundColor: 'white', border: '1px solid #d1d5db', cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  filterPillActive: { backgroundColor: '#2E7D32', color: 'white', border: '1px solid #2E7D32' },
  select: {
    marginLeft: 'auto', padding: '8px 12px', borderRadius: '8px',
    border: '1px solid #d1d5db', fontSize: '13px',
  },
  selectMobile: { marginLeft: 0, width: '100%', boxSizing: 'border-box' },
  tableCard: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' },
  scrollHint: { fontSize: '11px', color: '#9ca3af', margin: '12px 16px 0' },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableMobile: { minWidth: '820px' },
  th: { textAlign: 'left', padding: '14px 16px', fontSize: '12px', color: '#6b7280', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase', whiteSpace: 'nowrap' },
  td: { padding: '14px 16px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #f3f4f6' },
  badge: { padding: '3px 10px', borderRadius: '999px', color: 'white', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap' },
  ongoingText: { color: '#B91C1C', fontWeight: '700', fontSize: '12.5px' },
  empty: { padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' },
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginTop: '16px' },
  pageBtn: {
    padding: '8px 16px', borderRadius: '8px', border: '1px solid #d1d5db',
    backgroundColor: 'white', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer',
  },
  pageBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  pageInfo: { fontSize: '13px', color: '#6b7280' },
}