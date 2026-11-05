import { useMemo, useState } from 'react'
import { useCachedFetch } from '../hooks/useCachedFetch'
import { useMonitoringResource } from '../hooks/useMonitoringResource'
import { BACKGROUND_POLL_MS } from '../constants/polling'
import { formatValue } from '../constants/sensorConditions'
import { formatDateTime } from '../utils/formatDate'
import { isPrimaryValue } from '../utils/primaryMonitoring'
import { VET_METRICS, vetCurrentReading, vetHistorySamples, vetSampleHighlights, vetSourceLabel } from '../utils/vetMonitoring'
import { FarmBadge, FarmIcon, ProfileCard } from './farm-details/FarmProfileSections'
import ReadingTrendChart from './ReadingTrendChart'
import './vet-farm-monitoring.css'

const RANGE_LABELS = { 24: 'Last 24 hours', 72: 'Last 3 days', 168: 'Last 7 days' }

export default function VetFarmMonitoring({ farmId }) {
  const [source, setSource] = useState('')
  const [device, setDevice] = useState('')
  const [hours, setHours] = useState(24)
  const current = useMonitoringResource(`/farms/${farmId}/house-monitoring`, {}, farmId)
  const history = useCachedFetch(`/vet/farms/${farmId}/readings-history`, { hours }, { pollMs: BACKGROUND_POLL_MS })
  const rows = current.data?.rows || []
  const selected = source ? rows.find(row => row.key === source) : rows.find(row => vetCurrentReading(row)) || rows[0]
  const reading = vetCurrentReading(selected)
  const historyMatches = Number(history.data?.hours) === hours
  const historyLoading = history.loading || (!historyMatches && !history.error)
  const series = useMemo(() => vetHistorySamples(history.error ? null : history.data, hours, device), [history.data, history.error, hours, device])
  const highlights = useMemo(() => vetSampleHighlights(series), [series])
  const timestamp = reading?.recorded_at
  const lastReceived = selected?.last_reading?.recorded_at
  const recordedDevices = historyMatches ? history.data.devices || [] : []

  return <div className="vm fd-page" aria-label="Veterinarian farm monitoring">
    <ProfileCard title="Farm Monitoring Summary" icon="monitor" action={<button type="button" className="fd-button fd-button--small" onClick={current.refresh}>Refresh</button>}>
      {current.error ? <p className="vm-message" role="alert">{current.error}</p> : !current.data ? <p className="vm-message" role="status">Loading farm monitoring…</p> : <>
        <div className="vm-summary">
          <div><span className="vm-summary-label">Current farm condition</span><FarmBadge value={current.data.farm_assessment?.condition || 'Unavailable'} /></div>
          <div><span className="vm-summary-label">Selected source status</span><FarmBadge value={selected?.state || 'Not Monitored'} /></div>
          <div><span className="vm-summary-label">{timestamp ? 'Current reading recorded' : 'Last received (historical)'}</span><strong>{timestamp || lastReceived ? formatDateTime(timestamp || lastReceived) : 'No readings yet'}</strong></div>
        </div>
        <label className="vm-select">Current House / Device<select aria-label="Current monitoring source" value={source || selected?.key || ''} onChange={event => setSource(event.target.value)}>
          {!rows.length && <option value="">No source available</option>}
          {source && !selected && <option value={source}>Source no longer available</option>}
          {rows.map(row => <option key={row.key} value={row.key}>{vetSourceLabel(row)}</option>)}
        </select></label>
        {!reading && <p className="vm-message">{source && !selected ? 'The selected source is no longer available. Choose another source.' : 'No valid current reading is available for this source. Historical samples remain separate below.'}</p>}
      </>}
    </ProfileCard>

    <div className="vm-sensors" aria-label="Sensor summaries">{VET_METRICS.map(({ key, label, icon, primary }) => {
      const valid = !current.error && isPrimaryValue(reading?.[key])
      const status = valid && primary && ['Safe', 'Warning', 'Critical'].includes(reading[`${key}_status`]) ? reading[`${key}_status`] : null
      return <article className="vm-sensor" key={key} data-metric={key}>
        <h3><FarmIcon name={icon} size={18} />{label}</h3>
        <strong className="vm-value">{valid ? formatValue(key, Number(reading[key])) : '—'}</strong>
        {status ? <FarmBadge value={status} /> : <span className="vm-caption">{primary ? !current.data && !current.error ? 'Loading…' : valid ? 'Not assessed' : 'No current value' : 'Supporting indicator'}</span>}
        <p>{valid && timestamp ? formatDateTime(timestamp) : 'Current measurements only'}</p>
      </article>
    })}</div>
    <p className="vm-disclosure">Ammonia values are device estimates; ppm accuracy has not yet been validated.</p>

    <ProfileCard title="Environmental Trend" icon="records">
      <p className="vm-description">Historical measurements are grouped by the device that recorded them. House and visit attribution is unavailable in this view; current placements are never applied to past readings.</p>
      <label className="vm-select">Historical device<select aria-label="Historical monitoring device" value={device} onChange={event => setDevice(event.target.value)}>
        <option value="">All recorded devices</option>
        {device && !recordedDevices.some(item => String(item.sensor_id) === device) && <option value={device}>No samples for selected device</option>}
        {recordedDevices.map(item => <option key={item.sensor_id} value={item.sensor_id}>{item.device_name}</option>)}
      </select></label>
      {history.error ? <div role="alert" className="vm-message"><p>{history.error}</p><button type="button" className="fd-button" onClick={history.refetch}>Retry historical readings</button></div>
        : <ReadingTrendChart data={{ devices: series }} loading={historyLoading} hours={hours} onHoursChange={setHours} showSummary={false} historical />}
    </ProfileCard>

    <ProfileCard title="Monitoring Highlights" icon="info">
      <p className="vm-description">{RANGE_LABELS[hours]} · {historyLoading ? 'Loading historical samples…' : history.error ? 'Historical samples unavailable.' : `${series.length} recorded device${series.length === 1 ? '' : 's'}, ${series.reduce((total, item) => total + item.points.length, 0)} historical samples.`}</p>
      {!historyLoading && !history.error && <ul className="vm-highlights">{highlights.map(({ key, label, count, min, max }) => <li key={key}>
        <strong>{label}</strong><span>{count ? `${formatValue(key, min)}–${formatValue(key, max)}` : 'No valid samples'}</span><small>{count} sampled measurements</small>
      </li>)}</ul>}
      <p className="vm-disclosure">Ranges describe sampled history; peaks between displayed samples may be absent. These ranges do not establish current conditions, alert counts or time spent in a condition.</p>
    </ProfileCard>
  </div>
}
