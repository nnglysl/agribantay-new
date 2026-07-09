import { useMemo, useRef, useState } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
} from 'chart.js'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import AdminLayout from '../../components/AdminLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import sanJoseLogo from '../../assets/sanjose-logo.png'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip)

export default function Reports() {
  const { data, loading, error } = useCachedFetch('/admin/reports')
  const printRef = useRef(null)
  const [exporting, setExporting] = useState(false)

  const handlePrint = () => window.print()

  const handleExportPdf = async () => {
    if (!printRef.current) return
    setExporting(true)
    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      })
      const imgData = canvas.toDataURL('image/png')

      const pdf = new jsPDF('p', 'mm', 'a4')
      const margin = 12
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const usableWidth = pageWidth - margin * 2
      const usableHeight = pageHeight - margin * 2
      const imgWidth = usableWidth
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      let heightLeft = imgHeight
      let position = margin

      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
      heightLeft -= usableHeight

      while (heightLeft > 0) {
        position = margin - (imgHeight - heightLeft)
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
        heightLeft -= usableHeight
      }

      pdf.save(`AgriBantay_Report_${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (err) {
      console.error('PDF export failed:', err)
      alert('Could not generate PDF. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const completedInspections = data?.completed_inspections ?? []

  const monthlyTrend = useMemo(() => {
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString('default', { month: 'short' }), count: 0 })
    }
    completedInspections.forEach(insp => {
      const d = new Date(insp.completed_at)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      const bucket = months.find(m => m.key === key)
      if (bucket) bucket.count += 1
    })
    return months
  }, [completedInspections])

  const generatedAt = new Date().toLocaleString('en-PH', {
    dateStyle: 'long',
    timeStyle: 'short',
  })

  if (loading) return <AdminLayout><p>Loading...</p></AdminLayout>
  if (error) return <AdminLayout><p style={{ color: '#dc2626' }}>{error}</p></AdminLayout>
  if (!data) return <AdminLayout><p>Loading...</p></AdminLayout>

  return (
    <AdminLayout>
      <style>{`
        .print-view {
          position: absolute;
          left: -9999px;
          top: 0;
          width: 800px;
          padding: 40px;
          box-sizing: border-box;
          display: block;
          font-family: Georgia, 'Times New Roman', serif;
          color: #000;
          background: #fff;
        }
        .print-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        .print-table th, .print-table td {
          border: 1px solid #000; padding: 6px 10px; text-align: left; font-size: 12px;
        }
        .print-table th { background: #fff; font-weight: bold; }
        .print-section-title {
          font-size: 13px; font-weight: bold; text-transform: uppercase;
          margin: 24px 0 8px; border-bottom: 1px solid #000; padding-bottom: 4px;
        }
        @media print {
          .screen-view { display: none !important; }
          .print-view {
            position: static;
            left: auto;
          }
        }
      `}</style>

      <div className="screen-view">
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Reports</h1>
            <p style={styles.subtitle}>Municipality-wide analytics</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <select style={styles.select}>
              <option>This month</option>
              <option>This quarter</option>
              <option>This year</option>
            </select>
            <button style={styles.printBtn} onClick={handlePrint}>Print</button>
            <button style={styles.exportBtn} onClick={handleExportPdf} disabled={exporting}>
              {exporting ? 'Generating...' : 'Export PDF'}
            </button>
          </div>
        </div>

        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{data.inspection_summary.total}</div>
            <div style={styles.statLabel}>Total inspections</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#2E7D32' }}>{data.inspection_summary.completed}</div>
            <div style={styles.statLabel}>Completed</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#3b82f6' }}>{data.inspection_summary.scheduled}</div>
            <div style={styles.statLabel}>Scheduled</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{data.alert_summary.total}</div>
            <div style={styles.statLabel}>Alerts this month</div>
          </div>
          <div style={{ ...styles.statCard, backgroundColor: '#fef2f2' }}>
            <div style={{ ...styles.statValue, color: '#dc2626' }}>{data.alert_summary.critical_alerts}</div>
            <div style={{ ...styles.statLabel, color: '#991b1b' }}>Critical alerts</div>
          </div>
        </div>

        <div style={{ ...styles.twoCol, marginTop: '20px' }}>
          <div style={styles.panel}>
            <h3 style={styles.panelTitle}>Completed inspections per month</h3>
            <p style={styles.panelSubtitle}>Last 6 months</p>
            {monthlyTrend.every(m => m.count === 0) ? (
              <div style={styles.empty}>No inspection history yet.</div>
            ) : (
              <div style={{ position: 'relative', height: '200px' }}>
                <Line
                  data={{
                    labels: monthlyTrend.map(m => m.label),
                    datasets: [{
                      data: monthlyTrend.map(m => m.count),
                      borderColor: '#2E7D32',
                      backgroundColor: '#2E7D32',
                      tension: 0.3,
                      pointRadius: 4,
                    }],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      y: { beginAtZero: true, ticks: { stepSize: 1, color: '#6b7280' }, grid: { color: '#f3f4f6' } },
                      x: { ticks: { color: '#6b7280' }, grid: { display: false } },
                    },
                  }}
                />
              </div>
            )}
          </div>

          <div style={styles.panel}>
            <h3 style={styles.panelTitle}>Alert breakdown</h3>
            <StatRow label="Ammonia threshold breaches" value={data.alert_summary.ammonia_breaches} color="#dc2626" />
            <StatRow label="Temperature anomalies" value={data.alert_summary.temp_anomalies} color="#b45309" />
            <StatRow label="Humidity anomalies" value={data.alert_summary.humidity_anomalies} color="#b45309" />
            <StatRow label="Critical alerts" value={data.alert_summary.critical_alerts} color="#dc2626" />
          </div>
        </div>

        <div style={{ ...styles.panel, marginTop: '20px' }}>
          <h3 style={styles.panelTitle}>Completed inspections</h3>
          {completedInspections.length === 0 ? (
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
                {completedInspections.map(i => (
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
      </div>

      <div className="print-view" ref={printRef}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', borderBottom: '2px solid #000', paddingBottom: '12px', marginBottom: '4px' }}>
          <img src={sanJoseLogo} alt="Municipality of San Jose, Batangas seal" style={{ width: '64px', height: '64px' }} />
          <div>
            <div style={{ fontSize: '11px' }}>Republic of the Philippines</div>
            <div style={{ fontSize: '11px' }}>Province of Batangas</div>
            <div style={{ fontSize: '13px', fontWeight: 'bold' }}>Municipality of San Jose</div>
            <div style={{ fontSize: '12px' }}>Municipal Agriculture Office</div>
          </div>
        </div>

        <h1 style={{ fontSize: '18px', textAlign: 'center', margin: '16px 0 4px' }}>AgriBantay Municipal Report</h1>
        <p style={{ fontSize: '12px', textAlign: 'center', margin: '0 0 4px' }}>Poultry farm monitoring and service summary</p>
        <p style={{ fontSize: '11px', textAlign: 'center', margin: '0 0 16px' }}>Generated {generatedAt}</p>

        <div className="print-section-title">Inspection summary</div>
        <table className="print-table">
          <tbody>
            <tr><th>Total inspections</th><td>{data.inspection_summary.total}</td></tr>
            <tr><th>Completed</th><td>{data.inspection_summary.completed}</td></tr>
            <tr><th>Scheduled</th><td>{data.inspection_summary.scheduled}</td></tr>
            <tr><th>General inspections</th><td>{data.inspection_summary.general}</td></tr>
            <tr><th>Follow-ups</th><td>{data.inspection_summary.follow_up}</td></tr>
          </tbody>
        </table>

        <div className="print-section-title">Alert summary</div>
        <table className="print-table">
          <tbody>
            <tr><th>Total alerts this month</th><td>{data.alert_summary.total}</td></tr>
            <tr><th>Ammonia threshold breaches</th><td>{data.alert_summary.ammonia_breaches}</td></tr>
            <tr><th>Temperature anomalies</th><td>{data.alert_summary.temp_anomalies}</td></tr>
            <tr><th>Humidity anomalies</th><td>{data.alert_summary.humidity_anomalies}</td></tr>
            <tr><th>Critical alerts</th><td>{data.alert_summary.critical_alerts}</td></tr>
          </tbody>
        </table>

        <div className="print-section-title">Completed inspections</div>
        {completedInspections.length === 0 ? (
          <p style={{ fontSize: '12px' }}>No completed inspections on record.</p>
        ) : (
          <table className="print-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Farm</th>
                <th>Owner</th>
                <th>Type</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {completedInspections.map(i => (
                <tr key={i.id}>
                  <td>{i.inspection_number}</td>
                  <td>{i.farm_name}</td>
                  <td>{i.owner_name}</td>
                  <td>{i.inspection_type}</td>
                  <td>{i.completed_at}</td>
                  <td>{i.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
          <div>
            <div style={{ borderTop: '1px solid #000', width: '220px', paddingTop: '4px' }}>Prepared by</div>
          </div>
          <div>
            <div style={{ borderTop: '1px solid #000', width: '220px', paddingTop: '4px' }}>Noted by, LGU Administrator</div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}

function StatRow({ label, value, color }) {
  return (
    <div style={styles.statRow}>
      <span style={styles.statLabel}>{label}</span>
      <span style={{ ...styles.rowValue, color: color || '#111827' }}>{value}</span>
    </div>
  )
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' },
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  subtitle: { fontSize: '13px', color: '#6b7280', marginTop: '4px' },
  select: {
    backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db',
    borderRadius: '8px', padding: '0 12px', fontSize: '14px', height: '38px',
  },
  printBtn: {
    backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db',
    borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
  },
  exportBtn: {
    backgroundColor: '#2E7D32', color: 'white', border: 'none',
    borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
  },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' },
  statCard: {
    backgroundColor: 'white', borderRadius: '12px', padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  statValue: { fontSize: '24px', fontWeight: '700', color: '#111827' },
  statLabel: { fontSize: '12px', color: '#6b7280', marginTop: '2px' },
  twoCol: { display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px' },
  panel: {
    backgroundColor: 'white', borderRadius: '12px', padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  panelTitle: { fontSize: '15px', fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: '4px' },
  panelSubtitle: { fontSize: '12px', color: '#9ca3af', marginTop: 0, marginBottom: '16px' },
  statRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 0', borderBottom: '1px solid #f3f4f6', fontSize: '14px',
  },
  rowValue: { fontWeight: '700', fontSize: '16px' },
  empty: { color: '#9ca3af', fontSize: '14px', padding: '16px 0' },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: '8px' },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: '11px', color: '#6b7280', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase' },
  td: { padding: '10px 12px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #f3f4f6' },
  badge: {
    backgroundColor: '#2E7D32', color: 'white', padding: '3px 10px',
    borderRadius: '999px', fontSize: '11px', fontWeight: '600',
  },
}