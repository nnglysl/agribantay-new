// Classifications come from stored backend statuses, never UI thresholds.
export const PRIMARY_METRICS = ['ammonia', 'moisture']
const RANK = { Safe: 0, Warning: 1, Critical: 2 }
export function isPrimaryValue(value) {
  return ['number', 'string'].includes(typeof value) && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(String(value).trim()) && Number.isFinite(Number(value))
}
export function assessPrimaryReading(reading) {
  const available = PRIMARY_METRICS.filter(metric => reading?.has_reading !== false && isPrimaryValue(reading?.[metric]) && Object.hasOwn(RANK, reading?.[`${metric}_status`]))
  const missing = PRIMARY_METRICS.filter(metric => !available.includes(metric))
  const severity = available.reduce((worst, metric) => !worst || RANK[reading[`${metric}_status`]] > RANK[worst] ? reading[`${metric}_status`] : worst, null)
  return { severity, condition: !available.length ? 'No Readings Yet' : severity === 'Safe' && missing.length ? 'Incomplete Data' : severity,
    incomplete_data: missing.length > 0, data_completeness: !missing.length ? 'Complete' : available.length ? 'Incomplete' : 'Unavailable',
    available_primary_metrics: available, missing_primary_metrics: missing }
}
export function hasCurrentPrimary(device) {
  return device?.connectivity === 'Online' && !!device.has_reading && device.primary_assessment?.has_current_primary !== false && assessPrimaryReading(device).severity !== null
}
export function assessFarmDevices(input) {
  const devices = input.filter(device => device.status !== 'Inactive')
  const current = devices.filter(hasCurrentPrimary)
  const complete = current.filter(device => !assessPrimaryReading(device).incomplete_data).length
  const severity = current.reduce((worst, device) => { const s = assessPrimaryReading(device).severity; return !worst || RANK[s] > RANK[worst] ? s : worst }, null)
  const incomplete = devices.length > 0 && complete !== devices.length
  const condition = !devices.length ? 'Pending Setup' : !severity
    ? devices.every(device => device.connectivity !== 'Online') && devices.some(device => device.has_reading) ? 'Offline' : 'No Readings Yet'
    : severity === 'Safe' && incomplete ? 'Incomplete Data' : severity
  return { condition, severity, incomplete_data: incomplete, total_devices: devices.length, complete_devices: complete,
    reporting_devices: current.length, partial_coverage: current.length > 0 && incomplete }
}
