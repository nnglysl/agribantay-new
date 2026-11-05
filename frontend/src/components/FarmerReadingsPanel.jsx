import { useCallback, useId, useState } from 'react'
import { useCachedFetch } from '../hooks/useCachedFetch'
import { useTableFetch } from '../hooks/useTableFetch'
import { useIsMobile } from '../hooks/useIsMobile'
import { BACKGROUND_POLL_MS } from '../constants/polling'
import { formatValue } from '../constants/sensorConditions'
import { formatDateTime } from '../utils/formatDate'
import { houseDisplayCondition } from '../utils/farmDashboardSummary'
import ScrollableTabs from './ScrollableTabs'
import TableFooter from './TableFooter'
import './farmer-readings.css'

const METRICS = [['ammonia', 'Ammonia', true], ['moisture', 'Manure Moisture', true], ['temperature', 'Temperature'], ['humidity', 'Humidity']]
const EMPTY_FILTERS = { from: '', to: '', placement: '' }

function ConditionBadge({ condition = 'Unavailable' }) {
  const tone = ({ Safe: 'safe', Warning: 'warning', Critical: 'critical', Offline: 'offline' })[condition] || 'neutral'
  return <span className={`fr-badge fr-badge--${tone}`}>{condition}</span>
}

function PlacementOptions({ rows, devices = [], includeLegacy = true, includeDevices = false }) {
  const houses = rows.filter(row => row.poultry_house_id != null)
  const allDevices = new Map(rows.filter(row => row.device_id != null).map(row => [Number(row.device_id), { id: Number(row.device_id), device_name: row.device_name }]))
  devices.forEach(device => allDevices.set(Number(device.id), device))
  return <>
    <option value="">All Poultry Houses</option>
    {houses.length > 0 && <optgroup label="Poultry houses">{houses.map(row => <option key={row.poultry_house_id} value={`house:${row.poultry_house_id}`}>{row.house_name}</option>)}</optgroup>}
    {includeLegacy && <option value="house:unknown">Earlier farm readings</option>}
    {includeDevices && allDevices.size > 0 && <optgroup label="Devices">{[...allDevices.values()].map(device => <option key={device.id} value={`device:${device.id}`}>{device.device_name || `Device ${device.id}`}</option>)}</optgroup>}
  </>
}

function ReadingCells({ reading }) {
  return METRICS.map(([metric, , primary]) => <td key={metric} className={primary ? 'fr-primary' : undefined}>
    {reading?.[metric] == null ? '—' : formatValue(metric, reading[metric])}
    {primary && reading?.[metric] != null && ['Safe', 'Warning', 'Critical'].includes(reading[metric + '_status']) && <small>{reading[metric + '_status']}</small>}
  </td>)
}

function PlacementCell({ row, history = false }) {
  return <td><strong>{row.poultry_house_id != null ? row.house_name : history ? 'Farm-level reading' : 'Farm device — no house recorded'}</strong><small>{row.device_name || (history ? 'Device not recorded' : 'No device assigned')}</small></td>
}

function ReadingTable({ rows, history = false }) {
  const summary = history && rows.some(row => row.reading_count != null)
  return <div className="fr-table-scroll" tabIndex={0} role="region" aria-label={history ? 'Historical sensor readings' : 'Current monitoring readings'}>
    <table>
      <thead><tr>
        {history && <th scope="col">{summary ? 'Period' : 'Date / Time'}</th>}
        <th scope="col">Poultry House</th>
        {METRICS.map(([metric, label, primary]) => <th scope="col" key={metric} className={primary ? 'fr-primary' : undefined}>{label}</th>)}
        <th scope="col">Condition</th>{summary && <th scope="col">Readings</th>}{!history && <th scope="col">Last Updated</th>}
      </tr></thead>
      <tbody>{rows.map(row => {
        const condition = history ? row.primary_assessment?.condition || 'Unavailable' : houseDisplayCondition(row)
        // Trust the API's freshness/assignment checks and suppress contradictory stale states.
        const reading = history ? row : row.connectivity === 'Online' && !['Offline', 'Inactive', 'Not Monitored', 'Pending Setup', 'Unavailable'].includes(condition) ? row.current_reading : null
        const timestamp = reading?.recorded_at || (!history ? row.last_reading?.recorded_at : null)
        return <tr key={history ? row.id : row.key} data-reading-id={history ? row.id : undefined}>
          {history && <td className="fr-timestamp">{summary ? row.bucket : (timestamp ? formatDateTime(timestamp) : 'Not recorded')}</td>}
          <PlacementCell row={row} history={history} />
          <ReadingCells reading={reading} />
          <td><ConditionBadge condition={condition} /></td>{summary && <td>{row.reading_count.toLocaleString()}</td>}
          {!history && <td className="fr-timestamp">{timestamp ? <>{!reading && <small>Last recorded</small>}{formatDateTime(timestamp)}</> : 'No readings yet'}</td>}
        </tr>
      })}</tbody>
    </table>
    <p className="fr-scroll-hint">Scroll sideways to see all measurements.</p>
  </div>
}

