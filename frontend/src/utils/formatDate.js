// The timezone every instant is DISPLAYED in. Timestamps arrive from the API
// in UTC; the office and every user of this system is in San Jose, Batangas.
// Pinning it here rather than relying on the browser means the screen, the
// printed report and the backend all name the same day for the same record —
// the backend routes its own formatting through App\Support\LocalTime, which
// reads the matching config('app.display_timezone').
//
// Only for instants. Date-only values (a clean-out date, a reporting period)
// carry no time of day and must not be shifted through a timezone.
export const DISPLAY_TIME_ZONE = 'Asia/Manila'

// Full month name, day, and year — e.g. "September 12, 2026". No numeric
// (09/12/2026) or abbreviated (Sep 12, 2026) formats.
export function formatDate(dateInput) {
  if (!dateInput) return '—'
  return new Date(dateInput).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: DISPLAY_TIME_ZONE })
}

export function formatDateTime(dateInput) {
  if (!dateInput) return '—'
  const date = new Date(dateInput)
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: DISPLAY_TIME_ZONE })
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

// How long ago an instant was, in words — "just now", "12 minutes ago",
// "3 hours ago", "2 days ago".
//
// Written for the device-connectivity line, where the exact clock time is not
// the question. A farmer reading "Offline" next to a temperature of 31.1 C has
// no way to tell whether that number is a minute old or from yesterday, and
// the number itself looks identical either way. The elapsed time is what says
// whether the reading still describes the house.
//
// Deliberately coarse: past a day it stops counting hours, because nothing a
// farmer decides depends on whether a dead device went quiet 26 or 34 hours
// ago — only on the fact that it has been out for days.
export function timeAgo(dateInput) {
  if (!dateInput) return null

  const then = new Date(dateInput).getTime()
  if (Number.isNaN(then)) return null

  // A clock skew between the device, the server and this browser can put a
  // fresh timestamp slightly in the future; that is still "just now", not a
  // negative age.
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000))

  if (seconds < 60) return 'just now'

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`

  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}
