// Full month name, day, and year — e.g. "September 12, 2026". No numeric
// (09/12/2026) or abbreviated (Sep 12, 2026) formats.
export function formatDate(dateInput) {
  if (!dateInput) return '—'
  return new Date(dateInput).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function formatDateTime(dateInput) {
  if (!dateInput) return '—'
  const date = new Date(dateInput)
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${formatDate(date)}, ${time}`
}

// Parses a date-input value ("YYYY-MM-DD") as LOCAL midnight. `new Date("2026-07-13")`
// is UTC midnight, which is 8:00 AM in the Philippines — so a farm registered on
// July 13 (local midnight) compared "before" a July 13 start date and vanished
// from the filter. Use this for every from/to date-range comparison.
export function parseLocalDate(value) {
  if (!value) return null
  const [y, m, d] = String(value).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

// Inclusive From/To check on the LOCAL calendar date of a timestamp:
// `from`/`to` are date-input values ("YYYY-MM-DD", parsed by parseLocalDate);
// either may be empty. Shared by list filters so they all agree.
export function isWithinLocalDateRange(dateValue, from, to) {
  if (!from && !to) return true
  if (!dateValue) return false
  const d = new Date(dateValue)
  if (isNaN(d.getTime())) return false
  const dOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (from && dOnly < parseLocalDate(from)) return false
  if (to && dOnly > parseLocalDate(to)) return false
  return true
}
