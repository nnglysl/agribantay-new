import { useId, useState } from 'react'
import { useMonitoringResource as useResource } from '../hooks/useMonitoringResource'
import { formatValue } from '../constants/sensorConditions'
import { formatDateTime } from '../utils/formatDate'
import { useIsMobile } from '../hooks/useIsMobile'
import ScrollableTabs from './ScrollableTabs'
import TableFooter from './TableFooter'
import './farmer-readings.css'
import './house-monitoring.css'

const METRICS = [['ammonia', 'Ammonia', true], ['moisture', 'Manure Moisture', true], ['temperature', 'Temperature', false], ['humidity', 'Humidity', false]]

// Presentation only: never substitute an old reading for an unavailable current observation.
function currentReading(row) {
  // A fresh record can lack primary values while still supplying real supporting measurements.
  return row?.connectivity === 'Online' && !['Offline', 'Inactive', 'Not Monitored'].includes(row.state) ? row.current_reading : null
}
function stateLabel(state, farmer) {
  if (!farmer) return state || 'No Readings Yet'
  return ({ 'No Readings Yet': 'No readings yet.', 'Not Monitored': 'No device assigned', 'Incomplete Data': 'Some readings are missing' })[state] || state || 'No readings yet.'
}
function placementLabel(row, farmer, history = false) {
  if (!farmer || row?.poultry_house_id) return row?.house_name
  return history ? 'Past readings before house setup' : 'Farm device — house not selected'
}

export default function HouseMonitoring({ farmId, cards = false, snapshot, farmer = false }) {
  return <Monitoring key={farmId} farmId={farmId} cards={cards} snapshot={snapshot} farmer={farmer} />
}

