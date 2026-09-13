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
