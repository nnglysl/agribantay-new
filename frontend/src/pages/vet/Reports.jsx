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
import VetLayout from '../../components/VetLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import sanJoseLogo from '../../assets/sanjose-logo.png'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip)

const BIRD_ESTIMATES = {
  'Small': 'Up to 2,000 birds',
  'Semi-Commercial': '2,001–10,000 birds',
  'Commercial': '10,001+ birds',
}

export default function VetReports() {
  const { data, loading, error } = useCachedFetch('/vet/reports')
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

      pdf.save(`AgriBantay_Vaccination_Report_${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (err) {
      console.error('PDF export failed:', err)
      alert('Could not generate PDF. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const completedVaccinations = data?.completed_vaccinations ?? []

  const completedThisMonth = useMemo(() => {
    const now = new Date()
    return completedVaccinations.filter(v => {
      const d = new Date(v.completed_at)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).length
  }, [completedVaccinations])

  const monthlyTrend = useMemo(() => {
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString('default', { month: 'short' }), count: 0 })
    }
    completedVaccinations.forEach(v => {
      const d = new Date(v.completed_at)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      const bucket = months.find(m => m.key === key)
      if (bucket) bucket.count += 1
    })
    return months
  }, [completedVaccinations])

  const generatedAt = new Date().toLocaleString('en-PH', {
    dateStyle: 'long',
    timeStyle: 'short',
  })

  if (loading) return <VetLayout><p>Loading...</p></VetLayout>
  if (error) return <VetLayout><p style={{ color: '#dc2626' }}>{error}</p></VetLayout>
  if (!data) return <VetLayout><p>Loading...</p></VetLayout>

  return (
    <VetLayout>
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
            <p style={styles.subtitle}>Vaccination history and records</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <select style={styles.select}>
              <option>All time</option>
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
            <div style={styles.statValue}>{data.total_vaccinations}</div>
            <div style={styles.statLabel}>Total vaccinations</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{data.farms_covered}</div>
            <div style={styles.statLabel}>Farms covered</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{completedThisMonth}</div>
            <div style={styles.statLabel}>Completed this month</div>
          </div>
        </div>

        <div style={{ ...styles.panel, marginTop: '20px' }}>
          <h3 style={styles.panelTitle}>Vaccinations per month</h3>
          <p style={styles.panelSubtitle}>Last 6 months</p>
          {monthlyTrend.every(m => m.count === 0) ? (
            <div style={styles.empty}>No vaccination history yet.</div>
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

        <div style={{ ...styles.panel, marginTop: '20px' }}>
          <h3 style={styles.panelTitle}>Completed vaccinations</h3>
          {completedVaccinations.length === 0 ? (
            <div style={styles.empty}>No completed vaccinations yet.</div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>ID</th>
                  <th style={styles.th}>Farm</th>
                  <th style={styles.th}>Owner</th>
                  <th style={styles.th}>Barangay</th>
                  <th style={styles.th}>Est. birds</th>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Notes</th>
                  <th style={styles.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {completedVaccinations.map(v => (
                  <tr key={v.id}>
                    <td style={styles.td}>{v.id}</td>
                    <td style={styles.td}>{v.farm_name}</td>
                    <td style={styles.td}>{v.owner_name}</td>
                    <td style={styles.td}>{v.barangay}</td>
                    <td style={styles.td}>{BIRD_ESTIMATES[v.farm_size] || '—'}</td>
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

        <h1 style={{ fontSize: '18px', textAlign: 'center', margin: '16px 0 4px' }}>AgriBantay Vaccination Report</h1>
        <p style={{ fontSize: '12px', textAlign: 'center', margin: '0 0 4px' }}>Vaccination history and records</p>
        <p style={{ fontSize: '11px', textAlign: 'center', margin: '0 0 16px' }}>Generated {generatedAt}</p>

        <div className="print-section-title">Summary</div>
        <table className="print-table">
          <tbody>
            <tr><th>Total vaccinations</th><td>{data.total_vaccinations}</td></tr>
            <tr><th>Farms covered</th><td>{data.farms_covered}</td></tr>
            <tr><th>Completed this month</th><td>{completedThisMonth}</td></tr>
          </tbody>
        </table>

        <div className="print-section-title">Completed vaccinations</div>
        {completedVaccinations.length === 0 ? (
          <p style={{ fontSize: '12px' }}>No completed vaccinations on record.</p>
        ) : (
          <table className="print-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Farm</th>
                <th>Owner</th>
                <th>Barangay</th>
                <th>Est. birds</th>
                <th>Date</th>
                <th>Notes</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {completedVaccinations.map(v => (
                <tr key={v.id}>
                  <td>{v.id}</td>
                  <td>{v.farm_name}</td>
                  <td>{v.owner_name}</td>
                  <td>{v.barangay}</td>
                  <td>{BIRD_ESTIMATES[v.farm_size] || '—'}</td>
                  <td>{v.completed_at}</td>
                  <td>{v.notes}</td>
                  <td>{v.status}</td>
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
            <div style={{ borderTop: '1px solid #000', width: '220px', paddingTop: '4px' }}>{data.vet_name || 'Municipal Veterinarian'}</div>
          </div>
        </div>
      </div>
    </VetLayout>
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
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' },
  statCard: {
    backgroundColor: 'white', borderRadius: '12px', padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  statValue: { fontSize: '28px', fontWeight: '700', color: '#111827' },
  statLabel: { fontSize: '13px', color: '#6b7280', marginTop: '2px' },
  panel: {
    backgroundColor: 'white', borderRadius: '12px', padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  panelTitle: { fontSize: '15px', fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: '4px' },
  panelSubtitle: { fontSize: '12px', color: '#9ca3af', marginTop: 0, marginBottom: '16px' },
  empty: { color: '#9ca3af', fontSize: '14px', padding: '16px 0' },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: '8px' },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: '11px', color: '#6b7280', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase' },
  td: { padding: '10px 12px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #f3f4f6' },
  badge: {
    backgroundColor: '#2E7D32', color: 'white', padding: '3px 10px',
    borderRadius: '999px', fontSize: '11px', fontWeight: '600',
  },
}