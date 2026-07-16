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
import VetLayout from '../../components/VetLayout'
import ReportLetterhead from '../../components/ReportLetterhead'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'
import { exportToCSV, exportPrintRefToPDF, todayStamp } from '../../utils/exportUtils'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip)

const BIRD_ESTIMATES = {
  'Small': 'Up to 2,000 birds',
  'Semi-Commercial': '2,001–10,000 birds',
  'Commercial': '10,001+ birds',
}

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'year', label: 'This Year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
]

// Standardized CSV column set for this report — same shape as the
// on-screen and printed table, and the same pattern as the Admin
// report's CSV_COLUMNS so every module's export code reads the same way.
const CSV_COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'farm_name', label: 'Farm' },
  { key: 'owner_name', label: 'Owner' },
  { key: 'barangay', label: 'Barangay' },
  { key: 'est_birds', label: 'Est. birds' },
  { key: 'completed_at', label: 'Date' },
  { key: 'notes', label: 'Notes' },
  { key: 'status', label: 'Status' },
]

function getRangeBounds(rangeKey, customFrom, customTo) {
  const now = new Date()
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0)
  const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)

  switch (rangeKey) {
    case 'today':
      return [startOfDay(now), endOfDay(now)]
    case 'week': {
      const day = now.getDay()
      const start = new Date(now)
      start.setDate(now.getDate() - day)
      return [startOfDay(start), endOfDay(now)]
    }
    case 'month':
      return [new Date(now.getFullYear(), now.getMonth(), 1), endOfDay(now)]
    case 'quarter': {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3
      return [new Date(now.getFullYear(), quarterStartMonth, 1), endOfDay(now)]
    }
    case 'year':
      return [new Date(now.getFullYear(), 0, 1), endOfDay(now)]
    case 'custom':
      if (!customFrom || !customTo) return [null, null]
      return [startOfDay(new Date(customFrom)), endOfDay(new Date(customTo))]
    case 'all':
    default:
      return [null, null]
  }
}

