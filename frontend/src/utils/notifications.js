// Notification categorisation + click destinations, derived from the
// existing notification rows (type / title / message) — no new fields.

export const NOTIFICATION_CATEGORIES = [
  { key: 'all', label: 'All', empty: 'No notifications yet.' },
  { key: 'inspections', label: 'Inspections', empty: 'No inspection notifications.' },
  { key: 'service', label: 'Service Requests', empty: 'No service request notifications.' },
  { key: 'alerts', label: 'Farm Alerts', empty: 'No farm alert notifications.' },
]

// Backend types today: 'Inspection Scheduled' | 'Inspection Completed' |
// 'Inspection Cancelled' | 'Request Update' | 'Sensor Alert' |
// 'maintenance_overdue'. Title/message are checked as a fallback so older
// rows and any future type still land in a sensible tab.
export function notificationCategory(n) {
  const type = (n?.type || '').toLowerCase()
  const title = (n?.title || '').toLowerCase()
  if (type.startsWith('inspection') || title.includes('inspection')) return 'inspections'
  if (type === 'request update' || title.includes('service request') || title.includes('request')) return 'service'
  if (type === 'sensor alert' || type === 'maintenance_overdue' || title.includes('alert')
    || title.includes('overdue') || title.includes('non-compliant') || title.includes('critical')) return 'alerts'
  return null
}

// Every notification message quotes the farm name: `... "Farm Name" ...`.
export function extractFarmName(message) {
  const m = /"([^"]+)"/.exec(message || '')
  return m ? m[1].trim() : ''
}

function withParams(path, params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')
  return qs ? `${path}?${qs}` : path
}

/**
 * Where clicking a notification should take the user. Super Admin gets the
 * module + tab + farm context (the destination pages read ?tab= / ?search=);
 * every other role keeps the link stored on the notification.
 */
export function notificationDestination(n, role) {
  if (role !== 'super_admin') return n?.link || null

  const category = notificationCategory(n)
  const title = (n?.title || '').toLowerCase()
  const farm = extractFarmName(n?.message)

  if (category === 'alerts') {
    if ((n.type || '').toLowerCase() === 'maintenance_overdue' || title.includes('overdue') || title.includes('non-compliant')) {
      return withParams('/admin/maintenance/overdue', { search: farm })
    }
    return withParams('/admin/alert-history', { search: farm })
  }

  if (category === 'service') {
    const tab = title.includes('new ') ? 'pending'
      : title.includes('undone') ? 'scheduled'
      : title.includes('scheduled') ? 'scheduled'
      : (title.includes('completed') || title.includes('declined') || title.includes('cancelled')) ? 'history'
      : 'pending'
    return withParams('/superadmin/service-requests', { tab, search: farm })
  }

  if (category === 'inspections') {
    const tab = title.includes('completed') ? 'completed'
      : title.includes('cancelled') ? 'history'
      : 'scheduled'
    return withParams('/superadmin/inspections', { tab, search: farm })
  }

  return n?.link || null
}

export function timeAgo(value) {
  if (!value) return ''
  const diff = Date.now() - new Date(value).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
