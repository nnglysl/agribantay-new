import { useRef, useState, useEffect, useMemo } from 'react'
import AdminLayout from '../../components/AdminLayout'
import ReportLetterhead from '../../components/ReportLetterhead'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'
import { exportPrintRefToPDF, todayStamp } from '../../utils/exportUtils'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

/* ---- Small inline icons (stroke, currentColor) — same as Admin/Vet Reports ---- */
const IconPrint = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="1.5" /><path d="M7 17h10v4H7z" /></svg>
)
const IconFile = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" /><path d="M14 3v5h5" /></svg>
)

export default function SuperAdminReports() {
  const { data: adminData, loading: adminLoading, error: adminError } = useCachedFetch('/admin/reports')
  const { data: vetData, loading: vetLoading, error: vetError } = useCachedFetch('/vet/reports')

  const printRef = useRef(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const isMobile = useIsMobile()

  const handlePrint = () => window.print()

  const handleExportPdf = async () => {
    setExportingPdf(true)
    try {
      await exportPrintRefToPDF(printRef, `AgriBantay_SuperAdmin_Report_${todayStamp()}.pdf`)
    } catch (err) {
      console.error('PDF export failed:', err)
      alert('Could not generate PDF. Please try again.')
    } finally {
      setExportingPdf(false)
    }
  }

  const completedInspections = adminData?.completed_inspections ?? []
  const completedVetServices = vetData?.completed_services ?? []
  const completedAdminServices = adminData?.completed_services ?? []

  const generatedAt = new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })

  const handleExportCsv = () => {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = []
    lines.push('AgriBantay Municipal Report')
    lines.push(`Generated,${esc(generatedAt)}`)
    lines.push('')
    lines.push('Inspection Summary (all-time)')
    lines.push(`Total,${adminData.inspection_summary.total}`)
    lines.push(`Completed,${adminData.inspection_summary.completed}`)
    lines.push(`Scheduled,${adminData.inspection_summary.scheduled}`)
    lines.push('')
    lines.push('Alert Summary (all-time)')
    lines.push(`Critical alerts,${adminData.alert_summary.critical_alerts}`)
    lines.push('')
    lines.push('Service Requests — Odor & Fly Control (all-time)')
    lines.push(`Total,${adminData.service_summary.total}`)
    lines.push(`Completed,${adminData.service_summary.completed}`)
    lines.push(`Pending,${adminData.service_summary.pending}`)
    lines.push('')
    lines.push('Completed Inspections')
    lines.push(['ID', 'Farm', 'Owner', 'Type', 'Date', 'Status'].join(','))
    completedInspections.forEach(i =>
      lines.push([i.inspection_number, i.farm_name, i.owner_name, i.inspection_type, i.completed_at, i.status].map(esc).join(','))
    )
    lines.push('')
    lines.push('Completed Service Requests (Odor & Fly Control)')
    lines.push(['ID', 'Type', 'Farm', 'Owner', 'Barangay', 'Date', 'Status'].join(','))
    completedAdminServices.forEach(s =>
      lines.push([s.id, s.service_type, s.farm_name, s.owner_name, s.barangay, s.completed_at, s.status].map(esc).join(','))
    )
    lines.push('')
    lines.push('Completed Vaccinations & Blood Tests')
    lines.push(['ID', 'Type', 'Farm', 'Owner', 'Barangay', 'Veterinarian', 'Date', 'Status'].join(','))
    completedVetServices.forEach(v =>
      lines.push([v.id, v.service_type, v.farm_name, v.owner_name, v.barangay, v.vet_name || '', v.completed_at, v.status].map(esc).join(','))
    )

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `AgriBantay_SuperAdmin_Report_${todayStamp()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const loading = adminLoading || vetLoading

  if (loading) return <AdminLayout><p style={styles.stateText}>Loading…</p></AdminLayout>
  if (adminError) return <AdminLayout><p style={{ ...styles.stateText, color: '#b91c1c' }}>{adminError}</p></AdminLayout>
  if (vetError) return <AdminLayout><p style={{ ...styles.stateText, color: '#b91c1c' }}>{vetError}</p></AdminLayout>
  if (!adminData || !vetData) return <AdminLayout><p style={styles.stateText}>Loading…</p></AdminLayout>

  return (
    <AdminLayout>
      <style>{`
        .print-view {
          position: absolute; left: -9999px; top: 0; width: 800px; padding: 40px;
          box-sizing: border-box; display: block; font-family: Georgia, 'Times New Roman', serif;
          color: #000; background: #fff;
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

      <div className="screen-view" style={{ fontFamily: SANS }}>
        <div style={{ ...styles.header, ...(isMobile ? styles.headerMobile : {}) }}>
          <div>
            <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Reports</h1>
            <p style={styles.subtitle}>Municipality-wide admin &amp; veterinary summary</p>
          </div>
          <div style={{ ...styles.controlsRow, ...(isMobile ? styles.controlsRowMobile : {}) }}>
            <button style={{ ...styles.secondaryBtn, ...(isMobile ? styles.controlFull : {}) }} onClick={handlePrint}>
              <IconPrint />Print
            </button>
            <button style={{ ...styles.secondaryBtn, ...(isMobile ? styles.controlFull : {}) }} onClick={handleExportCsv}>
              <IconFile />Export CSV
            </button>
            <button
              style={{ ...styles.primaryBtn, ...(isMobile ? styles.controlFull : {}), ...(exportingPdf ? styles.btnDisabled : {}) }}
              onClick={handleExportPdf}
              disabled={exportingPdf}
            >
              <IconFile />{exportingPdf ? 'Generating...' : 'Export PDF'}
            </button>
          </div>
        </div>

        {/* ----------------------------------------------------- Admin section */}
        <div style={styles.sectionLabel}>Admin — Inspections, Alerts &amp; Service Requests</div>
        <div style={{ ...styles.statsGrid, ...(isMobile ? styles.statsGridMobile : {}) }}>
          <StatCard value={adminData.inspection_summary.total} label="Total Inspections" />
          <StatCard value={adminData.inspection_summary.completed} label="Completed Inspections" accent="#2c8047" />
          <StatCard value={adminData.alert_summary.critical_alerts} label="Critical Alerts" accent="#b91c1c" />
          <StatCard value={adminData.service_summary.total} label="Total Service Requests" />
          <StatCard value={adminData.service_summary.completed} label="Completed Requests" accent="#2c8047" />
        </div>

        <div style={{ ...styles.panel, ...(isMobile ? styles.panelMobile : {}), marginTop: '16px' }}>
          <h3 style={styles.panelTitle}>Completed inspections</h3>
          {completedInspections.length === 0 ? (
            <div style={styles.empty}>No completed inspections yet.</div>
          ) : (
            <PaginatedTable
              isMobile={isMobile}
              minWidth="600px"
              columns={['ID', 'Farm', 'Owner', 'Type', 'Date', 'Status']}
              rows={completedInspections}
              renderRow={i => (
                <tr key={i.id}>
                  <td style={styles.td}>{i.inspection_number}</td>
                  <td style={styles.td}>{i.farm_name}</td>
                  <td style={styles.td}>{i.owner_name}</td>
                  <td style={styles.td}>{i.inspection_type}</td>
                  <td style={styles.td}>{i.completed_at}</td>
                  <td style={styles.td}><span style={styles.badge}><span style={styles.badgeDot} />{i.status}</span></td>
                </tr>
              )}
            />
          )}
        </div>

        <div style={{ ...styles.panel, ...(isMobile ? styles.panelMobile : {}), marginTop: '16px' }}>
          <h3 style={styles.panelTitle}>Completed service requests (odor &amp; fly control)</h3>
          {completedAdminServices.length === 0 ? (
            <div style={styles.empty}>No completed odor/fly control requests yet.</div>
          ) : (
            <PaginatedTable
              isMobile={isMobile}
              minWidth="640px"
              columns={['ID', 'Type', 'Farm', 'Owner', 'Barangay', 'Date', 'Status']}
              rows={completedAdminServices}
              renderRow={s => (
                <tr key={s.id}>
                  <td style={styles.td}>{s.id}</td>
                  <td style={styles.td}>{s.service_type}</td>
                  <td style={styles.td}>{s.farm_name}</td>
                  <td style={styles.td}>{s.owner_name}</td>
                  <td style={styles.td}>{s.barangay}</td>
                  <td style={styles.td}>{s.completed_at}</td>
                  <td style={styles.td}><span style={styles.badge}><span style={styles.badgeDot} />{s.status}</span></td>
                </tr>
              )}
            />
          )}
        </div>

        {/* ---------------------------------------------------- Vet section */}
        <div style={{ ...styles.sectionLabel, marginTop: '32px' }}>Veterinarian — Vaccinations &amp; Blood Tests</div>
        <div style={{ ...styles.statsGrid, ...(isMobile ? styles.statsGridMobile : {}) }}>
          <StatCard value={vetData.total_completed} label="Total Completed (Vaccine + Blood Test)" accent="#2c8047" />
        </div>

        <div style={{ ...styles.panel, ...(isMobile ? styles.panelMobile : {}), marginTop: '16px' }}>
          <h3 style={styles.panelTitle}>Completed vaccinations &amp; blood tests</h3>
          {completedVetServices.length === 0 ? (
            <div style={styles.empty}>No completed vet services yet.</div>
          ) : (
            <PaginatedTable
              isMobile={isMobile}
              minWidth="720px"
              columns={['ID', 'Type', 'Farm', 'Owner', 'Barangay', 'Veterinarian', 'Date', 'Status']}
              rows={completedVetServices}
              renderRow={v => (
                <tr key={v.id}>
                  <td style={styles.td}>{v.id}</td>
                  <td style={styles.td}>{v.service_type}</td>
                  <td style={styles.td}>{v.farm_name}</td>
                  <td style={styles.td}>{v.owner_name}</td>
                  <td style={styles.td}>{v.barangay}</td>
                  <td style={styles.td}>{v.vet_name || '—'}</td>
                  <td style={styles.td}>{v.completed_at}</td>
                  <td style={styles.td}><span style={styles.badge}><span style={styles.badgeDot} />{v.status}</span></td>
                </tr>
              )}
            />
          )}
        </div>
      </div>

      <div className="print-view" ref={printRef}>
        <ReportLetterhead />

        <h1 style={{ fontSize: '18px', textAlign: 'center', margin: '16px 0 4px' }}>AgriBantay Municipal Report</h1>
        <p style={{ fontSize: '12px', textAlign: 'center', margin: '0 0 4px' }}>Combined Admin &amp; Veterinary summary</p>
        <p style={{ fontSize: '11px', textAlign: 'center', margin: '0 0 16px' }}>Generated {generatedAt}</p>

        <div className="print-section-title">Inspection summary (all-time)</div>
        <table className="print-table">
          <tbody>
            <tr><th>Total inspections</th><td>{adminData.inspection_summary.total}</td></tr>
            <tr><th>Completed</th><td>{adminData.inspection_summary.completed}</td></tr>
            <tr><th>Scheduled</th><td>{adminData.inspection_summary.scheduled}</td></tr>
          </tbody>
        </table>

        <div className="print-section-title">Alert summary (all-time)</div>
        <table className="print-table">
          <tbody>
            <tr><th>Critical alerts</th><td>{adminData.alert_summary.critical_alerts}</td></tr>
          </tbody>
        </table>

        <div className="print-section-title">Service requests summary — odor &amp; fly control (all-time)</div>
        <table className="print-table">
          <tbody>
            <tr><th>Total requests</th><td>{adminData.service_summary.total}</td></tr>
            <tr><th>Completed</th><td>{adminData.service_summary.completed}</td></tr>
            <tr><th>Pending</th><td>{adminData.service_summary.pending}</td></tr>
          </tbody>
        </table>

        <div className="print-section-title">Vaccination &amp; blood test summary — all veterinarians (all-time)</div>
        <table className="print-table">
          <tbody>
            <tr><th>Total completed</th><td>{vetData.total_completed}</td></tr>
            <tr><th>Farms covered</th><td>{vetData.farms_covered}</td></tr>
          </tbody>
        </table>

        <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
          <div>
            <div style={{ borderTop: '1px solid #000', width: '220px', paddingTop: '4px' }}>Prepared by</div>
          </div>
          <div>
            <div style={{ borderTop: '1px solid #000', width: '220px', paddingTop: '4px' }}>Noted by, System Super Admin</div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}

function StatCard({ value, label, accent }) {
  return (
    <div style={styles.statCard}>
      <div style={{ ...styles.statValue, ...(accent ? { color: accent } : {}) }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  )
}

function PaginatedTable({ columns, rows, renderRow, isMobile, minWidth }) {
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => { setCurrentPage(1) }, [rows, pageSize])

  const totalItems = rows.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const start = (currentPage - 1) * pageSize
  const paginated = rows.slice(start, start + pageSize)
  const rangeStart = totalItems === 0 ? 0 : start + 1
  const rangeEnd = Math.min(currentPage * pageSize, totalItems)

  return (
    <>
      <div style={isMobile ? styles.tableScroll : undefined}>
        <table style={{ ...styles.table, ...(isMobile ? { minWidth } : {}) }}>
          <thead>
            <tr>{columns.map((c, idx) => <th key={idx} style={styles.th}>{c}</th>)}</tr>
          </thead>
          <tbody>{paginated.map(renderRow)}</tbody>
        </table>
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        totalItems={totalItems}
        isMobile={isMobile}
      />
    </>
  )
}

function Pagination({ currentPage, totalPages, pageSize, onPageChange, onPageSizeChange, rangeStart, rangeEnd, totalItems, isMobile }) {
  const pageNumbers = useMemo(() => {
    const maxButtons = isMobile ? 3 : 5
    let start = Math.max(1, currentPage - Math.floor(maxButtons / 2))
    let end = start + maxButtons - 1
    if (end > totalPages) { end = totalPages; start = Math.max(1, end - maxButtons + 1) }
    const pages = []
    for (let p = start; p <= end; p++) pages.push(p)
    return pages
  }, [currentPage, totalPages, isMobile])

  return (
    <div style={{ ...paginationStyles.wrap, ...(isMobile ? paginationStyles.wrapMobile : {}) }}>
      <div style={paginationStyles.info}>
        {totalItems === 0 ? 'No results' : `Showing ${rangeStart}–${rangeEnd} of ${totalItems}`}
      </div>
      <div style={{ ...paginationStyles.controls, ...(isMobile ? paginationStyles.controlsMobile : {}) }}>
        <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))} style={paginationStyles.pageSizeSelect}>
          {PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size} / page</option>)}
        </select>
        <button style={{ ...paginationStyles.navBtn, ...(currentPage === 1 ? paginationStyles.navBtnDisabled : {}) }} onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} aria-label="Previous page">‹</button>
        {pageNumbers[0] > 1 && <span style={paginationStyles.ellipsis}>…</span>}
        {pageNumbers.map(p => (
          <button key={p} onClick={() => onPageChange(p)} style={{ ...paginationStyles.pageBtn, ...(p === currentPage ? paginationStyles.pageBtnActive : {}) }}>{p}</button>
        ))}
        {pageNumbers[pageNumbers.length - 1] < totalPages && <span style={paginationStyles.ellipsis}>…</span>}
        <button style={{ ...paginationStyles.navBtn, ...(currentPage === totalPages ? paginationStyles.navBtnDisabled : {}) }} onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} aria-label="Next page">›</button>
      </div>
    </div>
  )
}

