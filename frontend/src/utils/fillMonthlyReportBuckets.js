import { DISPLAY_TIME_ZONE } from './formatDate'

// Keep the existing record-derived counts; add empty calendar months for display.
export function fillMonthlyReportBuckets(buckets, from = '', to = '') {
  const monthOfDate = value => {
    if (!value) return null
    const [year, month] = value.split('-').map(Number)
    return year * 12 + month - 1
  }
  const monthOfBucket = bucket => {
    const [year, month] = bucket.key.split('-').map(Number)
    return year * 12 + month
  }
  const ordered = [...buckets].sort((a, b) => monthOfBucket(a) - monthOfBucket(b))
  const first = monthOfDate(from) ?? (ordered.length ? monthOfBucket(ordered[0]) : null)
  const last = monthOfDate(to) ?? (ordered.length ? monthOfBucket(ordered.at(-1)) : null)
  if (first == null || last == null || !Number.isFinite(first) || !Number.isFinite(last)) return []
  const byMonth = new Map(ordered.map(bucket => [monthOfBucket(bucket), bucket]))
  const result = []
  for (let month = first; month <= last; month++) {
    const year = Math.floor(month / 12), index = month % 12
    result.push(byMonth.get(month) ?? {
      key: `${year}-${index}`,
      label: new Date(Date.UTC(year, index, 1)).toLocaleString('en-PH', { month: 'short', year: 'numeric', timeZone: DISPLAY_TIME_ZONE }),
      count: 0,
    })
  }
  return result
}