function ReadingsFooter({ page, pages, size, total, onPage, onSize }) {
  const isMobile = useIsMobile(600)
  if (total <= 10) return <p className="fr-results" role="status">{total ? `Showing 1–${total} of ${total} records` : '0 records'}</p>
  return <TableFooter currentPage={page} totalPages={pages} pageSize={size} onPageChange={onPage} onPageSizeChange={onSize}
    rangeStart={(page - 1) * size + 1} rangeEnd={Math.min(page * size, total)} totalItems={total} isMobile={isMobile} hideSinglePageNavigation itemNoun="records" />
}

function HistoryReadings({ farmId, rows, state, setState }) {
  const setPage = useCallback(page => setState(previous => ({ ...previous, page })), [setState])
  const { placement, from, to } = state.filters
  const filters = { from, to, view: state.view }
  if (placement.startsWith('house:')) filters.poultry_house_id = placement.slice(6)
  if (placement.startsWith('device:')) filters.sensor_id = placement.slice(7)
  const result = useTableFetch(`/farms/${farmId}/house-readings`, filters, state.page, state.size, setPage, { pollMs: BACKGROUND_POLL_MS })
  const data = String(result.data?.farm_id) === String(farmId) ? result.data : null
  const [devices, setDevices] = useState([])
  // Keep authorized device choices available while a new filter/page is loading.
  if (data?.devices && data.devices !== devices) setDevices(data.devices)
  const error = result.error || (result.data && !data ? 'Reading history did not match the selected farm.' : '')
  const update = (field, value) => setState(previous => ({ ...previous, draft: { ...previous.draft, [field]: value } }))
  const apply = event => {
    event.preventDefault()
    setState(previous => ({ ...previous, page: 1, filters: { ...previous.draft } }))
  }
  return <>
    <div className="fr-panel-heading"><div><h2>Reading History</h2><p>Ammonia and manure-moisture records, including historical farm-level readings.</p></div></div>
    <div className="fr-tabs fr-history-views" role="tablist" aria-label="History aggregation"><button type="button" aria-selected={state.view === 'daily'} onClick={() => setState(previous => ({ ...previous, page: 1, view: 'daily' }))}>Daily Summary</button><button type="button" aria-selected={state.view === 'hourly'} onClick={() => setState(previous => ({ ...previous, page: 1, view: 'hourly' }))}>Hourly Summary</button><button type="button" aria-selected={state.view === 'individual'} onClick={() => setState(previous => ({ ...previous, page: 1, view: 'individual' }))}>Individual Readings</button></div>
    <form className="fr-filters fr-history-filters" onSubmit={apply} aria-label="Reading history filters">
      <label>From date<input type="date" aria-label="From date" value={state.draft.from} max={state.draft.to || undefined} onChange={event => update('from', event.target.value)} /></label>
      <label>To date<input type="date" aria-label="To date" value={state.draft.to} min={state.draft.from || undefined} onChange={event => update('to', event.target.value)} /></label>
      <label>Poultry House<select aria-label="History poultry house" value={state.draft.placement} onChange={event => update('placement', event.target.value)}><PlacementOptions rows={rows} devices={devices} /></select></label>
      <button type="submit" className="fr-apply">Apply Filters</button>
      {Object.values(state.draft).some(Boolean) && <button type="button" className="fr-reset" onClick={() => setState(previous => ({ ...previous, page: 1, draft: EMPTY_FILTERS, filters: EMPTY_FILTERS }))}>Reset</button>}
    </form>
    {error ? <div className="fr-message" role="alert"><p>{error}</p><button type="button" onClick={result.refetch}>Retry history</button></div>
      : result.loading || !data ? <p className="fr-message" role="status">Loading reading history…</p>
      : <>
        {data.items?.length ? <ReadingTable rows={data.items} history /> : <div className="fr-empty"><h3>No historical readings found</h3><p>There are no recorded readings for the selected filters.</p></div>}
        <ReadingsFooter page={data.current_page} pages={data.last_page} size={state.size} total={data.total} onPage={setPage} onSize={size => setState(previous => ({ ...previous, size, page: 1 }))} />
      </>}
  </>
}

