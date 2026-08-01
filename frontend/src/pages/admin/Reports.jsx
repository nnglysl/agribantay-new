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
import AdminLayout from '../../components/AdminLayout'
import ReportLetterhead from '../../components/ReportLetterhead'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { exportToCSV, exportPrintRefToPDF, todayStamp } from '../../utils/exportUtils'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip)

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'year', label: 'This Year' },
  { value: 'custom', label: 'Custom range' },
]

const CSV_COLUMNS = [
  { key: 'inspection_number', label: 'ID' },
  { key: 'farm_name', label: 'Farm' },
  { key: 'owner_name', label: 'Owner' },
  { key: 'inspection_type', label: 'Type' },
  { key: 'completed_at', label: 'Date' },
  { key: 'status', label: 'Status' },
]

const PAGE_SIZE = 5

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
    default:
      return [null, null]
  }
}

/* ---- Small inline icons (stroke, currentColor) ---- */
const IconPrint = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="1.5" /><path d="M7 17h10v4H7z" /></svg>
)
const IconFile = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" /><path d="M14 3v5h5" /></svg>
)

function StatCard({ value, valueColor, label, labelColor, cardBg }) {
  return (
    <div style={{ ...styles.statCard, background: cardBg }}>
      <div style={{ ...styles.statValue, color: valueColor }}>{value}</div>
      <div style={{ ...styles.statLabel, color: labelColor }}>{label}</div>
    </div>
  )
}

