import { useEffect, useState } from 'react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'

export default function Reports() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/admin/reports')
      .then(res => setData(res.data.data))
      .catch(err => setError(err.response?.data?.message || 'Failed to load reports.'))
      .finally(() => setLoading(false))
  }, [])

  const handlePrint = () => window.print()

  if (loading) return <AdminLayout><p>Loading...</p></AdminLayout>
  if (error) return <AdminLayout><p style={{ color: '#dc2626' }}>{error}</p></AdminLayout>

  return (
    <AdminLayout>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #ddd; }
          .print-panel {
            box-shadow: none !important;
            border: 1px solid #ddd !important;
            break-inside: avoid;
          }
        }
      `}</style>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Reports</h1>
          <p style={styles.subtitle}>Municipality-wide analytics</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }} className="no-print">
          <button style={styles.printBtn} onClick={handlePrint}>🖨 Print</button>
          <button style={styles.exportBtn}>📄 Export PDF</button>
        </div>
      </div>

      <div style={styles.twoCol}>
        <div style={styles.panel} className="print-panel">
          <h3 style={styles.panelTitle}>Inspection Summary</h3>
          <StatRow label="Total Inspections" value={data.inspection_summary.total} />
          <StatRow label="Completed" value={data.inspection_summary.completed} color="#2E7D32" />
          <StatRow label="Scheduled" value={data.inspection_summary.scheduled} color="#3b82f6" />
          <StatRow label="General Inspections" value={data.inspection_summary.general} />
          <StatRow label="Follow-ups" value={data.inspection_summary.follow_up} />
        </div>

        <div style={styles.panel} className="print-panel">
          <h3 style={styles.panelTitle}>Alert Summary</h3>
          <StatRow label="Total Alerts This Month" value={data.alert_summary.total} />
          <StatRow label="Ammonia Threshold Breaches" value={data.alert_summary.ammonia_breaches} color="#dc2626" />
          <StatRow label="Temperature Anomalies" value={data.alert_summary.temp_anomalies} color="#f59e0b" />
          <StatRow label="Humidity Anomalies" value={data.alert_summary.humidity_anomalies} color="#f59e0b" />
          <StatRow label="Critical Alerts" value={data.alert_summary.critical_alerts} color="#dc2626" />
        </div>
      </div>

      <div style={{ ...styles.panel, marginTop: '20px' }} className="print-panel">
        <h3 style={styles.panelTitle}>Completed Inspections</h3>
        {data.completed_inspections.length === 0 ? (
          <div style={styles.empty}>No completed inspections yet.</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>ID</th>
                <th style={styles.th}>Farm</th>
                <th style={styles.th}>Owner</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.completed_inspections.map(i => (
                <tr key={i.id}>
                  <td style={styles.td}>{i.inspection_number}</td>
                  <td style={styles.td}>{i.farm_name}</td>
                  <td style={styles.td}>{i.owner_name}</td>
                  <td style={styles.td}>{i.inspection_type}</td>
                  <td style={styles.td}>{i.completed_at}</td>
                  <td style={styles.td}>
                    <span style={styles.badge}>{i.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  )
}

function StatRow({ label, value, color }) {
  return (
    <div style={styles.statRow}>
      <span style={styles.statLabel}>{label}</span>
      <span style={{ ...styles.statValue, color: color || '#111827' }}>{value}</span>
    </div>
  )
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' },
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  subtitle: { fontSize: '13px', color: '#6b7280', marginTop: '4px' },
  printBtn: {
    backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db',
    borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
  },
  exportBtn: {
    backgroundColor: '#2E7D32', color: 'white', border: 'none',
    borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
  },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
  panel: {
    backgroundColor: 'white', borderRadius: '12px', padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  panelTitle: { fontSize: '15px', fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: '16px' },
  statRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 0', borderBottom: '1px solid #f3f4f6', fontSize: '14px',
  },
  statLabel: { color: '#6b7280' },
  statValue: { fontWeight: '700', fontSize: '16px' },
  empty: { color: '#9ca3af', fontSize: '14px', padding: '16px 0' },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: '8px' },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: '11px', color: '#6b7280', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase' },
  td: { padding: '10px 12px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #f3f4f6' },
  badge: {
    backgroundColor: '#2E7D32', color: 'white', padding: '3px 10px',
    borderRadius: '999px', fontSize: '11px', fontWeight: '600',
  },
}