import ReportLetterhead from './ReportLetterhead'
import { styles, Signatures } from './ReportsLayout'

/**
 * Vet-scoped variant of GeneratedReportView — same formal document look, but
 * only the veterinary sections of the snapshot, since vets must not see the
 * admin-only sections that live in the same combined GeneratedReport record.
 */
export default function VetGeneratedReportView({ report }) {
  const s = report.snapshot ?? {}
  const vet = s.vet_summary ?? {}
  const vetServices = s.vet_services ?? []

  return (
    <div>
      <ReportLetterhead />
      <h1 style={styles.printHead}>{report.report_name}</h1>
      <p style={styles.printSub}>Vaccination and blood test history and records</p>
      <p style={styles.printSub}>Reporting period: {report.period_label}</p>
      <p style={styles.printMeta}>Generated {report.date_generated}</p>

      <div className="print-section-title">Veterinary summary (all-time)</div>
      <table className="print-table">
        <tbody>
          <tr><th>Total completed</th><td>{vet.total_completed}</td></tr>
          <tr><th>Farms covered</th><td>{vet.farms_covered}</td></tr>
        </tbody>
      </table>

      <div className="print-section-title">Completed vaccinations and blood tests — {report.period_label}</div>
      {vetServices.length === 0 ? (
        <p style={{ fontSize: 12 }}>No completed vet services in this period.</p>
      ) : (
        <table className="print-table">
          <thead><tr><th>Type</th><th>Farm</th><th>Owner</th><th>Barangay</th><th>Veterinarian</th><th>Completed</th></tr></thead>
          <tbody>
            {vetServices.map((v, idx) => (
              <tr key={idx}>
                <td>{v.service_type}</td><td>{v.farm_name}</td><td>{v.owner_name}</td>
                <td>{v.barangay}</td><td>{v.vet_name}</td><td>{v.completed_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Signatures right="Municipal Veterinarian" />
    </div>
  )
}