function Monitoring({ farmId, cards, snapshot, farmer }) {
  const id = useId()
  const isMobile = useIsMobile()
  const current = useResource(snapshot ? null : `/farms/${farmId}/house-monitoring`, {}, farmId)
  const data = snapshot && String(snapshot.farm_id) === String(farmId) ? snapshot : current.data
  const [house, setHouse] = useState('')
  const [history, setHistory] = useState(false)
  const [historyView, setHistoryView] = useState('daily')
  const [page, setPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState(10)
  const [from, setFrom] = useState(''), [to, setTo] = useState('')
  const historical = useResource(history ? `/farms/${farmId}/house-readings` : null,
    { poultry_house_id: house || undefined, page, per_page: historyPageSize, from: from || undefined, to: to || undefined, view: historyView }, farmId)
  const chooseHouse = value => { setHouse(value); setPage(1) }
  const selectView = index => { setHistory(index === 1); setPage(1) }
  const tabKey = (event, index) => {
    if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index
    selectView(next)
    document.getElementById(`${id}-tab-${next}`).focus()
  }
  const tabs = !cards && <ScrollableTabs role="tablist" label="House reading views" className="fr-tabs" containerStyle={{ marginBottom: '16px' }} isMobile={isMobile}>
    {['Current Readings', 'Reading History'].map((label, index) => <button key={label} id={`${id}-tab-${index}`} type="button" role="tab" aria-selected={history === (index === 1)} aria-controls={`${id}-panel`} tabIndex={history === (index === 1) ? 0 : -1} onKeyDown={event => tabKey(event, index)} onClick={() => selectView(index)}>{label}</button>)}
  </ScrollableTabs>
  const panelProps = !cards ? { id: `${id}-panel`, role: 'tabpanel', 'aria-labelledby': `${id}-tab-${history ? 1 : 0}` } : {}
  if (current.error) return <div className="hm">{tabs}<section className="hm-panel" aria-label="House monitoring" {...panelProps}><p role="alert">{current.error}</p><button onClick={current.refresh}>Retry Monitoring</button></section></div>
  if (!data) return <div className="hm">{tabs}<section className="hm-panel" aria-label="House monitoring" {...panelProps}><p role="status">Loading house monitoring…</p></section></div>
  const rows = data.rows || []
  const currentRows = rows.filter(row => row.poultry_house_id)
  const houses = rows.filter(row => row.poultry_house_id)
  const selected = house ? currentRows.find(row => row.key === house || String(row.poultry_house_id) === house) : currentRows.find(row => row.house_status === 'Active') || currentRows[0]
  const selectedReading = currentReading(selected)
  const filtered = (history ? rows : currentRows).filter(row => !house || String(row.poultry_house_id || 'unknown') === house)
  const count = history ? historical.data?.last_page || 1 : 1
  const currentPage = Math.min(page, count)
  const display = filtered
  return <div className="hm">{tabs}<section className="hm-panel" aria-label="House monitoring" {...panelProps}>
    <div className="hm-heading"><h2>{cards ? farmer ? 'Your Poultry House' : 'House Monitoring' : history ? 'Reading History' : 'Current Readings'}</h2>{!snapshot && (cards || !history) && <button onClick={current.refresh}>{farmer ? 'Refresh readings' : 'Refresh'}</button>}</div>
    <div className={`hm-controls${!cards && !history ? ' hm-controls--current' : ''}`}><label>{farmer ? 'Poultry House' : 'House / Device'}<select aria-label="Monitoring house" value={cards ? house || String(selected?.poultry_house_id || selected?.key || '') : house} onChange={event => chooseHouse(event.target.value)}>
      <option value="">{cards ? 'Choose a house / device' : 'All houses'}</option>{houses.map(row => <option key={row.key} value={row.poultry_house_id}>{row.house_name}{row.house_status === 'Inactive' ? ' (Inactive)' : ''}</option>)}
      {cards ? currentRows.map(row => <option key={row.key} value={row.key}>{placementLabel(row, farmer)} · {row.device_name}</option>) : history && <option value="unknown">Historical farm-level readings (no house)</option>}</select></label>
      {!cards && history && <>
        <label>View<select aria-label="History aggregation" value={historyView} onChange={event => { setHistoryView(event.target.value); setPage(1) }}><option value="daily">Daily Summary</option><option value="hourly">Hourly Summary</option><option value="individual">Individual Readings</option></select></label><label>From<input type="date" aria-label="Monitoring from date" value={from} onChange={event => { setFrom(event.target.value); setPage(1) }} /></label><label>To<input type="date" aria-label="Monitoring to date" value={to} onChange={event => { setTo(event.target.value); setPage(1) }} /></label></>}
    </div>
    {farmer && <>
      {!data.coverage.known && <p className="hm-note">Poultry houses have not been set up yet. Farm device readings have no recorded house.</p>}
      {data.coverage.unmonitored_houses > 0 && <p className="hm-note">Some poultry houses have no active device. Their conditions are unknown.</p>}
    </>}
    {cards ? <>
      {farmer ? <div className="hm-current-condition"><span>Current condition</span><strong>{selected ? stateLabel(selected.state, true) : 'No device assigned'}</strong>
        <p>{selected ? `${placementLabel(selected, true)} · ${selected.device_name || 'No device assigned'}` : house ? 'This house is no longer available. Choose a house again.' : 'No house or device is available yet.'}</p>
        <small>{selectedReading?.recorded_at ? `Last updated: ${formatDateTime(selectedReading.recorded_at)}` : selected?.last_reading?.recorded_at ? `Last received: ${formatDateTime(selected.last_reading.recorded_at)} (past reading)` : 'No readings yet.'}</small>
      </div> : <p className="hm-note">{selected ? `${selected.house_name} · ${selected.device_name || 'No assigned device'} · ${selected.state}` : 'Not Monitored — no recorded placement.'}</p>}
      <div className="hm-cards">{METRICS.map(([metric, label, primary]) => <article key={metric} data-metric={metric}>
        <h3>{label}</h3>{!farmer && <p>{primary ? 'Primary indicator' : 'Supporting indicator'}</p>}<strong>{selectedReading?.[metric] == null ? '—' : formatValue(metric, selectedReading[metric])}</strong>
        {primary && <span>{selectedReading?.[metric] == null ? stateLabel(selected?.state, farmer) : selectedReading[metric + '_status']}</span>}
        {!farmer && selectedReading?.recorded_at && <small>Recorded {formatDateTime(selectedReading.recorded_at)}</small>}
      </article>)}</div>
    </> : <>
      {!farmer && <p className="hm-note hm-accuracy-note">Ammonia values are device estimates; ppm accuracy has not yet been validated.</p>}
      {historical.error && history && <p role="alert">{historical.error}</p>}
      {historical.loading && history ? <p role="status">Loading historical readings…</p> : <div className="hm-scroll"><table><thead><tr><th>House / Device</th>{METRICS.map(([metric, label]) => <th key={metric}>{label}</th>)}<th>Condition</th>{!farmer && !history && <th>Connectivity</th>}<th>{farmer && !history ? 'Last updated' : 'Recorded'}</th></tr></thead>
        <tbody>{history ? historical.data?.items?.map(item => <ReadingRow key={item.id} row={{ poultry_house_id: item.poultry_house_id, house_name: item.house_name, device_name: item.device_name, state: item.primary_assessment.condition, assignment_event_id: item.assignment_event_id }} reading={item} history farmer={farmer} />)
          : display.map(row => <ReadingRow key={row.key} row={row} reading={currentReading(row)} farmer={farmer} />)}</tbody></table>
          {!(history ? historical.data?.items?.length : display.length) && <p className="hm-note">No readings or houses match this selection.</p>}</div>}
      {history && <TableFooter currentPage={currentPage} totalPages={count} pageSize={historyPageSize} onPageChange={setPage} onPageSizeChange={size => { setHistoryPageSize(size); setPage(1) }} rangeStart={historical.data?.total ? (currentPage - 1) * historyPageSize + 1 : 0} rangeEnd={Math.min(currentPage * historyPageSize, historical.data?.total || 0)} totalItems={historical.data?.total || 0} isMobile={isMobile} />}
    </>}
    {farmer && <details className="hm-about"><summary>About these readings</summary><p className="hm-note">Ammonia and manure moisture determine the monitored condition. Temperature and humidity provide extra context. Ammonia uses the existing device estimate; ppm accuracy has not been validated. Offline devices do not supply current values.</p></details>}
  </section></div>
}

function ReadingRow({ row, reading, history = false, farmer = false }) {
  return <tr><td><strong>{placementLabel(row, farmer, history)}</strong><small>{row.device_name || (history ? 'Device not recorded' : 'No assigned device')}</small>{farmer && history && !row.poultry_house_id && <small>No house was recorded for these readings.</small>}</td>
    {METRICS.map(([metric, , primary]) => <td key={metric}>{reading?.[metric] == null ? '—' : formatValue(metric, reading[metric])}{primary && reading?.[metric] != null && <small>{reading[metric + '_status']}</small>}</td>)}
    <td>{stateLabel(row.state, farmer)}</td>{!farmer && !history && <td>{row.connectivity}</td>}<td>{reading?.recorded_at ? formatDateTime(reading.recorded_at) : row.last_reading?.recorded_at ? `Last recorded ${formatDateTime(row.last_reading.recorded_at)}` : stateLabel('No Readings Yet', farmer)}</td></tr>
}
