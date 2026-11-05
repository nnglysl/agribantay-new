import { isPrimaryValue } from './primaryMonitoring.js'

export const VET_METRICS = [
  { key: 'ammonia', label: 'Ammonia', icon: 'air', primary: true },
  { key: 'moisture', label: 'Manure Moisture', icon: 'drop', primary: true },
  { key: 'temperature', label: 'Temperature', icon: 'temperature' },
  { key: 'humidity', label: 'Humidity', icon: 'drop' },
]

// Current values come only from the assignment-aware API snapshot, never from
// farm.latest_reading or historical chart points, including for offline devices.
export function vetCurrentReading(row) {
  return row?.connectivity === 'Online' && row.device_status !== 'Inactive' && row.house_status !== 'Inactive'
    && !(row.poultry_house_id != null && row.assignment_verified === false)
    && !['Offline', 'Inactive', 'Not Monitored', 'Pending Setup', 'Unavailable'].includes(row.state)
    ? row.current_reading : null
}

export function vetSourceLabel(row) {
  return `${row.poultry_house_id == null ? 'House not recorded' : row.house_name} · ${row.device_name || 'No assigned device'}`
}

// The Vet history endpoint returns sampled per-device measurements without
// house/assignment attribution or recorded condition statuses. Keep that scope
// explicit; do not attach the current house or manufacture a severity verdict.
export function vetHistorySamples(data, hours, device = '', now = Date.now()) {
  if (Number(data?.hours) !== Number(hours) || !Array.isArray(data?.devices)) return []
  const since = now - Number(hours) * 3600000
  return data.devices.filter(series => !device || String(series.sensor_id) === device).map(series => ({
    ...series,
    points: (Array.isArray(series.points) ? series.points : []).filter(point => {
      const timestamp = Date.parse(point.t)
      return Number.isFinite(timestamp) && timestamp >= since && timestamp <= now
    }).map(point => Object.fromEntries([
      ['t', point.t], ...VET_METRICS.map(({ key }) => [key, isPrimaryValue(point[key]) ? Number(point[key]) : null]),
    ])).sort((a, b) => Date.parse(a.t) - Date.parse(b.t)),
  })).filter(series => series.points.length > 0)
}

export function vetSampleHighlights(series) {
  return VET_METRICS.map(metric => {
    const samples = series.flatMap(device => device.points.filter(point => isPrimaryValue(point[metric.key])))
    return { ...metric, count: samples.length,
      min: samples.length ? Math.min(...samples.map(point => point[metric.key])) : null,
      max: samples.length ? Math.max(...samples.map(point => point[metric.key])) : null }
  })
}
