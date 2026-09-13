import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import api from '../api/axios'
import GeneratedReportView from './GeneratedReportView'
import { useCachedFetch } from '../hooks/useCachedFetch'
import { exportToCSV, exportPrintRefToPDF } from '../utils/exportUtils'
import { styles, DataTable } from './ReportsLayout'

/**
 * The Files tab body — archive list, per-row View/Print/Export CSV/Export PDF,
 * and the click-through preview. Shared by Admin and Super Admin Reports so
 * both stay identical; the Month/Year filter itself lives in the parent page
 * (both already render one Filter button in the tab row) and is passed down.
 *
 * Print/PDF both render the report into one hidden node portaled straight
 * onto <body> — NOT nested inside the page's own ".screen-view" — because
 * that class is force-hidden (`display: none`) by the page-level print
 * stylesheet Vet's own Reports page still relies on. Nesting the print
 * target inside .screen-view previously produced a blank printed page.
 */
export default function GeneratedReportsFilesTab({ appliedMonth, appliedYear, basePath = '/admin/generated-reports', ReportView = GeneratedReportView }) {
  const { data: filesData } = useCachedFetch(basePath)
  const [filesReportId, setFilesReportId] = useState(null)
  const [filesReport, setFilesReport] = useState(null)
  const [filesReportLoading, setFilesReportLoading] = useState(false)
  const [pendingReport, setPendingReport] = useState(null)
  const [pendingAction, setPendingAction] = useState(null)
  const hiddenRef = useRef(null)

  const allFiles = filesData ?? []
  const filteredFiles = useMemo(() => {
    if (!appliedMonth || !appliedYear) return allFiles
    return allFiles.filter(f => {
      const d = new Date(`${f.period_start}T00:00:00`)
      return d.getMonth() + 1 === appliedMonth && d.getFullYear() === appliedYear
    })
  }, [allFiles, appliedMonth, appliedYear])

  const viewReport = async (id) => {
    setFilesReportId(id)
    setFilesReport(null)
    setFilesReportLoading(true)
    try {
      const res = await api.get(`${basePath}/${id}`)
      setFilesReport(res.data.data)
    } finally {
      setFilesReportLoading(false)
    }
  }

  const backToFiles = () => {
    setFilesReportId(null)
    setFilesReport(null)
  }

  const runAction = async (id, action) => {
    try {
      const res = await api.get(`${basePath}/${id}`)
      setPendingAction(action)
      setPendingReport(res.data.data)
    } catch (err) {
      console.error(`Could not load report to ${action}:`, err)
      alert('Could not open this report. Please try again.')
    }
  }

  const exportReportCsv = async (id) => {
    try {
      const res = await api.get(`${basePath}/${id}`)
      const report = res.data.data
      const s = report.snapshot ?? {}
      const rows = [
        ...(s.completed_inspections ?? []).map(i => ({ section: 'Inspection', name: i.farm_name, detail: i.inspection_type, date: i.completed_at, status: i.status || 'Completed' })),
        ...(s.alert_records ?? []).map(a => ({ section: 'Alert', name: a.farm_name, detail: a.sensor_type, date: a.triggered_at, status: a.status })),
        ...(s.maintenance_overdue ?? []).map(f => ({ section: 'Overdue/Non-Compliant', name: f.farm_name, detail: `${f.days_overdue} days overdue`, date: f.last_performed_at, status: f.status })),
        ...(s.maintenance_completed ?? []).map(m => ({ section: 'Clean-out', name: m.farm_name, detail: m.method, date: m.performed_at, status: 'Completed' })),
        ...(s.completed_services ?? []).map(r => ({ section: 'Service Request', name: r.farm_name, detail: r.service_type, date: r.completed_at, status: 'Completed' })),
        ...(s.vet_services ?? []).map(v => ({ section: 'Vet Service', name: v.farm_name, detail: `${v.service_type} (${v.vet_name})`, date: v.completed_at, status: 'Completed' })),
      ]
      const cols = [
        { key: 'section', label: 'Section' }, { key: 'name', label: 'Farm' }, { key: 'detail', label: 'Detail' },
        { key: 'date', label: 'Date' }, { key: 'status', label: 'Status' },
      ]
      exportToCSV(rows, cols, `AgriBantay_${report.report_name.replace(/\s+/g, '_')}.csv`)
    } catch (err) {
      console.error('CSV export failed:', err)
      alert('Could not export CSV. Please try again.')
    }
  }

  useEffect(() => {
    if (!pendingReport) return
    const t = setTimeout(async () => {
      if (pendingAction === 'pdf') {
        try {
          await exportPrintRefToPDF(hiddenRef, `AgriBantay_${pendingReport.report_name.replace(/\s+/g, '_')}.pdf`)
        } catch (err) {
          console.error('PDF export failed:', err)
          alert('Could not generate PDF. Please try again.')
        } finally {
          setPendingReport(null)
          setPendingAction(null)
        }
      } else if (pendingAction === 'print') {
        document.body.classList.add('gr-printing')
        const cleanup = () => {
          document.body.classList.remove('gr-printing')
          window.removeEventListener('afterprint', cleanup)
          setPendingReport(null)
          setPendingAction(null)
        }
        window.addEventListener('afterprint', cleanup)
        window.print()
      }
    }, 50)
    return () => clearTimeout(t)
  }, [pendingReport, pendingAction])

  return (
    <>
      {filesReportId ? (
        (filesReportLoading || !filesReport) ? (
          <p style={styles.stateText}>Loading report...</p>
        ) : (
          <>
            <div style={styles.previewBar}>
              <button style={styles.secondaryBtn} onClick={backToFiles}>← Back to Files</button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button style={styles.secondaryBtn} onClick={() => runAction(filesReportId, 'print')}>Print</button>
                <button style={styles.primaryBtn} onClick={() => runAction(filesReportId, 'pdf')}>Export PDF</button>
              </div>
            </div>
            <div className="gr-doc">
              <ReportView report={filesReport} />
            </div>
          </>
        )
      ) : (
        <DataTable
          title="Generated Reports"
          subtitle="Automatically archived on the 1st of each month"
          columns={['Report Name', 'Reporting Period', 'Report Type', 'Date Generated', 'Actions']}
          emptyText="No reports have been generated yet."
          rows={filteredFiles.map(f => [
            { text: f.report_name, strong: true },
            { text: f.period_label },
            { text: f.report_type },
            { text: f.date_generated },
            { actions: [
              { label: 'View', onClick: () => viewReport(f.id) },
              { label: 'Print', onClick: () => runAction(f.id, 'print') },
              { label: 'Export CSV', onClick: () => exportReportCsv(f.id) },
              { label: 'Export PDF', onClick: () => runAction(f.id, 'pdf') },
            ] },
          ])}
        />
      )}

      {pendingReport && createPortal(
        <div className="gr-hidden-capture gr-print-area" ref={hiddenRef}>
          <ReportView report={pendingReport} />
        </div>,
        document.body
      )}
    </>
  )
}
