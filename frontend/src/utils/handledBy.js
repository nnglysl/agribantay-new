// "Handled By" filter shared by the Staff and Vet Service Requests pages.
// Sent to the API as handled_by=… and re-applied on the rows the API returns
// (cached/polled responses), always on accepted_by_id vs the signed-in user's
// id — never on names. Mirrors backend App\Support\HandledByFilter.

export const HANDLED_BY_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'My Requests' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'others', label: 'Handled by Others' },
]

export function matchesHandledBy(row, mode, userId) {
  const handler = row.accepted_by_id ?? null
  switch (mode) {
    case 'mine': return userId != null && handler === userId
    case 'unassigned': return handler === null
    case 'others': return handler !== null && handler !== userId
    default: return true
  }
}
