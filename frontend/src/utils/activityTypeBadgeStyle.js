import { serviceTypeBadgeStyle } from './serviceBadgeStyle'

const NEUTRAL = { color: '#6b7280', backgroundColor: '#eef1ea' }

// Reuse the existing service palette, including legacy activity labels.
const SERVICE_TYPES = new Set([
  'Farm Biosecurity', 'Blood Test', 'Vaccination', 'Vaccine', 'Odor Control', 'Fly Control',
])

const CATEGORY_STYLE = {
  Request: { color: '#7c3aed', backgroundColor: '#f3ecfd' },
  Farm: { color: '#256b3d', backgroundColor: '#eaf3ec' },
  Account: { color: '#2f5fa0', backgroundColor: '#e9eef6' },
  Service: { color: '#4338ca', backgroundColor: '#eeecfb' },
  Inspection: { color: '#b45309', backgroundColor: '#fbf1e2' },
  Alert: { color: '#b91c1c', backgroundColor: '#fbeaea' },
  Device: NEUTRAL,
  System: { color: '#475569', backgroundColor: '#e8edf3' },
}

export function activityTypeBadgeStyle(type) {
  if (SERVICE_TYPES.has(type)) return serviceTypeBadgeStyle(type)
  return Object.hasOwn(CATEGORY_STYLE, type) ? CATEGORY_STYLE[type] : NEUTRAL
}