export default function VetReports() {
  const { data, loading, error } = useCachedFetch('/vet/reports')
  const printRef = useRef(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const isMobile = useIsMobile()

  const [range, setRange] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const handlePrint = () => window.print()

  const handleExportPdf = async () => {
    setExportingPdf(true)
    try {
      await exportPrintRefToPDF(printRef, `AgriBantay_Vaccination_Report_${todayStamp()}.pdf`)
    } catch (err) {
      console.error('PDF export failed:', err)
      alert('Could not generate PDF. Please try again.')
    } finally {
      setExportingPdf(false)
    }
  }

  const handleExportCsv = () => {
    const rows = completedVaccinations.map(v => ({
      id: v.id,
      farm_name: v.farm_name,
      owner_name: v.owner_name,
      barangay: v.barangay,
      est_birds: BIRD_ESTIMATES[v.farm_size] || '—',
      completed_at: v.completed_at,
      notes: v.notes,
      status: v.status,
    }))
    exportToCSV(rows, CSV_COLUMNS, `AgriBantay_Vaccination_Report_${todayStamp()}.csv`)
  }

  const allCompletedVaccinations = data?.completed_vaccinations ?? []

  const [rangeStart, rangeEnd] = useMemo(
    () => getRangeBounds(range, customFrom, customTo),
    [range, customFrom, customTo]
  )

  const completedVaccinations = useMemo(() => {
    if (!rangeStart || !rangeEnd) return allCompletedVaccinations
    return allCompletedVaccinations.filter(v => {
      const d = new Date(v.completed_at)
      return d >= rangeStart && d <= rangeEnd
    })
  }, [allCompletedVaccinations, rangeStart, rangeEnd])

  const completedThisMonth = useMemo(() => {
    const now = new Date()
    return allCompletedVaccinations.filter(v => {
      const d = new Date(v.completed_at)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).length
  }, [allCompletedVaccinations])

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

  const selectedRangeLabel = RANGE_OPTIONS.find(o => o.value === range)?.label ?? ''

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
        <div style={{ ...styles.header, ...(isMobile ? styles.headerMobile : {}) }}>
          <div>
            <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Reports</h1>
            <p style={styles.subtitle}>Vaccination history and records</p>
          </div>
          <div style={{ ...styles.controlsRow, ...(isMobile ? styles.controlsRowMobile : {}) }}>
            <select
              value={range}
              onChange={e => setRange(e.target.value)}
              style={{ ...styles.select, ...(isMobile ? styles.controlFull : {}) }}
            >
              {RANGE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button style={{ ...styles.printBtn, ...(isMobile ? styles.controlFull : {}) }} onClick={handlePrint}>Print</button>
            <button style={{ ...styles.csvBtn, ...(isMobile ? styles.controlFull : {}) }} onClick={handleExportCsv}>
              Export CSV
            </button>
            <button
              style={{ ...styles.exportBtn, ...(isMobile ? styles.controlFull : {}) }}
              onClick={handleExportPdf}
              disabled={exportingPdf}
            >
              {exportingPdf ? 'Generating...' : 'Export PDF'}
            </button>
          </div>
        </div>

        {range === 'custom' && (
          <div style={{ ...styles.customRow, ...(isMobile ? styles.customRowMobile : {}) }}>
            <div style={styles.customField}>
              <label style={styles.customLabel}>From</label>
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                style={styles.customInput}
              />
            </div>
            <div style={styles.customField}>
              <label style={styles.customLabel}>To</label>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                style={styles.customInput}
              />
            </div>
          </div>
        )}

        <div style={{ ...styles.statsGrid, ...(isMobile ? styles.statsGridMobile : {}) }}>
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
        <p style={styles.statsNote}>
          Stat cards above show all-time / this-month totals. The chart and table below reflect: <strong>{selectedRangeLabel}</strong>.
        </p>

        <div style={{ ...styles.panel, ...(isMobile ? styles.panelMobile : {}), marginTop: '20px' }}>
          <h3 style={styles.panelTitle}>Vaccinations per month</h3>
          <p style={styles.panelSubtitle}>Last 6 months</p>
          {monthlyTrend.every(m => m.count === 0) ? (
            <div style={styles.empty}>No vaccination history yet.</div>
          ) : (
            <div style={{ position: 'relative', height: isMobile ? '220px' : '200px' }}>
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

        <div style={{ ...styles.panel, ...(isMobile ? styles.panelMobile : {}), marginTop: '20px' }}>
          <h3 style={styles.panelTitle}>Completed vaccinations</h3>
          <p style={styles.panelSubtitle}>{selectedRangeLabel}</p>
          {completedVaccinations.length === 0 ? (
            <div style={styles.empty}>No completed vaccinations in this range.</div>
          ) : (
            <>
              {isMobile && <p style={styles.scrollHint}>Swipe left/right to see all columns →</p>}
              <div style={isMobile ? styles.tableScroll : undefined}>
                <table style={{ ...styles.table, ...(isMobile ? styles.tableMobile : {}) }}>
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
              </div>
            </>
          )}
        </div>
      </div>

      <div className="print-view" ref={printRef}>
        <ReportLetterhead />

        <h1 style={{ fontSize: '18px', textAlign: 'center', margin: '16px 0 4px' }}>AgriBantay Vaccination Report</h1>
        <p style={{ fontSize: '12px', textAlign: 'center', margin: '0 0 4px' }}>Vaccination history and records</p>
        <p style={{ fontSize: '11px', textAlign: 'center', margin: '0 0 4px' }}>Period: {selectedRangeLabel}</p>
        <p style={{ fontSize: '11px', textAlign: 'center', margin: '0 0 16px' }}>Generated {generatedAt}</p>

        <div className="print-section-title">Summary</div>
        <table className="print-table">
          <tbody>
            <tr><th>Total vaccinations</th><td>{data.total_vaccinations}</td></tr>
            <tr><th>Farms covered</th><td>{data.farms_covered}</td></tr>
            <tr><th>Completed this month</th><td>{completedThisMonth}</td></tr>
          </tbody>
        </table>

        <div className="print-section-title">Completed vaccinations — {selectedRangeLabel}</div>
        {completedVaccinations.length === 0 ? (
          <p style={{ fontSize: '12px' }}>No completed vaccinations in this range.</p>
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
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' },
  headerMobile: { flexDirection: 'column', gap: '14px' },
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  titleMobile: { fontSize: '18px' },
  subtitle: { fontSize: '13px', color: '#6b7280', marginTop: '4px' },
  controlsRow: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  controlsRowMobile: { flexDirection: 'column', width: '100%' },
  controlFull: { width: '100%', boxSizing: 'border-box' },
  select: {
    backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db',
    borderRadius: '8px', padding: '0 12px', fontSize: '14px', height: '38px',
  },
  printBtn: {
      background: 'linear-gradient(135deg, #E8C766 0%, #D4AF37 55%, #B8912B 100%)', color: '#122A1E', border: 'none',
      borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
      boxShadow: '0 4px 12px rgba(212,175,55,0.28)',
    },
  csvBtn: {
      background: 'linear-gradient(135deg, #D68A46 0%, #B5651D 100%)', color: 'white', border: 'none',
      borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
      boxShadow: '0 4px 12px rgba(181,101,29,0.28)',
  },
  exportBtn: {
      background: 'linear-gradient(135deg, #234A35 0%, #122A1E 100%)', color: 'white', border: 'none',
      borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
      boxShadow: '0 4px 12px rgba(18,42,30,0.28)',
  },
  customRow: { display: 'flex', gap: '12px', marginBottom: '16px' },
  customRowMobile: { flexDirection: 'column' },
  customField: { display: 'flex', flexDirection: 'column', gap: '4px' },
  customLabel: { fontSize: '12px', color: '#6b7280', fontWeight: '500' },
  customInput: {
    padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px',
  },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' },
  statsGridMobile: { gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' },
  statCard: {
    backgroundColor: 'white', borderRadius: '12px', padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  statValue: { fontSize: '28px', fontWeight: '700', color: '#111827' },
  statLabel: { fontSize: '13px', color: '#6b7280', marginTop: '2px' },
  statsNote: { fontSize: '11px', color: '#9ca3af', marginTop: '10px', marginBottom: 0 },
  panel: {
    backgroundColor: 'white', borderRadius: '12px', padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  panelMobile: { padding: '16px' },
  panelTitle: { fontSize: '15px', fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: '4px' },
  panelSubtitle: { fontSize: '12px', color: '#9ca3af', marginTop: 0, marginBottom: '16px' },
  empty: { color: '#9ca3af', fontSize: '14px', padding: '16px 0' },
  scrollHint: { fontSize: '11px', color: '#9ca3af', marginTop: 0, marginBottom: '8px' },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: '8px' },
  tableMobile: { minWidth: '700px' },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: '11px', color: '#6b7280', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase', whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #f3f4f6' },
  badge: {
    backgroundColor: '#2E7D32', color: 'white', padding: '3px 10px',
    borderRadius: '999px', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap',
  },
}