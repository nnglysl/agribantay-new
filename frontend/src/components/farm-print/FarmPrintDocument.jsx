import { PRINT_SECTIONS, summarizeReadings } from '../../utils/farmPrint'
import ReportLetterhead from '../ReportLetterhead'
import { ReportStyles, Signatures, styles } from '../ReportsLayout'

const show = value => value === null || value === undefined || value === '' ? 'Not recorded' : String(value)
const metric = (value, unit) => value === null || value === undefined || value === '' ? 'Not recorded' : `${value} ${unit}`
const FIELDS = {
  farm: [['Farm Name', 'farm_name'], ['Farm Owner', 'owner_name'], ['Barangay', 'barangay'], ['Address', 'address'], ['Farm Size', 'farm_size'], ['Birds (recorded)', 'num_birds'], ['Registration Date', 'registration_date'], ['Registration Status', 'registration_status']],
  owner: [['Name', 'name'], ['Contact Number', 'mobile_number'], ['Email', 'email']],
}
const CONDITIONS = { ammonia: 'Ammonia', moisture: 'Moisture', temperature: 'Temperature', humidity: 'Humidity' }
const columns = {
  assignments: [['Device', 'device_name'], ['Assignment Date', 'assigned_at'], ['Unassignment Date', 'unassigned_at'], ['Status / Evidence', r => [r.status, r.note, !r.dates_verified && `Observed readings: ${show(r.first_reading_at)} to ${show(r.last_reading_at)}`].filter(Boolean).join('\n')]],
  inspections: [['Scheduled / Completed', r => `${show(r.scheduled_at)}\nCompleted: ${show(r.completed_at)}`], ['Type', 'inspection_type'], ['Status', 'status'], ['Assigned / Scheduled By', r => `${show(r.assigned_staff)}\nScheduled by: ${show(r.scheduled_by)}`], ['Findings / Remarks', r => [r.findings, r.notes].filter(Boolean).join('\n') || 'Not recorded']],
  cleanouts: [['Date Performed', 'performed_at'], ['Activity Type', 'maintenance_type'], ['Notes', 'notes']],
  disposal: [['Disposal Date', 'disposal_date'], ['Method', 'method'], ['Quantity (as recorded)', 'quantity'], ['Buyer / Recipient', 'buyer_name'], ['Notes', 'notes']],
  services: [['Request / Date', r => `${show(r.request_number)}\n${show(r.requested_at)}`], ['Service Type', r => `${r.is_retired ? 'Historical retired service: ' : ''}${show(r.service_type)}`], ['Original Status', 'status'], ['Scheduled / Completed', r => `${show(r.scheduled_at)}\nCompleted: ${show(r.completed_at)}`], ['Handled By / Remarks', r => [r.handled_by, r.notes, r.completion_notes].filter(Boolean).join('\n') || 'Not recorded']],
  documents: [['Document Type', 'document_type'], ['File Name', 'file_name'], ['Uploaded', 'uploaded_at'], ['Uploaded By', 'uploaded_by'], ['Submission Status', 'status']],
  alerts: [['Triggered / Resolved', r => `${show(r.triggered_at)}\nResolved: ${show(r.resolved_at)}`], ['Device', 'device_name'], ['Metric', 'metric'], ['Recorded Value', 'value'], ['Original Status', 'status']],
}
const widths = { assignments: [17,22,22,39], inspections: [19,14,12,20,35], cleanouts: [20,30,50],
  disposal: [17,14,19,22,28], services: [18,22,13,20,27], documents: [18,25,19,19,19], alerts: [28,22,16,17,17] }

function Fields({ values, fields }) {
  return <dl className="fp-fields">{fields.map(([label, key]) => <div key={label}><dt>{label}</dt><dd>{show(values?.[key])}</dd></div>)}</dl>
}

function Records({ section, rows = [] }) {
  if (!rows.length) return <p className="print-empty">No matching records for this section.</p>
  return <table className="print-table" data-section={section}><colgroup>{widths[section].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup><thead><tr>{columns[section].map(([label]) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id ?? index} data-record-id={row.id}>{columns[section].map(([label, field]) => <td key={label}>{show(typeof field === 'function' ? field(row) : row[field])}</td>)}</tr>)}</tbody></table>
}

