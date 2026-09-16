// Standardized Service Request badge colors/shape — used everywhere a
// service request's TYPE or STATUS is shown as a badge across the system
// (Super Admin, Admin, Vet, Farmer, dashboards, reports, farm/service
// request details), so the same value always reads the same color no
// matter which page shows it. Text-only pills — no dots, circles, or icons.
//
// Service type: Odor Control -> Purple, Fly Control -> Amber (existing
// system amber, reused), Vaccination -> Indigo, Blood Test -> Teal.
// Request status: Pending -> Orange, Scheduled -> Blue (existing system
// blue, reused), Completed -> Green (existing system green, reused).
// Red stays reserved for Critical elsewhere in the system — never reused
// here for a service type or a normal request status.

export const BADGE_SHAPE = {
  display: 'inline-flex', alignItems: 'center', padding: '4px 11px',
  borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap',
}

const NEUTRAL = { color: '#6b7280', backgroundColor: '#eef1ea' }

const SERVICE_TYPE_BADGE_STYLE = {
  'Odor Control': { color: '#7c3aed', backgroundColor: '#f3ecfd' },
  'Fly Control':  { color: '#b45309', backgroundColor: '#fbf1e2' },
  'Vaccine':      { color: '#4338ca', backgroundColor: '#eeecfb' },
  'Blood Test':   { color: '#0f766e', backgroundColor: '#e6f4f2' },
}

const REQUEST_STATUS_BADGE_STYLE = {
  Pending:   { color: '#c2410c', backgroundColor: '#fdece1' },
  Scheduled: { color: '#2f5fa0', backgroundColor: '#e9eef6' },
  Overdue:   { color: '#b91c1c', backgroundColor: '#fdecec' },
  Completed: { color: '#256b3d', backgroundColor: '#eaf3ec' },
  Cancelled: { color: '#6b7280', backgroundColor: '#eef1ea' },
}

// service_type as stored in the DB is always "<Label> Request" (e.g.
// "Odor Control Request", "Vaccine Request") — this accepts either the raw
// value or an already-stripped label, and treats "Vaccine"/"Vaccination"
// as the same category since both spellings appear across the system.
function normalizeServiceType(type) {
  const label = (type || '').replace(/ Request$/, '')
  return label === 'Vaccination' ? 'Vaccine' : label
}

export function serviceTypeBadgeStyle(type) {
  return SERVICE_TYPE_BADGE_STYLE[normalizeServiceType(type)] || NEUTRAL
}

// Display label — "Vaccine" is always shown as "Vaccination", matching
// the label already used across the Vet-facing pages.
export function serviceTypeLabel(type) {
  const label = (type || '').replace(/ Request$/, '')
  if (!label) return '—'
  return label === 'Vaccine' ? 'Vaccination' : label
}

export function requestStatusBadgeStyle(status) {
  return REQUEST_STATUS_BADGE_STYLE[status] || NEUTRAL
}
