import { DISPLAY_TIME_ZONE } from './formatDate'

/**
 * "Oct 1 – 7, 2026" for a deployment, collapsing the parts the two dates
 * share. A monitoring period is read as one span, and repeating the month and
 * year on both ends makes a one-week window look like two unrelated dates
 * that happen to be listed together.
 */
export function formatDeploymentPeriod(firstIso, lastIso) {
  const first = new Date(firstIso)
  const last = new Date(lastIso)

  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) {
    return '—'
  }

  const fmt = (d, o) => d.toLocaleDateString('en-US', { timeZone: DISPLAY_TIME_ZONE, ...o })

  const sameYear = fmt(first, { year: 'numeric' }) === fmt(last, { year: 'numeric' })
  const sameMonth = sameYear && fmt(first, { month: 'short' }) === fmt(last, { month: 'short' })
  const sameDay = sameMonth && fmt(first, { day: 'numeric' }) === fmt(last, { day: 'numeric' })

  if (sameDay) {
    return fmt(first, { month: 'short', day: 'numeric', year: 'numeric' })
  }
  if (sameMonth) {
    return `${fmt(first, { month: 'short', day: 'numeric' })} – ${fmt(last, { day: 'numeric', year: 'numeric' })}`
  }
  if (sameYear) {
    return `${fmt(first, { month: 'short', day: 'numeric' })} – ${fmt(last, { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  return `${fmt(first, { month: 'short', day: 'numeric', year: 'numeric' })} – ${fmt(last, { month: 'short', day: 'numeric', year: 'numeric' })}`
}
