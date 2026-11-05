import { manilaDay } from './reportPeriod'
import { DISPLAY_TIME_ZONE } from './formatDate'
import { fillMonthlyReportBuckets } from './fillMonthlyReportBuckets'

// One API AlertHistory row is one incident. Keep severity/resolution independent.
export function monthlyAlertSensorCounts(records, from = '', to = '') {
  const months = new Map()
  for (const record of records) {
    const sensor = record.sensor_type?.toLowerCase()
    if (sensor !== 'ammonia' && sensor !== 'moisture') continue
    if (!record.triggered_at_raw) continue
    const day = manilaDay(record.triggered_at_raw)
    if (!day || (from && day < from) || (to && day > to)) continue
    const [year, month] = day.split('-').map(Number)
    const key = `${year}-${month - 1}`
    if (!months.has(key)) months.set(key, {
      key,
      label: new Date(`${day.slice(0, 7)}-01T00:00:00Z`).toLocaleString('en-PH', { month: 'short', year: 'numeric', timeZone: DISPLAY_TIME_ZONE }),
      ammonia: 0, moisture: 0, count: 0,
    })
    const bucket = months.get(key)
    bucket[sensor] += 1
    bucket.count += 1
  }
  const buckets = fillMonthlyReportBuckets([...months.values()], from, to)
    .map(bucket => ({ key: bucket.key, label: bucket.label, ammonia: bucket.ammonia ?? 0, moisture: bucket.moisture ?? 0 }))
  return {
    buckets,
    totals: buckets.reduce((totals, bucket) => ({ ammonia: totals.ammonia + bucket.ammonia, moisture: totals.moisture + bucket.moisture }), { ammonia: 0, moisture: 0 }),
  }
}
