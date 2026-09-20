/**
 * Display helpers for the printed report documents.
 *
 * Archived reports are frozen snapshots, so a value can be missing for two
 * very different reasons: the record genuinely has no value (a farm that has
 * never been cleaned out), or the snapshot predates the field existing at all.
 * Printing an unexplained blank cell in an official LGU document reads as an
 * error either way, and printing "0" for something that was never measured
 * would be inventing a figure — so these helpers keep the two apart.
 */

/** Text cell: falls back to an em dash when there is nothing to show. */
export function orDash(value) {
  if (value === null || value === undefined) return '—'
  const text = String(value).trim()
  return text === '' ? '—' : text
}

/** Text cell with an explicit wording, e.g. "Not recorded" for a missing date. */
export function orText(value, fallback) {
  if (value === null || value === undefined) return fallback
  const text = String(value).trim()
  return text === '' ? fallback : text
}

/**
 * Summary count. A real 0 prints as "0"; a count the snapshot never captured
 * prints as an em dash rather than being rounded down to a figure the report
 * cannot actually support.
 */
export function orCount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return value.trim()
  return '—'
}

/** Overdue duration, which is only meaningful as a number of days. */
export function orDays(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value} ${value === 1 ? 'day' : 'days'}`
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    const n = Number(value)
    return `${n} ${n === 1 ? 'day' : 'days'}`
  }
  return '—'
}
