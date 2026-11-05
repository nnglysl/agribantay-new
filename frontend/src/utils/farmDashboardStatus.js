import { GREEN } from '../theme/green'
import { breachesOf, overallStatus } from '../constants/sensorConditions'
import { assessFarmDevices, hasCurrentPrimary, assessPrimaryReading } from './primaryMonitoring'

const HERO = {
  Safe: {
    iconName: 'health_and_safety', color: GREEN.primary,
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
  const assessment = assessFarmDevices(devices)
  const current = devices.filter(hasCurrentPrimary), currentSet = new Set(current)
  const offlineCount = devices.filter(d => d.connectivity !== 'Online').length
  const waitingCount = devices.filter(d => d.connectivity === 'Online' && !hasCurrentPrimary(d)).length
  const counts = { Critical: 0, Warning: 0 }
  for (const device of current) for (const breach of breachesOf(device, alerting)) counts[breach.status]++
  const partial = assessment.partial_coverage
  let hero = { ...HERO[!devices.length ? 'setup' : !current.length ? 'unavailable' : assessment.severity] }
  if (assessment.condition === 'Incomplete Data') hero = { ...HERO.unavailable, title: 'Incomplete Data', text: 'One or more primary readings are unavailable. Full Safe conditions cannot be confirmed.' }
  if (partial) {
    const coverage = (current.length < devices.length ? 'Only '+current.length+' of '+devices.length+' devices '+(current.length===1?'is':'are')+' reporting. ' : '')+assessment.complete_devices+' of '+devices.length+' devices have both primary readings.'
    hero = { ...hero, title: assessment.severity === 'Safe' ? 'Farm monitoring is partial' : hero.title,
      text: hero.text+' Monitoring is partial. '+coverage }
  }
  const badges = []
  for (const status of ['Critical', 'Warning']) if (counts[status]) badges.push({tone:status,label:counts[status]+' '+status+' condition'+(counts[status]===1?'':'s')})
  if (assessment.incomplete_data) badges.push({tone:'Offline',label:'Incomplete Data'})
  if (assessment.condition === 'No Readings Yet') badges.push({tone:'Offline',label:'No Readings Yet'})
  if (offlineCount) badges.push({tone:'Offline',label:offlineCount+' device'+(offlineCount===1?'':'s')+' offline'})
  if (waitingCount) badges.push({tone:'Offline',label:waitingCount+' device'+(waitingCount===1?'':'s')+' awaiting readings'})
  const attention = devices.filter(d=>!currentSet.has(d)||assessPrimaryReading(d).incomplete_data||breachesOf(d,alerting).length)
    .sort((a,b)=>{const rank=d=>currentSet.has(d)?SEVERITY[overallStatus(d)]??-1:-1;return rank(b)-rank(a)})
  return {hero,badges,attention,partial,unavailable:devices.length>0&&!current.length,assessment}
}
