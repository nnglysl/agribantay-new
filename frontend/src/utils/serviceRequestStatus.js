// Overdue is DERIVED, not stored (same approach as the Inspections module):
// an accepted (Scheduled) service request whose calendar date has passed
// without being completed or cancelled. Pending has no schedule, and
// Completed/Cancelled are excluded by status, so none of them can be
// overdue. Today's visit stays Scheduled for the whole calendar day.
export function isRequestOverdue(r) {
  if (!r || r.status !== 'Scheduled' || !r.scheduled_at) return false
  const d = new Date(r.scheduled_at)
  if (isNaN(d.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return d < today
}

// Label for badges/details — the stored status, except Overdue.
export function requestDisplayStatus(r) {
  return isRequestOverdue(r) ? 'Overdue' : r?.status
}