export default function FarmerReadingsPanel({ farmId }) {
  const id = useId()
  const isMobile = useIsMobile()
  const [tab, setTab] = useState(0)
  const [current, setCurrent] = useState({ page: 1, size: 10, placement: '' })
  const [history, setHistory] = useState({ page: 1, size: 10, view: 'daily', draft: EMPTY_FILTERS, filters: EMPTY_FILTERS })
  const monitoring = useCachedFetch(`/farms/${farmId}/house-monitoring`, {}, { pollMs: BACKGROUND_POLL_MS })
  const data = String(monitoring.data?.farm_id) === String(farmId) ? monitoring.data : null
  const rows = data?.rows || []
  const currentRows = rows.filter(row => row.poultry_house_id != null)
  const filtered = currentRows.filter(row => {
    const placement = current.placement
    return !placement || (placement.startsWith('house:')
      ? String(row.poultry_house_id ?? 'unknown') === placement.slice(6)
      : String(row.device_id ?? 'unknown') === placement.slice(7))
  })
  const pages = Math.max(1, Math.ceil(filtered.length / current.size))
  const page = Math.min(current.page, pages)
  const error = monitoring.error || (monitoring.data && !data ? 'Monitoring did not match the selected farm.' : '')
  const selectTab = index => setTab(index)
  const tabKey = (event, index) => {
    if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index
    selectTab(next)
    document.getElementById(`${id}-tab-${next}`).focus()
  }
  return <div className="fr" aria-label="Farm readings">
    <ScrollableTabs role="tablist" label="Reading views" className="fr-tabs" isMobile={isMobile}>
      {['Current Readings', 'Reading History'].map((label, index) => <button key={label} id={`${id}-tab-${index}`} type="button" role="tab" aria-selected={tab === index} aria-controls={`${id}-panel-${index}`} tabIndex={tab === index ? 0 : -1} onKeyDown={event => tabKey(event, index)} onClick={() => selectTab(index)}>{label}</button>)}
    </ScrollableTabs>
    <section className="fr-panel" id={`${id}-panel-0`} role="tabpanel" aria-labelledby={`${id}-tab-0`} hidden={tab !== 0}>
      <div className="fr-panel-heading"><div><h2>Current Readings</h2><p>Latest valid monitoring data from your farm’s devices.</p></div>{!error && data && <div className="fr-current-status"><ConditionBadge condition={data.farm_assessment?.condition} /><button type="button" onClick={monitoring.refetch} aria-label="Refresh current readings">Refresh</button></div>}</div>
      {error ? <div className="fr-message" role="alert"><p>{error}</p><button type="button" onClick={monitoring.refetch}>Retry current readings</button></div>
        : !data ? <p className="fr-message" role="status">Loading current readings…</p>
        : <>
          {rows.length > 0 && <div className="fr-filters fr-current-filters">
            <label>Poultry House<select aria-label="Current poultry house" value={current.placement} onChange={event => setCurrent(previous => ({ ...previous, placement: event.target.value, page: 1 }))}><PlacementOptions rows={currentRows} includeLegacy={false} /></select></label>
          </div>}
          {filtered.length ? <ReadingTable rows={filtered.slice((page - 1) * current.size, page * current.size)} /> : <div className="fr-empty"><h3>No current readings found</h3><p>{currentRows.length ? 'No houses or devices match the selected filters.' : 'No houses are available for current monitoring. Historical farm-level readings remain in Reading History.'}</p></div>}
          <ReadingsFooter page={page} pages={pages} size={current.size} total={filtered.length} onPage={value => setCurrent(previous => ({ ...previous, page: value }))} onSize={size => setCurrent(previous => ({ ...previous, size, page: 1 }))} />
        </>}
    </section>
    <section className="fr-panel" id={`${id}-panel-1`} role="tabpanel" aria-labelledby={`${id}-tab-1`} hidden={tab !== 1}>
      {tab === 1 && <HistoryReadings farmId={farmId} rows={rows} state={history} setState={setHistory} />}
    </section>
  </div>
}
