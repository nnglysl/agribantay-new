import { breachesOf, overallStatus } from '../constants/sensorConditions'

const HERO = {
  Safe: {
    iconName: 'health_and_safety', color: '#2c8047',
    title: 'Your farm is doing well',
    text: 'Everything looks comfortable for your chickens right now. Keep up the good work.',
  },
  Warning: {
    iconName: 'warning', color: '#b45309',
    title: 'Your farm needs attention',
    text: 'A few conditions need improvement to keep your chickens healthy.',
  },
  Critical: {
    iconName: 'e911_emergency', color: '#b91c1c',
    title: 'Your farm needs attention now',
    text: 'Some conditions need your attention today to keep your chickens safe.',
  },
  unavailable: {
    iconName: 'sensors_off', color: '#6b7280',
    title: 'Current farm condition unavailable',
    text: 'No recent readings. Last recorded conditions may be out of date.',
  },
  setup: {
    iconName: 'settings', color: '#6b7280',
    title: 'Farm setup pending',
    text: 'A monitoring device has not been registered for your farm yet. Once it is installed, you will start seeing your farm conditions here.',
  },
}
const SEVERITY = { Safe: 0, Warning: 1, Critical: 2 }

/** Presentation only: trust API connectivity and recorded classifications. */
export function farmDashboardStatus(devices, alerting) {
  const current = devices.filter(d => d.connectivity === 'Online' && d.has_reading)
  const currentSet = new Set(current)
  const offlineCount = devices.filter(d => d.connectivity !== 'Online').length
  const waitingCount = devices.filter(d => d.connectivity === 'Online' && !d.has_reading).length
  const counts = { Critical: 0, Warning: 0 }
  let worst = 'Safe'
  for (const device of current) {
    const status = overallStatus(device, alerting)
    if (SEVERITY[status] > SEVERITY[worst]) worst = status
    for (const breach of breachesOf(device, alerting)) counts[breach.status]++
  }

  const partial = current.length > 0 && current.length < devices.length
  let hero = { ...HERO[!devices.length ? 'setup' : !current.length ? 'unavailable' : worst] }
  if (partial) {
    const coverage = `Only ${current.length} of ${devices.length} devices ${current.length === 1 ? 'is' : 'are'} reporting. Other devices have no current readings.`
    hero = worst === 'Safe'
      ? { ...HERO.unavailable, title: 'Farm monitoring is partial', text: `Reporting devices show normal conditions. ${coverage}` }
      : { ...hero, text: `${hero.text} Monitoring is partial. ${coverage}` }
  }

  const badges = []
  for (const status of ['Critical', 'Warning']) {
    if (counts[status]) badges.push({ tone: status, label: `${counts[status]} ${status} condition${counts[status] === 1 ? '' : 's'}` })
  }
  if (offlineCount) badges.push({ tone: 'Offline', label: `${offlineCount} device${offlineCount === 1 ? '' : 's'} offline` })
  if (waitingCount) badges.push({ tone: 'Offline', label: `${waitingCount} device${waitingCount === 1 ? '' : 's'} awaiting readings` })

  const attention = devices.filter(d => !currentSet.has(d) || breachesOf(d, alerting).length > 0)
    .sort((a, b) => {
      const rank = d => currentSet.has(d) ? SEVERITY[overallStatus(d, alerting)] : -1
      return rank(b) - rank(a)
    })

  return { hero, badges, attention, partial, unavailable: devices.length > 0 && !current.length }
}
