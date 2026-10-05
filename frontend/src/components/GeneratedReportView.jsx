import ReportLetterhead from './ReportLetterhead'
import ReportPeriodSections from './ReportPeriodSections'
import { styles, Signatures } from './ReportsLayout'
import { orDash, orText, orCount, orDays } from '../utils/reportValue'

/**
 * Renders a frozen generated-report snapshot as the same formal, table-based
 * municipal document used by the live Reports page's Print/Export PDF —
 * no charts, cards, or dashboard chrome. Used identically for on-screen
 * View, Print, and Download so all three always show the same content.
 *
 * This is the Super Admin view: it is the only one that legitimately combines
 * the Admin and Vet sides of the snapshot. Admin and Vet have their own
 * scoped variants (AdminGeneratedReportView, VetGeneratedReportView).
 *
 * Section scope is labelled explicitly on every heading, because the snapshot
 * mixes three different scopes (see GeneratedReportService::buildSnapshot):
 *   - all-time      — unfiltered counts over the whole database
 *   - this period   — filtered to the report's period_start..period_end
 *   - status snapshot — compliance evaluated at the END of the period
 * An LGU document that does not say which is which cannot be audited.
 */
export default function GeneratedReportView({ report }) {
  const s = report.snapshot ?? {}
  const insp = s.inspection_summary ?? {}
  const alertSum = s.alert_summary ?? {}
  const maint = s.maintenance_summary ?? {}
  const svc = s.service_summary ?? {}

  // Admin\GeneratedReportController strips vet_summary / vet_services for
  // anyone who is not a Super Admin, matching what their live Reports page is
  // allowed to show. Snapshots archived before the vet figures were added to
  // buildSnapshot have no such keys either. Both cases mean "not available in
  // this document", which is not the same as "there were none" — so the vet
  // sections are omitted entirely rather than rendered blank or as zeroes.
  const hasVetScope = s.vet_summary !== undefined || s.vet_services !== undefined
  const vet = s.vet_summary ?? {}

  // Period-scoped activity counts and the compliance cutoff were added to the
  // snapshot after these two reports were first archived, so both are optional:
  // an older snapshot simply renders as it always did.
  const activity = s.period_activity
  const statusAsOf = s.status_as_of

  // A snapshot carrying the period-scoped blocks replaces the all-time
  // summaries below with figures for its own window. Archives made before
  // those keys existed have none, and keep printing exactly what they froze.
  const hasPeriodSections = s.inspection_period !== undefined

  const inspections = s.completed_inspections ?? []
  const alerts = s.alert_records ?? []
  // Reports generated before the summary existed have no alert_farm_summary.
  // Their snapshots are frozen and must keep rendering, so those fall back
  // to the per-incident list they were built with.
  const alertSummaryRows = s.alert_farm_summary ?? null
  const hasResolution = Boolean(alertSummaryRows?.[0] && alertSummaryRows[0].resolved !== undefined)
  const overdueFarms = s.maintenance_overdue ?? []
  const cleanouts = s.maintenance_completed ?? []
  const services = s.completed_services ?? []
  const vetServices = s.vet_services ?? []

  return (
    <div>
      <div className="print-headblock">
        <ReportLetterhead />
        <h1 style={styles.printHead}>{report.report_name}</h1>
        <p style={styles.printSub}>Poultry farm monitoring and service summary</p>
        <p style={styles.printSub}>Reporting period: {report.period_label}</p>
        <p style={styles.printMeta}>Generated {report.date_generated}</p>
        {statusAsOf && (
          <p style={styles.printMeta}>Status snapshot as of {statusAsOf}</p>
        )}
      </div>

      {activity && (
        <>
          <div className="print-section-title">
            Activity this period — {report.period_label}
          </div>
          <table className="print-table print-kv">
            <tbody>
              <tr><th>Inspections completed</th><td>{orCount(activity.inspections_completed)}</td></tr>
              <tr><th>Alert incidents recorded</th><td>{orCount(activity.alerts_recorded)}</td></tr>
              <tr><th>Clean-outs completed</th><td>{orCount(activity.cleanouts_completed)}</td></tr>
              <tr><th>Service requests completed</th><td>{orCount(activity.services_completed)}</td></tr>
            </tbody>
          </table>
        </>
      )}

      <ReportPeriodSections
        snapshot={s}
        periodLabel={report.period_label}
        statusAsOf={statusAsOf}
      />

      {!hasPeriodSections && (
        <>
      <div className="print-section-title">
        Inspection summary <span className="print-scope">(all-time)</span>
      </div>
      <table className="print-table print-kv">
        <tbody>
          <tr><th>Total inspections</th><td>{orCount(insp.total)}</td></tr>
          <tr><th>Completed</th><td>{orCount(insp.completed)}</td></tr>
          <tr><th>Scheduled</th><td>{orCount(insp.scheduled)}</td></tr>
          <tr><th>General</th><td>{orCount(insp.general)}</td></tr>
          <tr><th>Follow-up</th><td>{orCount(insp.follow_up)}</td></tr>
        </tbody>
      </table>

      {/*
        Counts of sensor_readings ROWS, not of alert_history rows (see
        GeneratedReportService::buildSnapshot) — the alert table further down
        is the alert_history log. A farm sitting Critical for a day emits a
        reading every few minutes, so these are always far larger than the
        incident counts, and the labels say "readings" for that reason.

        Labelling alone was not enough while this also counted temperature
        and humidity: it put ~13,000 "critical" readings a few lines above an
        alert table listing a handful, and no label reconciles that. Both
        sections now cover the same metrics and differ only in unit.
      */}
      <div className="print-section-title">
        Sensor reading summary <span className="print-scope">(all-time)</span>
      </div>
      <table className="print-table print-kv">
        <tbody>
          <tr><th>Total sensor readings recorded</th><td>{orCount(alertSum.total)}</td></tr>
          <tr><th>Readings with critical ammonia</th><td>{orCount(alertSum.ammonia_breaches)}</td></tr>
          {/* Ammonia and manure moisture only — the metrics the system
              alerts on. Temperature and humidity are measured and shown
              elsewhere, but their safe bands come from temperate-climate
              studies, so counting them here put ~98% of all readings
              "outside safe range" on an official document.
              Snapshots archived before the correction have no
              moisture_breaches key and keep printing their original rows —
              a frozen report is never rewritten. */}
          {alertSum.moisture_breaches != null ? (
            <>
              <tr><th>Readings with critical manure moisture</th><td>{orCount(alertSum.moisture_breaches)}</td></tr>
              <tr><th>Readings with any critical status</th><td>{orCount(alertSum.critical_alerts)}</td></tr>
            </>
          ) : (
            <>
              <tr><th>Readings with temperature outside safe range</th><td>{orCount(alertSum.temp_anomalies)}</td></tr>
              <tr><th>Readings with humidity outside safe range</th><td>{orCount(alertSum.humidity_anomalies)}</td></tr>
              <tr><th>Readings with any critical status</th><td>{orCount(alertSum.critical_alerts)}</td></tr>
            </>
          )}
        </tbody>
      </table>

      <div className="print-section-title">
        Maintenance compliance{' '}
        <span className="print-scope">
          (status snapshot{statusAsOf ? ` as of ${statusAsOf}` : ' as of generation'})
        </span>
      </div>
      <table className="print-table print-kv">
        <tbody>
          {!activity && (
            <tr><th>Clean-outs completed this period</th><td>{orCount(maint.completed_this_month)}</td></tr>
          )}
          <tr><th>Farms overdue</th><td>{orCount(maint.overdue)}</td></tr>
          <tr><th>Farms non-compliant</th><td>{orCount(maint.non_compliant)}</td></tr>
        </tbody>
      </table>

      <div className="print-section-title">
        Service request summary <span className="print-scope">(all-time, odor and fly control)</span>
      </div>
      <table className="print-table print-kv">
        <tbody>
          <tr><th>Total requests</th><td>{orCount(svc.total)}</td></tr>
          <tr><th>Completed</th><td>{orCount(svc.completed)}</td></tr>
          <tr><th>Pending</th><td>{orCount(svc.pending)}</td></tr>
        </tbody>
      </table>
        </>
      )}

      <div className="print-section-title">Completed inspections — {report.period_label}</div>
      {inspections.length === 0 ? (
        <p className="print-empty">No completed inspections in this period.</p>
      ) : (
        <table className="print-table">
          <colgroup>
            <col style={{ width: '13%' }} /><col style={{ width: '24%' }} /><col style={{ width: '21%' }} />
            <col style={{ width: '16%' }} /><col style={{ width: '14%' }} /><col style={{ width: '12%' }} />
          </colgroup>
          <thead><tr><th>ID</th><th>Farm</th><th>Owner</th><th>Type</th><th>Date</th><th>Status</th></tr></thead>
          <tbody>
            {inspections.map((i, idx) => (
              <tr key={idx}>
                <td>{orDash(i.inspection_number)}</td><td>{orDash(i.farm_name)}</td><td>{orDash(i.owner_name)}</td>
                <td>{orDash(i.inspection_type)}</td><td>{orDash(i.completed_at)}</td><td>{orText(i.status, 'Completed')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="print-section-title">
        Overdue and non-compliant farms{' '}
        <span className="print-scope">(as of {statusAsOf || 'generation'})</span>
      </div>
      {overdueFarms.length === 0 ? (
        <p className="print-empty">No farms were overdue or non-compliant at this cutoff.</p>
      ) : (
        <table className="print-table">
          <colgroup>
            <col style={{ width: '22%' }} /><col style={{ width: '20%' }} /><col style={{ width: '17%' }} />
            <col style={{ width: '16%' }} /><col style={{ width: '12%' }} /><col style={{ width: '13%' }} />
          </colgroup>
          <thead><tr><th>Farm</th><th>Owner</th><th>Barangay</th><th>Last clean-out</th><th>Overdue by</th><th>Status</th></tr></thead>
          <tbody>
            {overdueFarms.map((f, idx) => (
              <tr key={idx}>
                <td>{orDash(f.farm_name)}</td><td>{orDash(f.owner_name)}</td><td>{orDash(f.barangay)}</td>
                <td>{orText(f.last_performed_at, 'Not recorded')}</td><td>{orDays(f.days_overdue)}</td><td>{orDash(f.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="print-section-title">Alert incidents by farm — {report.period_label}</div>
      {alerts.length === 0 ? (
        <p className="print-empty">No alerts recorded in this period.</p>
      ) : (
        alertSummaryRows ? (
          <table className="print-table">
            {/* Narrower name columns so the six numeric ones keep enough
                width for their own headings. A column too tight for the word
                above it breaks that word in half, which is harder to read
                than a shortened farm name. */}
            <colgroup>
              <col style={{ width: hasResolution ? '17%' : '26%' }} />
              <col style={{ width: hasResolution ? '15%' : '22%' }} />
              <col style={{ width: '11%' }} /><col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} /><col style={{ width: '11%' }} />
              {hasResolution && <><col style={{ width: '12%' }} /><col style={{ width: '12%' }} /></>}
            </colgroup>
            {/* Resolution columns only on snapshots that recorded them. An
                older archive keeps its original six. */}
            <thead><tr><th>Farm</th><th>Owner</th><th>Ammonia</th><th>Moisture</th><th>Critical</th><th>Warning</th>{hasResolution && <><th>Resolved</th><th>Ongoing</th></>}</tr></thead>
            <tbody>
              {alertSummaryRows.map((r, idx) => (
                <tr key={idx}>
                  <td>{orDash(r.farm_name)}</td><td>{orDash(r.owner_name)}</td><td>{orCount(r.ammonia)}</td>
                  <td>{orCount(r.moisture)}</td><td>{orCount(r.critical)}</td><td>{orCount(r.warning)}</td>
                  {hasResolution && <><td>{orCount(r.resolved)}</td><td>{orCount(r.ongoing)}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
        <table className="print-table">
          <colgroup>
            <col style={{ width: '20%' }} /><col style={{ width: '18%' }} /><col style={{ width: '13%' }} />
            <col style={{ width: '11%' }} /><col style={{ width: '19%' }} /><col style={{ width: '19%' }} />
          </colgroup>
          <thead><tr><th>Farm</th><th>Owner</th><th>Sensor</th><th>Status</th><th>Triggered</th><th>Resolved</th></tr></thead>
          <tbody>
            {alerts.map((a, idx) => (
              <tr key={idx}>
                <td>{orDash(a.farm_name)}</td><td>{orDash(a.owner_name)}</td><td>{orDash(a.sensor_type)}</td>
                <td>{orDash(a.status)}</td><td>{orDash(a.triggered_at)}</td><td>{orText(a.resolved_at, 'Ongoing')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        )
      )}

      <div className="print-section-title">Completed clean-out log — {report.period_label}</div>
      {cleanouts.length === 0 ? (
        <p className="print-empty">No completed clean-outs in this period.</p>
      ) : (
        <table className="print-table">
          <colgroup>
            <col style={{ width: '24%' }} /><col style={{ width: '22%' }} /><col style={{ width: '19%' }} />
            <col style={{ width: '15%' }} /><col style={{ width: '20%' }} />
          </colgroup>
          <thead><tr><th>Farm</th><th>Owner</th><th>Barangay</th><th>Completed</th><th>Method</th></tr></thead>
          <tbody>
            {cleanouts.map((m, idx) => (
              <tr key={idx}>
                <td>{orDash(m.farm_name)}</td><td>{orDash(m.owner_name)}</td><td>{orDash(m.barangay)}</td>
                <td>{orDash(m.performed_at)}</td><td>{orDash(m.method)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="print-section-title">Completed service requests — {report.period_label}</div>
      {services.length === 0 ? (
        <p className="print-empty">No completed service requests in this period.</p>
      ) : (
        <table className="print-table">
          <colgroup>
            <col style={{ width: '16%' }} /><col style={{ width: '17%' }} /><col style={{ width: '15%' }} />
            <col style={{ width: '14%' }} /><col style={{ width: '13%' }} /><col style={{ width: '25%' }} />
          </colgroup>
          <thead><tr><th>Type</th><th>Farm</th><th>Owner</th><th>Barangay</th><th>Completed</th><th>Notes</th></tr></thead>
          <tbody>
            {services.map((r, idx) => (
              <tr key={idx}>
                <td>{orDash(r.service_type)}</td><td>{orDash(r.farm_name)}</td><td>{orDash(r.owner_name)}</td>
                <td>{orDash(r.barangay)}</td><td>{orDash(r.completed_at)}</td><td>{orDash(r.notes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {hasVetScope && (
        <>
          <div className="print-section-title">
            Veterinary summary <span className="print-scope">(all-time, all veterinarians)</span>
          </div>
          <table className="print-table print-kv">
            <tbody>
              <tr><th>Total completed</th><td>{orCount(vet.total_completed)}</td></tr>
              <tr><th>Farms covered</th><td>{orCount(vet.farms_covered)}</td></tr>
            </tbody>
          </table>

          <div className="print-section-title">Completed veterinary services — {report.period_label}</div>
          {vetServices.length === 0 ? (
            <p className="print-empty">No completed vet services in this period.</p>
          ) : (
            <table className="print-table">
              <colgroup>
                <col style={{ width: '16%' }} /><col style={{ width: '17%' }} /><col style={{ width: '15%' }} />
                <col style={{ width: '14%' }} /><col style={{ width: '17%' }} /><col style={{ width: '21%' }} />
              </colgroup>
              <thead><tr><th>Type</th><th>Farm</th><th>Owner</th><th>Barangay</th><th>Veterinarian</th><th>Completed</th></tr></thead>
              <tbody>
                {vetServices.map((v, idx) => (
                  <tr key={idx}>
                    <td>{orDash(v.service_type)}</td><td>{orDash(v.farm_name)}</td><td>{orDash(v.owner_name)}</td>
                    <td>{orDash(v.barangay)}</td><td>{orDash(v.vet_name)}</td><td>{orDash(v.completed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      <Signatures signatures={s.signatures} fallbackTitle="LGU Staff" />
    </div>
  )
}
