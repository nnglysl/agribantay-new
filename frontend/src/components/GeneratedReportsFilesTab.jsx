import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import api from '../api/axios'
import GeneratedReportView from './GeneratedReportView'
import { useCachedFetch, invalidateCache } from '../hooks/useCachedFetch'
import { exportToCSV, exportPrintRefToPDF } from '../utils/exportUtils'
import { styles, DataTable } from './ReportsLayout'
import GenerateReportPanel from './GenerateReportPanel'
import { generatedReportCsv, reportExportFilename } from '../utils/generatedReportCsv'
import { filterReportFiles } from '../utils/reportPeriod'

/**
 * The Files tab body — archive list, per-row View/Print/Export CSV/Export PDF,
 * and the click-through preview. Shared by Admin and Super Admin Reports so
 * both stay identical; the reporting-period filter lives in the parent page
 * (both already render one Filter button in the tab row) and is passed down.
 *
 * Print/PDF both render the report into one hidden node portaled straight
 * onto <body> — NOT nested inside the page's own ".screen-view" — because
 * that class is force-hidden (`display: none`) by the page-level print
 * stylesheet Vet's own Reports page still relies on. Nesting the print
 * target inside .screen-view previously produced a blank printed page.
 */
export default function GeneratedReportsFilesTab({ appliedMonth, appliedYear, fromDate = '', toDate = '', basePath = '/admin/generated-reports', ReportView = GeneratedReportView, canGenerate = true }) {
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
    if (fromDate || toDate) return filterReportFiles(allFiles, fromDate, toDate)
    if (!appliedMonth || !appliedYear) return allFiles
    return allFiles.filter(f => {
      const d = new Date(`${f.period_start}T00:00:00`)
      return d.getMonth() + 1 === appliedMonth && d.getFullYear() === appliedYear
    })
  }, [allFiles, appliedMonth, appliedYear, fromDate, toDate])

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
      const { rows, columns: cols } = generatedReportCsv(report)
      exportToCSV(rows, cols, reportExportFilename(report, 'csv'))
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
          await exportPrintRefToPDF(hiddenRef, reportExportFilename(pendingReport, 'pdf'))
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
          {/* Generation availability follows the caller's existing permission. */}
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
            { text: `${f.report_name} (Ref. ${f.id})`, strong: true },
            { text: f.period_label },
            { text: f.report_type },
            { text: f.date_generated },
            { actions: [
              { label: 'View', onClick: () => viewReport(f.id) },
              { label: 'Print', onClick: () => runAction(f.id, 'print') },
              { label: 'Export CSV', onClick: () => exportReportCsv(f.id) },
              { label: 'Export PDF', onClick: () => runAction(f.id, 'pdf') },
              // Keep the existing generation/deletion controls paired.
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