export default function Reports() {
  const { data, loading, error } = useCachedFetch('/admin/reports')
  const printRef = useRef(null)
  const [exportingPdf, setExportingPdf] = useState(false)

  const [range, setRange] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [page, setPage] = useState(1)

  const handlePrint = () => window.print()

  const handleExportPdf = async () => {
    setExportingPdf(true)
    try {
      await exportPrintRefToPDF(printRef, `AgriBantay_Report_${todayStamp()}.pdf`)
    } catch (err) {
      console.error('PDF export failed:', err)
      alert('Could not generate PDF. Please try again.')
    } finally {
      setExportingPdf(false)
    }
  }

  const handleExportCsv = () => {
    exportToCSV(completedInspections, CSV_COLUMNS, `AgriBantay_Report_${todayStamp()}.csv`)
  }

  const allCompletedInspections = data?.completed_inspections ?? []

  const [rangeStart, rangeEnd] = useMemo(
    () => getRangeBounds(range, customFrom, customTo),
    [range, customFrom, customTo]
  )

  const completedInspections = useMemo(() => {
    if (!rangeStart || !rangeEnd) return allCompletedInspections
    return allCompletedInspections.filter(insp => {
      const d = new Date(insp.completed_at)
      return d >= rangeStart && d <= rangeEnd
    })
  }, [allCompletedInspections, rangeStart, rangeEnd])

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

  // Pagination — reset to page 1 whenever the filtered set changes.
  const totalRows = completedInspections.length
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * PAGE_SIZE
  const pageRows = completedInspections.slice(pageStart, pageStart + PAGE_SIZE)
  const goToPage = (n) => setPage(Math.min(Math.max(1, n), totalPages))

  const generatedAt = new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })
  const selectedRangeLabel = RANGE_OPTIONS.find(o => o.value === range)?.label ?? ''

  if (loading) return <AdminLayout><p style={styles.stateText}>Loading...</p></AdminLayout>
  if (error) return <AdminLayout><p style={{ ...styles.stateText, color: '#b91c1c' }}>{error}</p></AdminLayout>
  if (!data) return <AdminLayout><p style={styles.stateText}>Loading...</p></AdminLayout>

  return (
    <AdminLayout>
      <style>{`
        /* Layout reacts to the report's own content width (container query),
           so it works next to the sidebar at every size — no dead-zone. */
        .rp { container-type: inline-size; max-width: 100%; }

        .rp-header   { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
        .rp-titles   { min-width: 0; }
        .rp-title    { font-size: 24px; font-weight: 800; letter-spacing: -0.015em; color: #16311d; margin: 0; }
        .rp-controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .rp-actions  { display: flex; gap: 10px; }

        .rp-stats  { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
        .rp-two    { display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; margin-top: 20px; }
        .rp-two > * { min-width: 0; }

        .rp-table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .rp-table        { width: 100%; border-collapse: collapse; margin-top: 8px; min-width: 560px; }
        .rp-cards { display: none; flex-direction: column; gap: 12px; }

        @container (max-width: 900px) {
          .rp-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .rp-two   { grid-template-columns: 1fr; gap: 14px; }
        }
        @container (max-width: 680px) {
          .rp-table-scroll { display: none; }
          .rp-cards { display: flex; }
        }
        @container (max-width: 620px) {
          .rp-range { width: 100%; }
          .rp-actions { width: 100%; display: grid; grid-template-columns: repeat(3, 1fr); }
          .rp-actions > button { width: 100%; padding: 0 8px; }
          .rp-title { font-size: 21px; }
        }

        .print-view {
          position: absolute; left: -9999px; top: 0; width: 800px; padding: 40px;
          box-sizing: border-box; display: block;
          font-family: Georgia, 'Times New Roman', serif; color: #000; background: #fff;
        }
        .print-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        .print-table th, .print-table td { border: 1px solid #000; padding: 6px 10px; text-align: left; font-size: 12px; }
        .print-table th { background: #fff; font-weight: bold; }
        .print-section-title { font-size: 13px; font-weight: bold; text-transform: uppercase; margin: 24px 0 8px; border-bottom: 1px solid #000; padding-bottom: 4px; }
        @media print {
          .screen-view { display: none !important; }
          .print-view { position: static; left: auto; }
        }
      `}</style>

      <div className="screen-view rp">
        <div className="rp-header">
          <div className="rp-titles">
            <h1 className="rp-title">Reports</h1>
            <p style={styles.subtitle}>Municipality-wide analytics</p>
          </div>
          <div className="rp-controls">
            <select className="rp-range" value={range} onChange={e => { setRange(e.target.value); setPage(1) }} style={styles.select}>
              {RANGE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <div className="rp-actions">
              <button style={styles.secondaryBtn} onClick={handlePrint}><IconPrint />Print</button>
              <button style={styles.secondaryBtn} onClick={handleExportCsv}><IconFile />Export CSV</button>
              <button
                style={{ ...styles.primaryBtn, ...(exportingPdf ? styles.btnDisabled : {}) }}
                onClick={handleExportPdf}
                disabled={exportingPdf}
              >
                <IconFile />{exportingPdf ? 'Generating...' : 'Export PDF'}
              </button>
            </div>
          </div>
        </div>

        {range === 'custom' && (
          <div style={styles.customRow}>
            <div style={styles.customField}>
              <label style={styles.customLabel}>From</label>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={styles.customInput} />
            </div>
            <div style={styles.customField}>
              <label style={styles.customLabel}>To</label>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={styles.customInput} />
            </div>
          </div>
        )}

        <div className="rp-stats">
         <StatCard value={data.inspection_summary.total} valueColor="#1b6135" label="Total inspections" labelColor="#6b7770" cardBg="#fff" />
          <StatCard value={data.inspection_summary.completed} valueColor="#256b3d" label="Completed" labelColor="#6b7770" cardBg="#fff" />
          <StatCard value={data.inspection_summary.scheduled} valueColor="#b45309" label="Scheduled" labelColor="#6b7770" cardBg="#fff" />
          <StatCard value={data.alert_summary.total} valueColor="#1b6135" label="Alerts this month" labelColor="#6b7770" cardBg="#fff" />
          <StatCard value={data.alert_summary.critical_alerts} valueColor="#b91c1c" label="Critical alerts" labelColor="#8f2020" cardBg="#fff" />
        </div>
        <p style={styles.statsNote}>
          Stat cards above show all-time totals. The chart and table below reflect: <strong style={{ color: '#6b7770' }}>{selectedRangeLabel}</strong>.
        </p>

        <div className="rp-two">
          <div style={styles.panel}>
            <h3 style={styles.panelTitle}>Completed inspections per month</h3>
            <p style={styles.panelSubtitle}>Last 6 months</p>
            {monthlyTrend.every(m => m.count === 0) ? (
              <div style={styles.empty}>No inspection history yet.</div>
            ) : (
              <div style={{ position: 'relative', height: '220px' }}>
                <Line
                  data={{
                    labels: monthlyTrend.map(m => m.label),
                    datasets: [{ data: monthlyTrend.map(m => m.count), borderColor: '#2c8047', backgroundColor: '#2c8047', tension: 0.3, pointRadius: 4 }],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      y: { beginAtZero: true, ticks: { stepSize: 1, color: '#8a968d' }, grid: { color: '#f2f3ed' } },
                      x: { ticks: { color: '#8a968d' }, grid: { display: false } },
                    },
                  }}
                />
              </div>
            )}
          </div>

          <div style={styles.panel}>
            <h3 style={styles.panelTitle}>Alert breakdown</h3>
            <StatRow label="Ammonia threshold breaches" value={data.alert_summary.ammonia_breaches} color="#b91c1c" />
            <StatRow label="Temperature anomalies" value={data.alert_summary.temp_anomalies} color="#b45309" />
            <StatRow label="Humidity anomalies" value={data.alert_summary.humidity_anomalies} color="#b45309" />
            <StatRow label="Critical alerts" value={data.alert_summary.critical_alerts} color="#b91c1c" />
          </div>
        </div>

        <div style={{ ...styles.panel, marginTop: '20px' }}>
          <h3 style={styles.panelTitle}>Completed inspections</h3>
          <p style={styles.panelSubtitle}>{selectedRangeLabel}</p>

          {completedInspections.length === 0 ? (
            <div style={styles.empty}>No completed inspections in this range.</div>
          ) : (
            <>
              {/* Desktop / wide: table */}
              <div className="rp-table-scroll">
                <table className="rp-table">
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
                    {pageRows.map(i => (
                      <tr key={i.id}>
                        <td style={styles.td}>{i.inspection_number}</td>
                        <td style={{ ...styles.td, fontWeight: 600, color: '#16311d' }}>{i.farm_name}</td>
                        <td style={styles.td}>{i.owner_name}</td>
                        <td style={styles.td}>{i.inspection_type}</td>
                        <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{i.completed_at}</td>
                        <td style={styles.td}>
                          <span style={styles.badge}><span style={styles.badgeDot} />{i.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: cards */}
              <div className="rp-cards">
                {pageRows.map(i => (
                  <div key={i.id} style={styles.mCard}>
                    <div style={{ minWidth: 0 }}>
                      <div style={styles.mCardName}>{i.farm_name}</div>
                      <div style={styles.mCardOwner}>{i.owner_name}</div>
                      <div style={styles.mCardMeta}>{i.inspection_type} · {i.inspection_number}</div>
                    </div>
                    <div style={styles.mCardRight}>
                      <span style={styles.mCardDate}>{i.completed_at}</span>
                      <span style={styles.badge}><span style={styles.badgeDot} />{i.status}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              <div style={styles.pager}>
                <span style={styles.pagerInfo}>
                  Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, totalRows)} of {totalRows}
                </span>
                <div style={styles.pagerBtns}>
                  <button style={styles.pageBtn} onClick={() => goToPage(safePage - 1)} disabled={safePage === 1}>Prev</button>
                  {Array.from({ length: totalPages }, (_, idx) => idx + 1).map(n => (
                    <button
                      key={n}
                      onClick={() => goToPage(n)}
                      style={{ ...styles.pageBtn, ...(n === safePage ? styles.pageBtnActive : {}) }}
                    >
                      {n}
                    </button>
                  ))}
                  <button style={styles.pageBtn} onClick={() => goToPage(safePage + 1)} disabled={safePage === totalPages}>Next</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="print-view" ref={printRef}>
        <ReportLetterhead />
        <h1 style={{ fontSize: '18px', textAlign: 'center', margin: '16px 0 4px' }}>AgriBantay Municipal Report</h1>
        <p style={{ fontSize: '12px', textAlign: 'center', margin: '0 0 4px' }}>Poultry farm monitoring and service summary</p>
        <p style={{ fontSize: '11px', textAlign: 'center', margin: '0 0 4px' }}>Period: {selectedRangeLabel}</p>
        <p style={{ fontSize: '11px', textAlign: 'center', margin: '0 0 16px' }}>Generated {generatedAt}</p>

        <div className="print-section-title">Inspection summary (all-time)</div>
        <table className="print-table">
          <tbody>
            <tr><th>Total inspections</th><td>{data.inspection_summary.total}</td></tr>
            <tr><th>Completed</th><td>{data.inspection_summary.completed}</td></tr>
            <tr><th>Scheduled</th><td>{data.inspection_summary.scheduled}</td></tr>
            <tr><th>General inspections</th><td>{data.inspection_summary.general}</td></tr>
            <tr><th>Follow-ups</th><td>{data.inspection_summary.follow_up}</td></tr>
          </tbody>
        </table>

        <div className="print-section-title">Alert summary (all-time)</div>
        <table className="print-table">
          <tbody>
            <tr><th>Total alerts this month</th><td>{data.alert_summary.total}</td></tr>
            <tr><th>Ammonia threshold breaches</th><td>{data.alert_summary.ammonia_breaches}</td></tr>
            <tr><th>Temperature anomalies</th><td>{data.alert_summary.temp_anomalies}</td></tr>
            <tr><th>Humidity anomalies</th><td>{data.alert_summary.humidity_anomalies}</td></tr>
            <tr><th>Critical alerts</th><td>{data.alert_summary.critical_alerts}</td></tr>
          </tbody>
        </table>

        <div className="print-section-title">Completed inspections — {selectedRangeLabel}</div>
        {completedInspections.length === 0 ? (
          <p style={{ fontSize: '12px' }}>No completed inspections in this range.</p>
        ) : (
          <table className="print-table">
            <thead>
              <tr><th>ID</th><th>Farm</th><th>Owner</th><th>Type</th><th>Date</th><th>Status</th></tr>
            </thead>
            <tbody>
              {completedInspections.map(i => (
                <tr key={i.id}>
                  <td>{i.inspection_number}</td><td>{i.farm_name}</td><td>{i.owner_name}</td>
                  <td>{i.inspection_type}</td><td>{i.completed_at}</td><td>{i.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
          <div><div style={{ borderTop: '1px solid #000', width: '220px', paddingTop: '4px' }}>Prepared by</div></div>
          <div><div style={{ borderTop: '1px solid #000', width: '220px', paddingTop: '4px' }}>Noted by, LGU Administrator</div></div>
        </div>
      </div>
    </AdminLayout>
  )
}

function StatRow({ label, value, color }) {
  return (
    <div style={styles.statRow}>
      <span style={styles.statRowLabel}>{label}</span>
      <span style={{ ...styles.rowValue, color: color || '#16311d' }}>{value}</span>
    </div>
  )
}

const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },
  subtitle: { fontSize: '13.5px', color: '#6b7770', marginTop: '5px' },
  select: { backgroundColor: '#fff', color: '#33413a', border: '1px solid #dcdfd6', borderRadius: '10px', padding: '0 12px', fontSize: '14px', height: '40px', cursor: 'pointer', fontFamily: SANS, minWidth: '150px' },
  primaryBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '3px', backgroundColor: '#2c8047', color: '#fff', border: 'none', borderRadius: '10px', padding: '0 16px', height: '40px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS },
  secondaryBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '3px', backgroundColor: '#fff', color: '#2c8047', border: '1px solid #cfe0d3', borderRadius: '10px', padding: '0 16px', height: '40px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS },
  btnDisabled: { opacity: 0.6, cursor: 'not-allowed' },

  customRow: { display: 'flex', gap: '12px', flexWrap: 'wrap', margin: '16px 0' },
  customField: { display: 'flex', flexDirection: 'column', gap: '5px', flex: '1 1 180px' },
  customLabel: { fontSize: '12px', color: '#6b7770', fontWeight: 600 },
  customInput: { padding: '9px 12px', borderRadius: '10px', border: '1px solid #dcdfd6', fontSize: '14px', fontFamily: SANS },

  statCard: { borderRadius: '14px', padding: '18px 20px', border: '1px solid #e7e8e0', boxShadow: '0 2px 10px rgba(22,49,29,0.04)' },
  statValue: { fontSize: '26px', fontWeight: 800, letterSpacing: '-0.02em', color: '#16311d', lineHeight: 1 },
  statLabel: { fontSize: '12.5px', color: '#6b7770', marginTop: '6px', fontWeight: 600 },
  statsNote: { fontSize: '11.5px', color: '#9aa79d', marginTop: '12px', marginBottom: 0, lineHeight: 1.5 },

  panel: { backgroundColor: '#fff', borderRadius: '14px', padding: '24px', border: '1px solid #e7e8e0', minWidth: 0 },
  panelTitle: { fontSize: '15px', fontWeight: 700, color: '#16311d', marginTop: 0, marginBottom: '4px' },
  panelSubtitle: { fontSize: '12px', color: '#9aa79d', marginTop: 0, marginBottom: '16px' },
  statRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid #f2f3ed', fontSize: '14px' },
  statRowLabel: { fontSize: '13.5px', color: '#4b5a50' },
  rowValue: { fontWeight: 800, fontSize: '16px', fontVariantNumeric: 'tabular-nums' },
  empty: { color: '#9aa79d', fontSize: '14px', padding: '16px 0' },

  th: { textAlign: 'left', padding: '12px 14px', fontSize: '11px', fontWeight: 700, color: '#8a968d', borderBottom: '1px solid #eceee7', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', backgroundColor: '#fafbf8' },
  td: { padding: '12px 14px', fontSize: '13px', color: '#4b5a50', borderBottom: '1px solid #f2f3ed', verticalAlign: 'middle' },
  badge: { display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#eaf3ec', color: '#256b3d', padding: '4px 11px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' },
  badgeDot: { width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#256b3d', flexShrink: 0 },

  mCard: { border: '1px solid #eceee7', borderRadius: '12px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', gap: '12px', background: '#fcfdfb' },
  mCardName: { fontSize: '14.5px', fontWeight: 700, color: '#16311d' },
  mCardOwner: { fontSize: '13px', color: '#6b7770', marginTop: '3px' },
  mCardMeta: { fontSize: '12.5px', color: '#9aa79d', marginTop: '2px' },
  mCardRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 },
  mCardDate: { fontSize: '12.5px', color: '#6b7770', whiteSpace: 'nowrap' },

  pager: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '18px', flexWrap: 'wrap' },
  pagerInfo: { fontSize: '12.5px', color: '#9aa79d' },
  pagerBtns: { display: 'flex', alignItems: 'center', gap: '6px' },
  pageBtn: { height: '36px', minWidth: '36px', padding: '0 12px', borderRadius: '9px', border: '1px solid #dcdfd6', background: '#fff', color: '#33413a', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS },
  pageBtnActive: { background: '#2c8047', color: '#fff', borderColor: '#2c8047' },
}