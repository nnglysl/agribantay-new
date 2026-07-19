import { useRef, useState } from 'react'
import AdminLayout from '../../components/AdminLayout'
import ReportLetterhead from '../../components/ReportLetterhead'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'
import { exportPrintRefToPDF, todayStamp } from '../../utils/exportUtils'

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

  const generatedAt = new Date().toLocaleString('en-PH', {
    dateStyle: 'long',
    timeStyle: 'short',
  })

  const loading = adminLoading || vetLoading

  if (loading) return <AdminLayout><p>Loading...</p></AdminLayout>
  if (adminError) return <AdminLayout><p style={{ color: '#dc2626' }}>{adminError}</p></AdminLayout>
  if (vetError) return <AdminLayout><p style={{ color: '#dc2626' }}>{vetError}</p></AdminLayout>
  if (!adminData || !vetData) return <AdminLayout><p>Loading...</p></AdminLayout>

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
        <div style={{ ...styles.header, ...(isMobile ? styles.headerMobile : {}) }}>
          <div>
            <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Reports</h1>
          </div>
          <div style={{ ...styles.controlsRow, ...(isMobile ? styles.controlsRowMobile : {}) }}>
            <button style={{ ...styles.printBtn, ...(isMobile ? styles.controlFull : {}) }} onClick={handlePrint}>Print</button>
            <button
              style={{ ...styles.exportBtn, ...(isMobile ? styles.controlFull : {}) }}
              onClick={handleExportPdf}
              disabled={exportingPdf}
            >
              {exportingPdf ? 'Generating...' : 'Export PDF'}
            </button>
          </div>
        </div>

        {/* ----------------------------------------------------- Admin section */}
        <div style={styles.sectionLabel}>Admin — Inspections, Alerts & Service Requests</div>
        <div style={{ ...styles.statsGrid, ...(isMobile ? styles.statsGridMobile : {}) }}>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{adminData.inspection_summary.total}</div>
            <div style={styles.statLabel}>Total inspections</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#2E7D32' }}>{adminData.inspection_summary.completed}</div>
            <div style={styles.statLabel}>Completed</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#3b82f6' }}>{adminData.inspection_summary.scheduled}</div>
            <div style={styles.statLabel}>Scheduled</div>
          </div>
          <div style={{ ...styles.statCard, backgroundColor: '#fef2f2' }}>
            <div style={{ ...styles.statValue, color: '#dc2626' }}>{adminData.alert_summary.critical_alerts}</div>
            <div style={{ ...styles.statLabel, color: '#991b1b' }}>Critical alerts</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{adminData.service_summary.total}</div>
            <div style={styles.statLabel}>Service requests (odor/fly control)</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#2E7D32' }}>{adminData.service_summary.completed}</div>
            <div style={styles.statLabel}>Completed</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#B45309' }}>{adminData.service_summary.pending}</div>
            <div style={styles.statLabel}>Pending</div>
          </div>
        </div>

        <div style={{ ...styles.panel, ...(isMobile ? styles.panelMobile : {}), marginTop: '16px' }}>
          <h3 style={styles.panelTitle}>Completed inspections</h3>
          {completedInspections.length === 0 ? (
            <div style={styles.empty}>No completed inspections yet.</div>
          ) : (
            <div style={isMobile ? styles.tableScroll : undefined}>
              <table style={{ ...styles.table, ...(isMobile ? styles.tableMobile : {}) }}>
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
                      <td style={styles.td}><span style={styles.badge}>{i.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ ...styles.panel, ...(isMobile ? styles.panelMobile : {}), marginTop: '16px' }}>
          <h3 style={styles.panelTitle}>Completed service requests (odor & fly control)</h3>
          {completedAdminServices.length === 0 ? (
            <div style={styles.empty}>No completed odor/fly control requests yet.</div>
          ) : (
            <div style={isMobile ? styles.tableScroll : undefined}>
              <table style={{ ...styles.table, ...(isMobile ? styles.tableMobile : {}) }}>
                <thead>
                  <tr>
                    <th style={styles.th}>ID</th>
                    <th style={styles.th}>Type</th>
                    <th style={styles.th}>Farm</th>
                    <th style={styles.th}>Owner</th>
                    <th style={styles.th}>Barangay</th>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {completedAdminServices.map(s => (
                    <tr key={s.id}>
                      <td style={styles.td}>{s.id}</td>
                      <td style={styles.td}>{s.service_type}</td>
                      <td style={styles.td}>{s.farm_name}</td>
                      <td style={styles.td}>{s.owner_name}</td>
                      <td style={styles.td}>{s.barangay}</td>
                      <td style={styles.td}>{s.completed_at}</td>
                      <td style={styles.td}><span style={styles.badge}>{s.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ---------------------------------------------------- Vet section */}
        <div style={{ ...styles.sectionLabel, marginTop: '32px' }}>Veterinarian — Vaccinations & Blood Tests</div>
        <div style={{ ...styles.statsGrid, ...(isMobile ? styles.statsGridMobile : {}) }}>
          <div style={{ ...styles.statCard, backgroundColor: '#FDFBF6', border: '1px solid #E8E2D3' }}>
            <div style={{ ...styles.statValue, color: '#B5651D' }}>{vetData.total_completed}</div>
            <div style={styles.statLabel}>Total completed (vaccine + blood test)</div>
          </div>
          <div style={{ ...styles.statCard, backgroundColor: '#FDFBF6', border: '1px solid #E8E2D3' }}>
            <div style={{ ...styles.statValue, color: '#B5651D' }}>{vetData.farms_covered}</div>
            <div style={styles.statLabel}>Farms covered</div>
          </div>
        </div>

        <div style={{ ...styles.panel, ...(isMobile ? styles.panelMobile : {}), marginTop: '16px' }}>
          <h3 style={styles.panelTitle}>Completed vaccinations & blood tests</h3>
          {completedVetServices.length === 0 ? (
            <div style={styles.empty}>No completed vet services yet.</div>
          ) : (
            <div style={isMobile ? styles.tableScroll : undefined}>
              <table style={{ ...styles.table, ...(isMobile ? styles.tableMobile : {}) }}>
                <thead>
                  <tr>
                    <th style={styles.th}>ID</th>
                    <th style={styles.th}>Type</th>
                    <th style={styles.th}>Farm</th>
                    <th style={styles.th}>Owner</th>
                    <th style={styles.th}>Barangay</th>
                    <th style={styles.th}>Veterinarian</th>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {completedVetServices.map(v => (
                    <tr key={v.id}>
                      <td style={styles.td}>{v.id}</td>
                      <td style={styles.td}>{v.service_type}</td>
                      <td style={styles.td}>{v.farm_name}</td>
                      <td style={styles.td}>{v.owner_name}</td>
                      <td style={styles.td}>{v.barangay}</td>
                      <td style={styles.td}>{v.vet_name || '—'}</td>
                      <td style={styles.td}>{v.completed_at}</td>
                      <td style={styles.td}><span style={{ ...styles.badge, backgroundColor: '#B5651D' }}>{v.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="print-view" ref={printRef}>
        <ReportLetterhead />

        <h1 style={{ fontSize: '18px', textAlign: 'center', margin: '16px 0 4px' }}>AgriBantay Municipal Report</h1>
        <p style={{ fontSize: '12px', textAlign: 'center', margin: '0 0 4px' }}>Combined Admin & Veterinary summary</p>
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

        <div className="print-section-title">Service requests summary — odor & fly control (all-time)</div>
        <table className="print-table">
          <tbody>
            <tr><th>Total requests</th><td>{adminData.service_summary.total}</td></tr>
            <tr><th>Completed</th><td>{adminData.service_summary.completed}</td></tr>
            <tr><th>Pending</th><td>{adminData.service_summary.pending}</td></tr>
          </tbody>
        </table>

        <div className="print-section-title">Vaccination & blood test summary — all veterinarians (all-time)</div>
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

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' },
  headerMobile: { flexDirection: 'column', gap: '14px' },
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  titleMobile: { fontSize: '18px' },
  subtitle: { fontSize: '13px', color: '#6b7280', marginTop: '4px' },
  controlsRow: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  controlsRowMobile: { flexDirection: 'column', width: '100%' },
  controlFull: { width: '100%', boxSizing: 'border-box' },
  printBtn: {
    background: 'linear-gradient(135deg, #E8C766 0%, #D4AF37 55%, #B8912B 100%)', color: '#122A1E', border: 'none',
    borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(212,175,55,0.28)',
  },
  exportBtn: {
    background: 'linear-gradient(135deg, #234A35 0%, #122A1E 100%)', color: 'white', border: 'none',
    borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(18,42,30,0.28)',
  },
  sectionLabel: {
    fontSize: '11px', fontWeight: '700', color: '#8A7A3E', textTransform: 'uppercase',
    letterSpacing: '0.6px', marginBottom: '12px',
  },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' },
  statsGridMobile: { gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' },
  statCard: {
    backgroundColor: 'white', borderRadius: '12px', padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  statValue: { fontSize: '24px', fontWeight: '700', color: '#111827' },
  statLabel: { fontSize: '12px', color: '#6b7280', marginTop: '2px' },
  panel: {
    backgroundColor: 'white', borderRadius: '12px', padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  panelMobile: { padding: '16px' },
  panelTitle: { fontSize: '15px', fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: '14px' },
  empty: { color: '#9ca3af', fontSize: '14px', padding: '16px 0' },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableMobile: { minWidth: '600px' },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: '11px', color: '#6b7280', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase', whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #f3f4f6' },
  badge: {
    backgroundColor: '#2E7D32', color: 'white', padding: '3px 10px',
    borderRadius: '999px', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap',
  },
}