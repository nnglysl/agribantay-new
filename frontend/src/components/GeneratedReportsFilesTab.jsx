import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import api from '../api/axios'
import GeneratedReportView from './GeneratedReportView'
import { useCachedFetch, invalidateCache } from '../hooks/useCachedFetch'
import { exportToCSV, exportPrintRefToPDF } from '../utils/exportUtils'
import { styles, DataTable } from './ReportsLayout'
import GenerateReportPanel from './GenerateReportPanel'

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
export default function GeneratedReportsFilesTab({ appliedMonth, appliedYear, basePath = '/admin/generated-reports', ReportView = GeneratedReportView, canGenerate = true }) {
  const { data: filesData } = useCachedFetch(basePath)
  const [filesReportId, setFilesReportId] = useState(null)
  const [filesReport, setFilesReport] = useState(null)
  const [filesReportLoading, setFilesReportLoading] = useState(false)
  const [pendingReport, setPendingReport] = useState(null)
  const [pendingAction, setPendingAction] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deleteNotice, setDeleteNotice] = useState('')
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

      // The summary figures, straight out of the stored snapshot — the same
      // numbers the printed report shows, never recomputed from today's
      // database. A September export opened in December must still say what
      // September said.
      //
      // Each block is skipped when the snapshot does not carry it, so an
      // archive made before these keys existed exports exactly as it used to.
      const kv = (group, pairs) => Object.entries(pairs)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([label, v]) => ({ section: 'Summary', name: group, detail: label, date: '', status: '', value: v }))

      const a = s.new_accounts
      const alertP = s.alert_period
      const inspP = s.inspection_period
      const svcP = s.service_request_period
      const compP = s.compliance_period

      const summaryRows = [
        ...(a ? kv('System activity', {
          'New Farm Owner accounts': a.farm_owners,
          'New Staff accounts': a.staff,
          'New Veterinarian accounts': a.vets,
          // No Super Admin row, matching the printed report: the system has
          // one and cannot create another, so the line could only read zero.
          // Still counted in the snapshot and still inside the total below.
          'Total new accounts': a.total,
        }) : []),
        ...(s.new_farms ? kv('System activity', { 'New farms registered': s.new_farms.count }) : []),
        ...(s.new_devices ? kv('System activity', { 'New devices registered': s.new_devices.count }) : []),
        ...(alertP ? kv('Alerts', {
          'Total alert incidents': alertP.total,
          'Critical': alertP.critical,
          'Warning': alertP.warning,
          'Resolved by period end': alertP.resolved,
          'Ongoing at period end': alertP.ongoing,
        }) : []),
        ...(inspP ? kv('Inspections', {
          'Total inspections': inspP.total,
          'Scheduled': inspP.scheduled,
          'Completed': inspP.completed,
          'Cancelled': inspP.cancelled,
          'Overdue (of the scheduled)': inspP.overdue,
        }) : []),
        ...(svcP ? kv('Service requests', {
          'Total requests': svcP.total,
          'Pending': svcP.pending,
          'Scheduled': svcP.scheduled,
          'Completed': svcP.completed,
          'Cancelled': svcP.cancelled,
        }) : []),
        ...(compP ? kv('Compliance', {
          'Compliant farms': compP.compliant,
          'Overdue farms': compP.overdue,
          'Non-compliant farms': compP.non_compliant,
          'Active farms assessed': compP.total_farms,
        }) : []),
      ]

      const rows = [
        ...summaryRows,
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
        // Carries the summary numbers, and is added ONLY when there are
        // summary rows to put in it. A report archived before the period
        // sections existed has none, and exporting it must produce the
        // same file it always did — not the same file plus an empty
        // column. A frozen report is frozen in its export too.
        ...(summaryRows.length ? [{ key: 'value', label: 'Value' }] : []),
      ]
      exportToCSV(rows, cols, `AgriBantay_${report.report_name.replace(/\s+/g, '_')}.csv`)
    } catch (err) {
      console.error('CSV export failed:', err)
      alert('Could not export CSV. Please try again.')
    }
  }

  /**
   * Generation never overwrites an existing period, so deleting is how a report
   * is redone after a correction. What goes is a derived document — the farms,
   * inspections, alerts and requests it summarised are untouched and the period
   * can be generated again.
   */
  const confirmDelete = async () => {
    if (!deleteTarget) return

    setDeleting(true)
    setDeleteError('')

    try {
      await api.delete(`${basePath}/${deleteTarget.id}`)

      // Only after the server confirms. Invalidating refetches the list, so the
      // row disappears without a page reload.
      invalidateCache(basePath)
      setDeleteNotice(`"${deleteTarget.report_name}" has been deleted. The period can be generated again.`)
      setDeleteTarget(null)
    } catch (err) {
      setDeleteError(err.response?.data?.message || 'Could not delete this report. Please try again.')
    } finally {
      setDeleting(false)
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
              <button style={styles.backBtn} onClick={backToFiles}>← Back</button>
            </div>
            <div className="gr-doc">
              <ReportView report={filesReport} />
            </div>
          </>
        )
      ) : (
        <>
          {/* The Vet archive is read-only — there is no Vet create route. */}
          {canGenerate && <GenerateReportPanel basePath={basePath} />}

        {deleteNotice && (
          <div style={delStyles.notice}>
            {deleteNotice}
            <span style={delStyles.noticeClose} onClick={() => setDeleteNotice('')}>×</span>
          </div>
        )}

        <DataTable
          title="Generated Reports"
          subtitle="Generated on demand. Newest first."
          columns={['Report Name', 'Reporting Period', 'Report Type', 'Date Generated', 'Actions']}
          emptyText={
            allFiles.length > 0 && filteredFiles.length === 0
              ? 'No reports match the current filter. Clear it to see the rest.'
              : 'No reports have been generated yet.'
          }
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
              // Last in the row, and only where generating is allowed: the
              // Vet archive is read-only here for the same reason it has no
              // Generate panel.
              ...(canGenerate ? [{ label: 'Delete', onClick: () => { setDeleteError(''); setDeleteTarget(f) }, danger: true }] : []),
            ] },
          ])}
        />
        </>
      )}

      {deleteTarget && (
        <div style={delStyles.overlay} onClick={deleting ? undefined : () => setDeleteTarget(null)}>
          <div style={delStyles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={delStyles.title}>Delete this report?</h3>
            {/* Says plainly what is and is not destroyed. Deleting a farm takes
                an emailed code because it removes records that cannot be
                rebuilt; this removes a document that can be generated again
                from records it does not touch, so a plain confirmation is the
                honest weight for it. */}
            <p style={delStyles.message}>
              This will only delete the report. The data used to generate it will not
              be affected, and you can generate the report again later.
            </p>
            <p style={delStyles.target}>
              {deleteTarget.report_name} — {deleteTarget.period_label}
            </p>
            {deleteError && <div style={delStyles.error}>{deleteError}</div>}
            <div style={delStyles.actions}>
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting} style={delStyles.cancelBtn}>
                Cancel
              </button>
              <button type="button" onClick={confirmDelete} disabled={deleting} style={delStyles.deleteBtn}>
                {deleting ? 'Deleting…' : 'Delete report'}
              </button>
            </div>
          </div>
        </div>
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

/* Plain and quiet: a confirmation, not an alarm. Red is reserved for the one
   button that destroys something, so the dialog itself stays neutral. */
const delStyles = {
  notice: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', backgroundColor: '#f0f7f2', border: '1px solid #cfe5d6', color: '#2c8047', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', fontWeight: 600, marginBottom: '14px' },
  noticeClose: { cursor: 'pointer', fontSize: '18px', lineHeight: 1, color: '#2c8047' },
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 32, 21, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 1000 },
  modal: { backgroundColor: '#fff', borderRadius: '14px', padding: '22px', width: '100%', maxWidth: '440px', boxShadow: '0 18px 44px rgba(0,0,0,.18)' },
  title: { margin: '0 0 10px', fontSize: '17px', fontWeight: 700, color: '#16311d' },
  message: { margin: '0 0 12px', fontSize: '13.5px', lineHeight: 1.55, color: '#4a5a50' },
  target: { margin: '0 0 16px', fontSize: '13.5px', fontWeight: 600, color: '#16311d' },
  error: { backgroundColor: '#fdf2f2', border: '1px solid #f3c6c6', color: '#b91c1c', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', marginBottom: '12px' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' },
  cancelBtn: { padding: '9px 16px', borderRadius: '8px', border: '1px solid #d5ded8', backgroundColor: '#fff', color: '#4a5a50', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' },
  deleteBtn: { padding: '9px 16px', borderRadius: '8px', border: '1px solid #b91c1c', backgroundColor: '#b91c1c', color: '#fff', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' },
}