const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },

  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' },
  headerMobile: { flexDirection: 'column', gap: '14px' },
  title: { fontSize: '24px', fontWeight: 800, letterSpacing: '-0.015em', color: '#16311d', margin: 0 },
  titleMobile: { fontSize: '20px' },
  subtitle: { fontSize: '13.5px', color: '#6b7770', marginTop: '5px' },

  controlsRow: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  controlsRowMobile: { flexDirection: 'column', width: '100%' },
  controlFull: { width: '100%', boxSizing: 'border-box' },

  // Matches Admin/Vet Reports exactly — same size, padding, font, icons.
  primaryBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '3px', backgroundColor: '#2c8047', color: '#fff', border: 'none', borderRadius: '10px', padding: '0 16px', height: '40px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS },
  secondaryBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '3px', backgroundColor: '#fff', color: '#2c8047', border: '1px solid #cfe0d3', borderRadius: '10px', padding: '0 16px', height: '40px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS },
  btnDisabled: { opacity: 0.6, cursor: 'not-allowed' },

  sectionLabel: { fontSize: '13px', fontWeight: 700, color: '#8a968d', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' },

  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' },
  statsGridMobile: { gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' },
  statCard: { backgroundColor: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', padding: '18px 20px' },
  statValue: { fontSize: '28px', fontWeight: 800, letterSpacing: '-0.02em', color: '#14301c', lineHeight: 1 },
  statLabel: { fontSize: '12px', color: '#8a968d', marginTop: '8px', fontWeight: 600 },

  panel: { backgroundColor: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', overflow: 'hidden' },
  panelMobile: {},
  panelTitle: { fontSize: '15px', fontWeight: 700, color: '#16311d', margin: 0, padding: '16px 20px 14px', borderBottom: '1px solid #f0efe8' },
  empty: { color: '#9aa79d', fontSize: '14px', padding: '28px 20px', textAlign: 'center' },

  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', padding: '13px 20px', fontSize: '11px', fontWeight: 700, color: '#8a968d',
    borderBottom: '1px solid #eceee7', textTransform: 'uppercase', letterSpacing: '0.05em',
    whiteSpace: 'nowrap', backgroundColor: '#fafbf8',
  },
  td: { padding: '13px 20px', fontSize: '13px', color: '#4b5a50', borderBottom: '1px solid #f2f3ed', verticalAlign: 'middle' },
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 11px',
    borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap',
    color: '#2c8047', backgroundColor: '#eaf3ec',
  },
  badgeDot: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, backgroundColor: '#2c8047' },
}

const paginationStyles = {
  wrap: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid #eceee7', flexWrap: 'wrap', gap: '10px' },
  wrapMobile: { flexDirection: 'column', alignItems: 'stretch' },
  info: { fontSize: '12.5px', color: '#8a968d', whiteSpace: 'nowrap' },
  controls: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  controlsMobile: { justifyContent: 'space-between' },
  pageSizeSelect: { padding: '6px 10px', borderRadius: '8px', border: '1px solid #dcdfd6', fontSize: '12.5px', color: '#4b5a50', marginRight: '6px' },
  navBtn: { minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '8px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#4b5a50', fontSize: '13px', cursor: 'pointer' },
  navBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  pageBtn: { minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '8px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#4b5a50', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' },
  pageBtnActive: { backgroundColor: '#2c8047', borderColor: '#2c8047', color: '#fff' },
  ellipsis: { padding: '0 4px', color: '#9aa79d', fontSize: '13px' },
}