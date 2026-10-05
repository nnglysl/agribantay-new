import { orCount, orDash } from '../utils/reportValue'

/**
 * The period-scoped head of a generated report: what actually happened during
 * the window the report names.
 *
 * WHY IT EXISTS
 * The summaries this sits above count the whole database with no date filter —
 * total inspections ever, every sensor reading ever, every service request ever.
 * On a September report those printed beside period-filtered detail tables and
 * the two contradicted each other on the same page. The sections here are
 * filtered to the report's own window, so the headline figures and the rows
 * beneath them are statements about the same thing.
 *
 * WHY IT IS SHARED
 * Super Admin and Staff print the same period figures; only the Vet view is
 * scoped differently, and it does not use this (Vet\GeneratedReportController
 * whitelists which snapshot keys a veterinarian receives, and none of these are
 * on it). One component rather than two copies, so the two can never drift.
 *
 * WHY EVERY SECTION IS OPTIONAL
 * A generated report is a frozen snapshot and is never recalculated. Archives
 * made before these keys existed simply do not carry them, and must keep
 * printing exactly what they froze — so each block renders only when its key is
 * present, and the caller falls back to the older all-time summaries when the
 * whole set is absent.
 */
export default function ReportPeriodSections({ snapshot, periodLabel, statusAsOf }) {
  const s = snapshot ?? {}

  const accounts = s.new_accounts
  const farms = s.new_farms
  const devices = s.new_devices
  const alerts = s.alert_period
  const inspections = s.inspection_period
  const inspectionsByFarm = s.inspection_farm_summary ?? []
  const requests = s.service_request_period
  const compliance = s.compliance_period

  // Nothing period-scoped in this snapshot: it predates the section entirely.
  if (!accounts && !farms && !devices && !alerts && !inspections && !requests && !compliance) {
    return null
  }

  return (
    <>
      {/* ------------------------------------------------ 1. SYSTEM ACTIVITY */}
      {(accounts || farms || devices) && (
        <>
          <div className="print-section-title">
            System activity — {periodLabel}
          </div>
          <table className="print-table print-kv">
            <tbody>
              {accounts && (
                <>
                  <tr><th>New Farm Owner accounts</th><td>{orCount(accounts.farm_owners)}</td></tr>
                  <tr><th>New Staff accounts</th><td>{orCount(accounts.staff)}</td></tr>
                  <tr><th>New Veterinarian accounts</th><td>{orCount(accounts.vets)}</td></tr>
                  {/* No Super Admin row. There is one Super Admin account and
                      the system has no way to add another — account creation
                      accepts role 'admin' or 'vet' and nothing else
                      (SuperAdmin\AccountController), and nothing else in the
                      codebase creates that role. A row that can only ever read
                      zero is not a fact worth a line on every report.

                      The figure is still counted and still stored in the
                      snapshot, and Total new accounts still includes it, so
                      nothing is lost or misstated — it simply is not printed. */}
                  <tr><th>Total new accounts</th><td>{orCount(accounts.total)}</td></tr>
                </>
              )}
              {farms && <tr><th>New farms registered</th><td>{orCount(farms.count)}</td></tr>}
              {devices && <tr><th>New devices registered</th><td>{orCount(devices.count)}</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {farms && farms.count > 0 && (
        <>
          <div className="print-section-title">Farms registered — {periodLabel}</div>
          <table className="print-table">
            <colgroup>
              <col style={{ width: '28%' }} /><col style={{ width: '24%' }} />
              <col style={{ width: '19%' }} /><col style={{ width: '13%' }} />
              <col style={{ width: '16%' }} />
            </colgroup>
            {/* Size earns its column: it is what sets the clean-out interval
                (Small 365 days, Medium 270, Large 180), so it decides when each
                farm listed here first falls due in the Compliance section. */}
            <thead><tr><th>Farm</th><th>Owner</th><th>Barangay</th><th>Size</th><th>Date registered</th></tr></thead>
            <tbody>
              {farms.list.map((f, i) => (
                <tr key={i}>
                  <td>{orDash(f.farm_name)}</td><td>{orDash(f.owner_name)}</td>
                  <td>{orDash(f.barangay)}</td><td>{orDash(f.farm_size)}</td>
                  <td>{orDash(f.registered_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {devices && devices.count > 0 && (
        <>
          <div className="print-section-title">Devices registered — {periodLabel}</div>
          <table className="print-table">
            <colgroup>
              <col style={{ width: '34%' }} /><col style={{ width: '22%' }} />
              <col style={{ width: '26%' }} /><col style={{ width: '18%' }} />
            </colgroup>
            <thead><tr><th>Device</th><th>Code</th><th>Farm</th><th>Date registered</th></tr></thead>
            <tbody>
              {devices.list.map((d, i) => (
                <tr key={i}>
                  <td>{orDash(d.device)}</td><td>{orDash(d.sensor_code)}</td>
                  <td>{orDash(d.farm_name)}</td><td>{orDash(d.registered_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* --------------------------------------------- 2. MONITORING SUMMARY */}
      {alerts && (
        <>
          <div className="print-section-title">
            Alert summary — {periodLabel}
          </div>
          <table className="print-table print-kv">
            <tbody>
              <tr><th>Total alert incidents</th><td>{orCount(alerts.total)}</td></tr>
              <tr><th>Critical</th><td>{orCount(alerts.critical)}</td></tr>
              <tr><th>Warning</th><td>{orCount(alerts.warning)}</td></tr>
              {/* Resolution is stated as of the END OF THE PERIOD, not as of
                  today. That is what makes it safe to freeze: an incident still
                  open on the last day of September is a permanent fact about
                  September, where "still open now" would silently go stale. */}
              <tr>
                <th>Resolved <span className="print-scope">(by {statusAsOf || 'period end'})</span></th>
                <td>{orCount(alerts.resolved)}</td>
              </tr>
              <tr>
                <th>Still ongoing <span className="print-scope">(at {statusAsOf || 'period end'})</span></th>
                <td>{orCount(alerts.ongoing)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {/* --------------------------------------------- 4. INSPECTION SUMMARY */}
      {inspections && (
        <>
          <div className="print-section-title">
            Inspection summary — {periodLabel}
          </div>
          <table className="print-table print-kv">
            <tbody>
              <tr><th>Total inspections</th><td>{orCount(inspections.total)}</td></tr>
              <tr><th>Scheduled</th><td>{orCount(inspections.scheduled)}</td></tr>
              <tr><th>Completed</th><td>{orCount(inspections.completed)}</td></tr>
              <tr><th>Cancelled</th><td>{orCount(inspections.cancelled)}</td></tr>
              {/* Not a fourth status — inspections are only ever Scheduled,
                  Completed or Cancelled. This counts the Scheduled ones whose
                  date had already passed, so it overlaps that row by design and
                  is labelled rather than added to the total. */}
              <tr>
                <th>Overdue <span className="print-scope">(of the scheduled)</span></th>
                <td>{orCount(inspections.overdue)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {inspectionsByFarm.length > 0 && (
        <>
          <div className="print-section-title">Inspections by farm — {periodLabel}</div>
          <table className="print-table">
            <colgroup>
              <col style={{ width: '36%' }} /><col style={{ width: '13%' }} /><col style={{ width: '13%' }} />
              <col style={{ width: '13%' }} /><col style={{ width: '13%' }} /><col style={{ width: '12%' }} />
            </colgroup>
            <thead>
              {/* Overdue sits UNDER Scheduled, not beside it: it counts the
                  scheduled visits whose date had already passed. Without the
                  qualifier a row reading 1 scheduled, 1 overdue, 1 total looks
                  like an arithmetic error instead of one late visit. */}
              <tr><th>Farm</th><th>Scheduled</th><th>Completed</th><th>Cancelled</th><th>Overdue<br /><span className="print-scope">(of scheduled)</span></th><th>Total</th></tr>
            </thead>
            <tbody>
              {inspectionsByFarm.map((f, i) => (
                <tr key={i}>
                  <td>{orDash(f.farm_name)}</td><td>{orCount(f.scheduled)}</td><td>{orCount(f.completed)}</td>
                  <td>{orCount(f.cancelled)}</td><td>{orCount(f.overdue)}</td><td>{orCount(f.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ----------------------------------------- 5. SERVICE REQUEST SUMMARY */}
      {requests && (
        <>
          <div className="print-section-title">
            Service request summary — {periodLabel}
          </div>
          <table className="print-table print-kv">
            <tbody>
              {/* The four statuses the workflow actually stores, in its own
                  words. Every service type is counted here, veterinary
                  included; the odor/fly and veterinary breakdowns stay in their
                  own sections below. */}
              <tr><th>Total requests</th><td>{orCount(requests.total)}</td></tr>
              <tr><th>Pending</th><td>{orCount(requests.pending)}</td></tr>
              <tr><th>Scheduled</th><td>{orCount(requests.scheduled)}</td></tr>
              <tr><th>Completed</th><td>{orCount(requests.completed)}</td></tr>
              <tr><th>Cancelled</th><td>{orCount(requests.cancelled)}</td></tr>
            </tbody>
          </table>
        </>
      )}

      {/* ---------------------------------------------- 6. COMPLIANCE SUMMARY */}
      {compliance && (
        <>
          <div className="print-section-title">
            Compliance summary{' '}
            <span className="print-scope">
              (status as of {statusAsOf || 'period end'})
            </span>
          </div>
          <table className="print-table print-kv">
            <tbody>
              {/* A position, not activity: where each farm stood on the clean-out
                  schedule when the period closed. Farms registered after the
                  cutoff are excluded — they did not exist in the period being
                  reported. The three buckets partition the total. */}
              <tr><th>Compliant farms</th><td>{orCount(compliance.compliant)}</td></tr>
              <tr><th>Overdue farms</th><td>{orCount(compliance.overdue)}</td></tr>
              <tr><th>Non-compliant farms</th><td>{orCount(compliance.non_compliant)}</td></tr>
              <tr><th>Active farms assessed</th><td>{orCount(compliance.total_farms)}</td></tr>
            </tbody>
          </table>
        </>
      )}
    </>
  )
}
