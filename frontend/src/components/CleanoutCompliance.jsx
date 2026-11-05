import FarmIcon from './farm-details/FarmIcon'
import './cleanout-compliance.css'

// Dates, status and day counts are supplied by the authoritative backend.
export default function CleanoutCompliance({ status, summary, compact = false, action, variant }) {
  if (summary) return <section className="annual-compliance" aria-label="Annual manure clean-out compliance">
    <strong>Annual Manure Clean-out Compliance</strong>
    <div className="annual-compliance-counts">
      <span>Compliant: <b>{summary.compliant}</b></span>
      <span>Non-Compliant: <b>{summary.non_compliant}</b></span>
      <span>Undetermined: <b>{summary.undetermined}</b></span>
    </div>
  </section>
  const state = status?.status || 'Undetermined'
  const tone = state === 'Compliant' ? 'safe' : state === 'Non-Compliant' ? 'late' : 'unknown'
  if (compact && variant === 'dashboard') return <section className="annual-compliance annual-compliance--dashboard" data-tone={tone} aria-label="Manure clean-out compliance">
    <h2>Manure Clean-out Compliance</h2>
    <div className="fdb-compliance-body">
      <dl><div><dt>Next Full Clean-out Due Date</dt><dd><FarmIcon name="calendar" size={23} />{status?.due_date || 'Undetermined'}</dd></div></dl>
      <div className="fdb-compliance-status"><span className={`annual-compliance-badge ${tone}`}><FarmIcon name={state === 'Compliant' ? 'check-circle' : 'info'} size={21} />{state}</span><p>{status?.undetermined_reason || (state === 'Compliant' ? 'Your farm is currently compliant with the annual clean-out requirement.' : state === 'Non-Compliant' ? 'Your farm is overdue for the annual full manure clean-out.' : 'Annual clean-out compliance has not been determined yet.')}</p></div>
    </div>
    {action && <div className="annual-compliance-actions">{action}</div>}
  </section>
  const fields = compact ? [
    ['Next Full Clean-out Due Date', status?.due_date || 'Undetermined'],
  ] : [
    ['Farm Registration Date', status?.registration_date || 'Undetermined', 'calendar'],
    ['Last Full Clean-out', status?.last_full_cleanout_date || 'No recorded full clean-out', 'cleanout'],
    ['Next Clean-out Due', status?.due_date || 'Undetermined', 'calendar'],
    ['Days Remaining', status?.days_remaining, 'hourglass'],
  ]
  return <section className={`annual-compliance${compact ? '' : ' annual-compliance--detail'}`} aria-label="Manure clean-out compliance">
    <div className="annual-compliance-heading">{compact ? <strong>Manure Clean-out Compliance</strong> : <><span className="annual-compliance-icon"><FarmIcon name="calendar" size={22} /></span><h2>Annual Clean-out Compliance</h2><p className="annual-compliance-description">Farms are required to complete at least one full manure clean-out every 12 months.</p></>}<span className={`annual-compliance-badge ${tone}`}>{!compact && <FarmIcon name={state === 'Compliant' ? 'check-circle' : 'info'} size={17} />}{state}</span></div>
    <dl>{fields.map(([label, value, icon]) => <div key={label}>{!compact && <span className="annual-compliance-field-icon"><FarmIcon name={icon} size={18} /></span>}<dt>{label}</dt><dd>{value ?? 'Undetermined'}{label === 'Days Remaining' && state === 'Non-Compliant' && status?.days_overdue > 0 && <small>{status.days_overdue} {status.days_overdue === 1 ? 'day' : 'days'} overdue</small>}</dd></div>)}</dl>
    {status?.undetermined_reason && <p>{status.undetermined_reason}</p>}
    {action && <div className="annual-compliance-actions">{action}</div>}
  </section>
}
