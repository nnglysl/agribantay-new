import ReportLetterhead from './ReportLetterhead'
import { styles, Signatures } from './ReportsLayout'

/**
 * Admin-scoped variant of GeneratedReportView — same formal document look,
 * but only the Admin/LGU sections, since a regular Admin's own live Reports
 * page never shows Vet-scoped data (see Admin\ReportController) and the
 * backend already strips vet_summary/vet_services from this snapshot for
 * a non-Super-Admin caller (see Admin\GeneratedReportController::show()).
 * Super Admin keeps using the full GeneratedReportView, which legitimately
 * combines Admin + Vet data, matching its own live Reports page.
 */
export default function AdminGeneratedReportView({ report }) {
  const s = report.snapshot ?? {}
  const insp = s.inspection_summary ?? {}
  const alertSum = s.alert_summary ?? {}
  const maint = s.maintenance_summary ?? {}
  const svc = s.service_summary ?? {}

  const inspections = s.completed_inspections ?? []
  const alerts = s.alert_records ?? []
  const overdueFarms = s.maintenance_overdue ?? []
  const cleanouts = s.maintenance_completed ?? []
  const services = s.completed_services ?? []

  return (
    <div>
      <ReportLetterhead />
      <h1 style={styles.printHead}>{report.report_name}</h1>
      <p style={styles.printSub}>Poultry farm monitoring and service summary</p>
      <p style={styles.printSub}>Reporting period: {report.period_label}</p>
      <p style={styles.printMeta}>Generated {report.date_generated}</p>

      <div className="print-section-title">Inspection summary (all-time)</div>
      <table className="print-table">
        <tbody>
          <tr><th>Total inspections</th><td>{insp.total}</td></tr>
          <tr><th>Completed</th><td>{insp.completed}</td></tr>
          <tr><th>Scheduled</th><td>{insp.scheduled}</td></tr>
          <tr><th>General</th><td>{insp.general}</td></tr>
          <tr><th>Follow-up</th><td>{insp.follow_up}</td></tr>
        </tbody>
      </table>

      <div className="print-section-title">Alert summary (all-time)</div>
      <table className="print-table">
        <tbody>
          <tr><th>Total alerts</th><td>{alertSum.total}</td></tr>
          <tr><th>Ammonia threshold breaches</th><td>{alertSum.ammonia_breaches}</td></tr>
          <tr><th>Temperature anomalies</th><td>{alertSum.temp_anomalies}</td></tr>
          <tr><th>Humidity anomalies</th><td>{alertSum.humidity_anomalies}</td></tr>
          <tr><th>Critical alerts</th><td>{alertSum.critical_alerts}</td></tr>
        </tbody>
      </table>

      <div className="print-section-title">Maintenance summary</div>
      <table className="print-table">
        <tbody>
          <tr><th>Completed this month</th><td>{maint.completed_this_month}</td></tr>
          <tr><th>Currently overdue</th><td>{maint.overdue}</td></tr>
          <tr><th>Non-compliant farms</th><td>{maint.non_compliant}</td></tr>
        </tbody>
      </table>

      <div className="print-section-title">Service request summary (all-time)</div>
      <table className="print-table">
        <tbody>
          <tr><th>Total requests</th><td>{svc.total}</td></tr>
          <tr><th>Completed</th><td>{svc.completed}</td></tr>
          <tr><th>Pending</th><td>{svc.pending}</td></tr>
        </tbody>
      </table>

      <div className="print-section-title">Completed inspections — {report.period_label}</div>
      {inspections.length === 0 ? (
        <p style={{ fontSize: 12 }}>No completed inspections in this period.</p>
      ) : (
        <table className="print-table">
          <thead><tr><th>ID</th><th>Farm</th><th>Owner</th><th>Type</th><th>Date</th><th>Status</th></tr></thead>
          <tbody>
            {inspections.map((i, idx) => (
              <tr key={idx}>
                <td>{i.inspection_number}</td><td>{i.farm_name}</td><td>{i.owner_name}</td>
                <td>{i.inspection_type}</td><td>{i.completed_at}</td><td>{i.status || 'Completed'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="print-section-title">Overdue and non-compliant farms</div>
      {overdueFarms.length === 0 ? (
        <p style={{ fontSize: 12 }}>All farms were compliant at generation time.</p>
      ) : (
        <table className="print-table">
          <thead><tr><th>Farm</th><th>Owner</th><th>Barangay</th><th>Last clean-out</th><th>Overdue by</th><th>Status</th></tr></thead>
          <tbody>
            {overdueFarms.map((f, idx) => (
              <tr key={idx}>
                <td>{f.farm_name}</td><td>{f.owner_name}</td><td>{f.barangay}</td>
                <td>{f.last_performed_at}</td><td>{f.days_overdue} days</td><td>{f.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="print-section-title">Alert incidents — {report.period_label}</div>
      {alerts.length === 0 ? (
        <p style={{ fontSize: 12 }}>No alerts recorded in this period.</p>
      ) : (
        <table className="print-table">
          <thead><tr><th>Farm</th><th>Owner</th><th>Sensor</th><th>Status</th><th>Triggered</th><th>Resolved</th></tr></thead>
          <tbody>
            {alerts.map((a, idx) => (
              <tr key={idx}>
                <td>{a.farm_name}</td><td>{a.owner_name}</td><td>{a.sensor_type}</td>
                <td>{a.status}</td><td>{a.triggered_at}</td><td>{a.resolved_at || 'Ongoing'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="print-section-title">Completed clean-out log — {report.period_label}</div>
      {cleanouts.length === 0 ? (
        <p style={{ fontSize: 12 }}>No completed clean-outs in this period.</p>
      ) : (
        <table className="print-table">
          <thead><tr><th>Farm</th><th>Owner</th><th>Barangay</th><th>Completed</th><th>Method</th></tr></thead>
          <tbody>
            {cleanouts.map((m, idx) => (
              <tr key={idx}>
                <td>{m.farm_name}</td><td>{m.owner_name}</td><td>{m.barangay}</td>
                <td>{m.performed_at}</td><td>{m.method}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="print-section-title">Completed service requests — {report.period_label}</div>
      {services.length === 0 ? (
        <p style={{ fontSize: 12 }}>No completed service requests in this period.</p>
      ) : (
        <table className="print-table">
          <thead><tr><th>Type</th><th>Farm</th><th>Owner</th><th>Barangay</th><th>Completed</th><th>Notes</th></tr></thead>
          <tbody>
            {services.map((r, idx) => (
              <tr key={idx}>
                <td>{r.service_type}</td><td>{r.farm_name}</td><td>{r.owner_name}</td>
                <td>{r.barangay}</td><td>{r.completed_at}</td><td>{r.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Signatures right="Noted by, LGU Administrator" />
    </div>
  )
}