function SensorSummary({ rows = [] }) {
  if (!rows.length) return <p className="print-empty">No matching sensor readings for this period.</p>
  const average = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
  const units = { ammonia: 'ppm estimate', moisture: '%', temperature: '°C', humidity: '%' }
  return <>
    <p className="fp-note">All {rows.length.toLocaleString()} matching historical readings are summarized by recorded device label for the selected period, including previous assignments and undated records in All Dates. Mock/test readings are kept separate. Missing or non-numeric values are counted and excluded from numeric summaries. Means are rounded to two decimals; stored conditions are counted without reclassification.</p>
    {summarizeReadings(rows).map((group, index) => <div key={index}>
      <h3>{show(group.device_name)} · {group.is_mock ? 'Mock / test readings' : 'Recorded readings'} · {group.count.toLocaleString()} records</h3>
      <table className="print-table" data-section="readings"><colgroup>{[20,12,11,11,11,35].map((width, i) => <col key={i} style={{ width: `${width}%` }} />)}</colgroup>
        <thead><tr>{['Indicator', 'Valid / Missing', 'Min.', 'Average', 'Max.', 'Stored Conditions'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{Object.entries(group.metrics).map(([key, summary]) => <tr key={key}>
          <th scope="row">{CONDITIONS[key]} ({units[key]})</th><td>{summary.count} valid{'\n'}{summary.missing} missing</td>
          <td>{show(summary.min)}</td><td>{summary.average == null ? 'Not recorded' : average.format(summary.average)}</td><td>{show(summary.max)}</td>
          <td>{[...Object.entries(summary.conditions).map(([status, count]) => `${status}: ${count}`),
            ...Object.entries(summary.unassessed).map(([status, count]) => `Not assessed (stored status: ${status}): ${count}`)].join('\n')}</td>
        </tr>)}</tbody>
      </table>
    </div>)}
  </>
}

export default function FarmPrintDocument({ report }) {
  const { farm, snapshots, records, range } = report
  const signatures = report.generated_role === 'super_admin'
    ? { prepared_by: null, noted_by: { name: report.generated_by, title: 'Head, Agriculture Office' } }
    : { prepared_by: { name: report.generated_by, title: 'LGU Staff' } }
  return <article className="fp-document">
    <ReportStyles pageSettings={false} />
    <header className="print-headblock"><ReportLetterhead /><h1 style={styles.printHead}>Farm Records Report</h1>
      <p style={styles.printSub}>Poultry farm monitoring and service summary</p>
      <p style={styles.printSub}>{show(farm.farm_name)} · Farm {farm.id} · {show(farm.barangay)}</p>
      <p style={styles.printSub}>Farm owner: {show(farm.owner_name)}</p>
      <p style={styles.printSub}>Reporting period (Asia/Manila): {range.mode === 'all' ? 'All Dates' : `${range.from} to ${range.to}`}</p>
      <p style={styles.printMeta}>Generated {show(report.generated_at_display)} · {show(report.generated_by)}</p>
      <p className="fp-note">Farm, owner, monitoring and compliance sections are current snapshots at generation, including when a historical date range is selected. Dated records use that range; inspections use scheduled dates and assignment history uses overlapping periods. Undated records cannot match a custom range.</p>
      <p className="fp-note">All {report.total_rows.toLocaleString()} matching history records are represented: sensor readings are summarized; other records are listed in full. Regenerate after concurrent edits. Printing does not alter or archive source records.</p>
    </header>
    {report.sections.map(section => <section key={section} aria-label={PRINT_SECTIONS[section]}><h2 className="print-section-title">{PRINT_SECTIONS[section]}</h2>
      {FIELDS[section] ? <><p className="fp-note">Current snapshot as of {report.generated_at_display}.</p><Fields values={snapshots[section]} fields={FIELDS[section]} /></> : section === 'compliance' ? <>
        <p className="fp-note">Current compliance as of {report.generated_at_display}; calculated by the annual compliance service.</p>
        <Fields values={{ ...snapshots.compliance, interval: snapshots.compliance?.required_interval, last_full_cleanout_date: snapshots.compliance?.last_full_cleanout_date || 'No recorded full clean-out' }} fields={[
          ['Farm Registration Date', 'registration_date'], ['Last Qualifying Full Clean-out', 'last_full_cleanout_date'], ['Required Interval', 'interval'], ['Next Due Date', 'due_date'], ['Current Status', 'status'],
          [snapshots.compliance?.status === 'Non-Compliant' ? 'Days Overdue' : 'Days Remaining', snapshots.compliance?.status === 'Non-Compliant' ? 'days_overdue' : 'days_remaining'],
        ]} />{snapshots.compliance?.undetermined_reason && <p>{snapshots.compliance.undetermined_reason}</p>}
      </> : section === 'monitoring' ? <>
        {snapshots.monitoring_assessment && <p>Farm condition: {snapshots.monitoring_assessment.condition}. {snapshots.monitoring_assessment.incomplete_data ? 'Incomplete Data. ' : ''}{snapshots.monitoring_assessment.complete_devices} of {snapshots.monitoring_assessment.total_devices} devices have both primary readings.</p>}
        <p className="fp-note">Current snapshot. Ammonia and manure moisture are primary measures; temperature and humidity are supporting indicators. Ammonia is an unvalidated ppm estimate. Each value retains its reading timestamp.</p>
        {!snapshots.monitoring?.length ? <p className="print-empty">Pending device setup — no device is currently assigned. Historical readings may still be included below.</p> : snapshots.monitoring.map((device, index) => <div className="fp-device" key={index}><h3>{show(device.device_name)} — {device.connectivity}</h3><p>{device.reading_context}. Current condition: {device.current_condition || 'Unavailable'}. {device.primary_assessment?.incomplete_data && 'Incomplete Data: one or both current primary measurements are unavailable.'}</p><p className="fp-note">Last reading: {show(device.last_reading_at)}</p><div className="fp-metrics"><strong>Ammonia: {metric(device.ammonia, 'ppm estimate')}</strong><strong>Manure moisture: {metric(device.moisture, '%')}</strong><span>Temperature: {metric(device.temperature, '°C')}</span><span>Humidity: {metric(device.humidity, '%')}</span></div></div>)}
      </> : section === 'readings' ? <SensorSummary rows={records.readings} /> : <>
        {section === 'cleanouts' && <p className="fp-note">Only the Full Manure Clean-out classification resets annual compliance. Other maintenance and disposal remain distinct.</p>}
        {section === 'services' && <p className="fp-note">Staff scope includes retired Odor/Fly history; Super Admin oversight also includes authorized Vet records. Retired statuses and scheduled dates are historical evidence, not available services or current appointments.</p>}
        {section === 'documents' && <p className="fp-note">Metadata only. On File / Previous Submission describes stored submission history as of generation, not approval or compliance. Private files and download links are excluded.</p>}
        <Records section={section} rows={section === 'assignments' ? snapshots.assignments : records[section]} />
      </>}
    </section>)}
    <Signatures signatures={signatures} fallbackTitle="LGU Staff" />
  </article>
}
