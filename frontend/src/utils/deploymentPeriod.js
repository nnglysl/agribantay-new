import { DISPLAY_TIME_ZONE } from './formatDate'

/**
 * Actual assignment dates, in Manila. Never fill a missing assignment date
 * from a sensor-reading date; those describe different events.
 */
export function formatDeploymentPeriod(firstIso, lastIso, isCurrent = false) {
  const full = value => new Date(value).toLocaleDateString('en-US', {
    timeZone: DISPLAY_TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric',
  })
  const valid = value => !!value && !Number.isNaN(new Date(value).getTime())
  if (!valid(firstIso)) {
    if (isCurrent) return 'Start date unavailable – Present'
    return valid(lastIso) ? `Start date unavailable – ${full(lastIso)}` : 'Assignment dates unavailable'
  }
  if (isCurrent) return `${full(firstIso)} – Present`
  if (!valid(lastIso)) return `${full(firstIso)} – End date unavailable`
  const first = new Date(firstIso)
  const last = new Date(lastIso)

  const fmt = (d, o) => d.toLocaleDateString('en-US', { timeZone: DISPLAY_TIME_ZONE, ...o })

  const sameYear = fmt(first, { year: 'numeric' }) === fmt(last, { year: 'numeric' })
  const sameMonth = sameYear && fmt(first, { month: 'short' }) === fmt(last, { month: 'short' })
  const sameDay = sameMonth && fmt(first, { day: 'numeric' }) === fmt(last, { day: 'numeric' })

  if (sameDay) {
    return fmt(first, { month: 'short', day: 'numeric', year: 'numeric' })
  }
  if (sameYear) {
    return `${fmt(first, { month: 'short', day: 'numeric' })} – ${fmt(last, { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  return `${fmt(first, { month: 'short', day: 'numeric', year: 'numeric' })} – ${fmt(last, { month: 'short', day: 'numeric', year: 'numeric' })}`
}
