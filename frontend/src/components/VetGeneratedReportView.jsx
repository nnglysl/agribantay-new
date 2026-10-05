import ReportLetterhead from './ReportLetterhead'
import { styles, Signatures } from './ReportsLayout'
import { orDash, orCount } from '../utils/reportValue'

/**
 * Vet-scoped variant of GeneratedReportView — same formal document look, but
 * only the veterinary sections of the snapshot, since vets must not see the
 * admin-only sections that live in the same combined GeneratedReport record.
 *
 * Two scope facts are stated on the document itself rather than left implicit:
 *
 *  - The summary is all-time; the service table is the reporting period only.
 *  - Both cover every veterinarian, not just the signed-in one. The archived
 *    snapshot is deliberately municipality-wide (see the comment on the vet
 *    block in GeneratedReportService::buildSnapshot), whereas the live Vet
 *    Reports page filters to the vet's own accepted work (Vet\ReportController).
 *    Without that note the same vet reads two different totals and cannot tell
 *    which is wrong.
 */
export default function VetGeneratedReportView({ report }) {
  const s = report.snapshot ?? {}
  const vet = s.vet_summary ?? {}
  const vetServices = s.vet_services ?? []

  // Vet\GeneratedReportController defaults a missing vet_summary to an empty
  // array, so an absent figure and a figure of zero arrive looking alike.
  // Snapshots archived before the vet figures were added to buildSnapshot have
  // no such key at all — printing "0" for those would state something the
  // report cannot support, so they get an explicit notice instead.
  const hasSummary = vet.total_completed !== undefined || vet.farms_covered !== undefined

  // Period-scoped counts were added to the snapshot later, so they are optional.
  // They come from the same collection as the table below, so the figures and
  // the rows cannot disagree.
  const activity = s.period_activity

  return (
    <div>
      <div className="print-headblock">
        <ReportLetterhead />
        <h1 style={styles.printHead}>{report.report_name}</h1>
        <p style={styles.printSub}>Farm biosecurity and blood test history and records</p>
        <p style={styles.printSub}>Reporting period: {report.period_label}</p>
        <p style={styles.printMeta}>Generated {report.date_generated}</p>
      </div>

      {activity && (
        <>
          <div className="print-section-title">
            Activity this period — {report.period_label}
          </div>
          <table className="print-table print-kv">
            <tbody>
              <tr><th>Veterinary services completed</th><td>{orCount(activity.vet_services_completed)}</td></tr>
              <tr><th>Farms covered this period</th><td>{orCount(activity.vet_farms_covered)}</td></tr>
            </tbody>
          </table>
        </>
      )}

      <div className="print-section-title">
        Veterinary summary <span className="print-scope">(all-time, all veterinarians)</span>
      </div>
      {hasSummary ? (
        <table className="print-table print-kv">
          <tbody>
            <tr><th>Total completed</th><td>{orCount(vet.total_completed)}</td></tr>
            <tr><th>Farms covered</th><td>{orCount(vet.farms_covered)}</td></tr>
          </tbody>
        </table>
      ) : (
        <p className="print-empty">
          Veterinary totals were not captured in this report snapshot. Reports archived from the next
          monthly run onwards include them.
        </p>
      )}

      <div className="print-section-title">
        Completed veterinary services — {report.period_label}{' '}
        <span className="print-scope">(all veterinarians)</span>
      </div>
      {vetServices.length === 0 ? (
        <p className="print-empty">No completed vet services in this period.</p>
      ) : (
        <table className="print-table">
          <colgroup>
            <col style={{ width: '14%' }} /><col style={{ width: '15%' }} /><col style={{ width: '13%' }} />
            <col style={{ width: '12%' }} /><col style={{ width: '15%' }} /><col style={{ width: '12%' }} />
            <col style={{ width: '19%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Type</th><th>Farm</th><th>Owner</th><th>Barangay</th>
              <th>Veterinarian</th><th>Completed</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {vetServices.map((v, idx) => (
              <tr key={idx}>
                <td>{orDash(v.service_type)}</td><td>{orDash(v.farm_name)}</td><td>{orDash(v.owner_name)}</td>
                <td>{orDash(v.barangay)}</td><td>{orDash(v.vet_name)}</td><td>{orDash(v.completed_at)}</td>
                <td>{orDash(v.notes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Signatures signatures={s.signatures} fallbackTitle="Municipal Veterinarian" />
    </div>
  )
}
