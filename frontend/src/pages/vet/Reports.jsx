import { useEffect, useState } from 'react'
import api from '../../api/axios'
import VetLayout from '../../components/VetLayout'

export default function VetReports() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/vet/reports')
      .then(res => setData(res.data.data))
      .catch(err => setError(err.response?.data?.message || 'Failed to load reports.'))
      .finally(() => setLoading(false))
  }, [])

  const handlePrint = () => window.print()

  if (loading) return <VetLayout><p>Loading...</p></VetLayout>
  if (error) return <VetLayout><p style={{ color: '#dc2626' }}>{error}</p></VetLayout>

  return (
    <VetLayout>
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
          <p style={styles.subtitle}>Vaccination history & records</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }} className="no-print">
          <button style={styles.printBtn} onClick={handlePrint}>🖨 Print</button>
          <button style={styles.exportBtn}>📄 Export PDF</button>
        </div>
      </div>

      <div style={styles.statsGrid}>
        <div style={styles.statCard} className="print-panel">
          <div style={styles.statIcon}>💉</div>
          <div style={styles.statValue}>{data.total_vaccinations}</div>
          <div style={styles.statLabel}>Total Vaccinations</div>
        </div>
        <div style={styles.statCard} className="print-panel">
          <div style={styles.statIcon}>🚜</div>
          <div style={styles.statValue}>{data.farms_covered}</div>
          <div style={styles.statLabel}>Farms Covered</div>
        </div>
      </div>

      <div style={{ ...styles.panel, marginTop: '20px' }} className="print-panel">
        <h3 style={styles.panelTitle}>Completed Vaccinations</h3>
        {data.completed_vaccinations.length === 0 ? (
          <div style={styles.empty}>No completed vaccinations yet.</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>ID</th>
                <th style={styles.th}>Farm</th>
                <th style={styles.th}>Owner</th>
                <th style={styles.th}>Barangay</th>
                <th style={styles.th}>Birds</th>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Notes</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.completed_vaccinations.map(v => (
                <tr key={v.id}>
                  <td style={styles.td}>{v.id}</td>
                  <td style={styles.td}>{v.farm_name}</td>
                  <td style={styles.td}>{v.owner_name}</td>
                  <td style={styles.td}>{v.barangay}</td>
                  <td style={styles.td}>{v.num_birds}</td>
                  <td style={styles.td}>{v.completed_at}</td>
                  <td style={styles.td}>{v.notes}</td>
                  <td style={styles.td}>
                    <span style={styles.badge}>{v.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </VetLayout>
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
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' },
  statCard: {
    backgroundColor: 'white', borderRadius: '12px', padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  statIcon: {
    width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#f0fdf4',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '16px', marginBottom: '12px',
  },
  statValue: { fontSize: '28px', fontWeight: '700', color: '#111827' },
  statLabel: { fontSize: '13px', color: '#6b7280', marginTop: '2px' },
  panel: {
    backgroundColor: 'white', borderRadius: '12px', padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  panelTitle: { fontSize: '15px', fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: '16px' },
  empty: { color: '#9ca3af', fontSize: '14px', padding: '16px 0' },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: '8px' },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: '11px', color: '#6b7280', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase' },
  td: { padding: '10px 12px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #f3f4f6' },
  badge: {
    backgroundColor: '#2E7D32', color: 'white', padding: '3px 10px',
    borderRadius: '999px', fontSize: '11px', fontWeight: '600',
  },
}