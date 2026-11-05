import { GREEN } from '../../theme/green'
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import FarmIcon from './FarmIcon'
import ControlDocuments from '../ControlDocuments'
import CleanoutCompliance from '../CleanoutCompliance'
import { formatDateTime } from '../../utils/formatDate'
import { hasCurrentPrimaryReading, isReadingValue, monitoringCondition } from './farmMonitoringState'
import { assessFarmDevices, assessPrimaryReading } from '../../utils/primaryMonitoring'
import './farm-details.css'

export { FarmIcon }

const CONDITIONS = new Set(['Safe', 'Warning', 'Critical'])

export function FarmBadge({ value, kind, icon }) {
  const tone = kind || ({ Safe: 'safe', Warning: 'warning', Critical: 'critical', Online: 'safe', Active: 'safe',
    Offline: 'muted', 'Incomplete Data': 'incomplete-data', 'No Readings Yet': 'muted', 'Pending Setup': 'muted', Overdue: 'warning', 'Non-Compliant': 'critical', Compliant: 'safe' }[value] || 'muted')
  return <span className={`fd-badge fd-badge--${tone}`}>{icon ? <FarmIcon name={icon} size={14} /> : <span aria-hidden="true" />}{value || 'Unavailable'}</span>
}

export function ProfileCard({ title, icon, action, children, className = '' }) {
  return <section className={`fd-panel ${className}`}>
    <div className="fd-panel-heading"><h2><span className="fd-icon"><FarmIcon name={icon} /></span>{title}</h2>{action}</div>
    {children}
  </section>
}

function Field({ label, value, wide }) {
  return <div className={`fd-field${wide ? ' fd-field--wide' : ''}`}><dt>{label}</dt><dd>{value == null || value === '' ? '—' : value}</dd></div>
}

function locationCoordinates(latitude, longitude) {
  // Empty or malformed API values must not become a fabricated zero pin.
  const parse = value => typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN
  const lat = parse(latitude), lng = parse(longitude)
  return { lat, lng, available: Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 }
}

function LocationPreview({ latitude, longitude }) {
  const element = useRef(null)
  const { lat, lng, available } = locationCoordinates(latitude, longitude)
  useEffect(() => {
    if (!available || !element.current) return
    const map = L.map(element.current, { scrollWheelZoom: false, attributionControl: true }).setView([lat, lng], 15)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map)
    L.circleMarker([lat, lng], { radius: 9, color: '#fff', weight: 3, fillColor: GREEN.primary, fillOpacity: 1 }).addTo(map)
    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }))
    resizeObserver.observe(element.current)
    return () => { resizeObserver.disconnect(); map.remove() }
  }, [available, lat, lng])
  return available
    ? <div className="fd-map" ref={element} role="img" aria-label="Registered farm location on the map" />
    : <div className="fd-map fd-map--empty"><FarmIcon name="pin" size={28} /><span>No pinned location is available.</span></div>
}

export function FarmOverview({ farm, registrationDate, onEdit, locationRef, accountAccess, readOnly = false }) {
  const owner = farm.user
  const ownerName = owner ? `${owner.first_name || ''} ${owner.last_name || ''}`.trim()
    : (readOnly ? `${farm.owner_first_name || ''} ${farm.owner_last_name || ''}`.trim() : '') || farm.owner_name
  const ownerAddress = owner?.address || (readOnly && farm.owner_address)
  const { lat, lng, available: hasPin } = locationCoordinates(farm.latitude, farm.longitude)
  return <div className="fd-overview-grid">
    <ProfileCard title="Farm Information" icon="farm" action={!readOnly && <button className="fd-button fd-button--small" onClick={onEdit}>Edit</button>}>
      <dl className="fd-fields">
        <Field label="Farm Name" value={farm.farm_name} />
        <Field label="Farm ID" value={farm.id == null ? null : `#${farm.id}`} />
        <Field label="Barangay" value={farm.barangay} />
        <Field label="Farm Size" value={farm.farm_size} />
        <Field label="Date Registered" value={registrationDate} />
        <Field label="Farm Status" value={<FarmBadge value={farm.status} />} />
        {farm.num_birds != null && <Field label="Number of Birds" value={Number(farm.num_birds).toLocaleString()} />}
        <Field label="Complete Address" value={farm.address} wide />
      </dl>
    </ProfileCard>
    <ProfileCard title="Farm Owner Information" icon="owner">
      <div className="fd-owner"><span className="fd-owner-avatar">{farm.owner_profile_photo_url ? <img src={farm.owner_profile_photo_url} alt="Farm owner" /> : (ownerName || '').split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('')}</span><div><strong>{ownerName || (readOnly ? 'Not provided' : 'Owner information unavailable')}</strong><span>Registered farm owner</span></div></div>
      <dl className="fd-fields">
        <Field label="Contact Number" value={owner?.mobile_number || farm.mobile_number || (readOnly ? 'Not provided' : null)} />
        <Field label="Email Address" value={owner?.email || (readOnly && farm.email) || 'Not provided'} />
        {(ownerAddress || readOnly) && <Field label="Owner Address" value={ownerAddress || 'Not provided'} wide />}
      </dl>
      {!readOnly && accountAccess}
    </ProfileCard>
    <div className="fd-location-card" ref={locationRef}>
      <ProfileCard title="Farm Location" icon="pin">
        <div className="fd-location-body"><div><p className="fd-location-address">{farm.address || farm.barangay || 'Address not available.'}</p>
          {hasPin && <><p className="fd-caption">{lat.toFixed(5)}, {lng.toFixed(5)}</p><a className="fd-button fd-map-link" href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer">View Larger Map <span aria-hidden="true">↗</span></a></>}
        </div><LocationPreview latitude={farm.latitude} longitude={farm.longitude} /></div>
      </ProfileCard>
    </div>
  </div>
}

function ReadingCard({ metric, title, icon, device, primary }) {
  const hasReading = !!device?.has_reading
  const online = device?.connectivity === 'Online'
  const raw = hasReading ? device[metric] : null
  const value = isReadingValue(raw) ? Number(raw) : null
  const recorded = device?.[`${metric}_status`]
  const status = primary && hasReading && value != null && CONDITIONS.has(recorded) ? recorded : null
  const unit = metric === 'ammonia' ? 'ppm estimate' : metric === 'temperature' ? '°C' : '%'
  const timestamp = value != null && device?.last_reading_at && !Number.isNaN(Date.parse(device.last_reading_at)) ? device.last_reading_at : null
  return <article className={`fd-reading fd-reading--${primary ? 'primary' : 'supporting'}`} data-metric={metric}>
    <div className="fd-reading-label"><span className="fd-metric-icon"><FarmIcon name={icon} size={20} /></span><div><h3>{title}</h3><p className="fd-reading-kind">{primary ? 'Primary indicator' : 'Supporting reading'}</p></div></div>
    <div className="fd-reading-number"><strong>{value == null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: metric === 'moisture' ? 1 : 2 })}</strong>{value != null && <span title={metric === 'ammonia' ? 'Calculated estimate; ppm calibration has not been validated.' : undefined}>{unit}</span>}</div>
    {primary && <div className="fd-reading-foot">
      {value == null ? <span className="fd-caption">No reading available</span> : status ? <>{!online && <span className="fd-caption">Last recorded condition: </span>}<FarmBadge value={status} /></> : <span className="fd-caption">Not assessed</span>}
    </div>}
    {value != null && <div className="fd-reading-time">{timestamp ? <><span>{online ? 'Recorded' : 'Last recorded'}</span><time dateTime={timestamp}>{formatDateTime(timestamp)}</time></> : <span>Timestamp unavailable</span>}</div>}
  </article>
}

export function FarmMonitoring({ farm, devices, deviceActions }) {
  const [selection, setSelection] = useState(null)
  const device = devices.find(item => String(item.id) === String(selection)) || devices[0] || null
  const reporting = devices.filter(hasCurrentPrimaryReading).length
  const condition = monitoringCondition(farm, devices)
  const coverage = farm.monitoring_assessment || assessFarmDevices(devices)
  const explanation = condition === 'Offline' ? 'Devices are offline; a current condition is unavailable.'
    : condition === 'Pending Setup' ? 'Assign a device to start monitoring.'
    : condition === 'No Readings Yet' ? 'Awaiting primary readings for the current assignment.'
    : condition === 'Incomplete Data' ? 'A complete current assessment is unavailable.'
    : coverage.incomplete_data ? 'Based on available primary readings; monitoring is incomplete.'
    : 'Based on current ammonia and manure moisture readings.'
  return <div className="fd-monitoring"><div className="fd-monitor-top">
    <ProfileCard title="Assigned Devices" icon="monitor" action={deviceActions}>
      {devices.length > 1 && <label className="fd-device-picker">Assigned device<select aria-label="Assigned device" value={device?.id || ''} onChange={event => setSelection(event.target.value)}>{devices.map(item => <option key={item.id} value={item.id}>{item.device_name}</option>)}</select></label>}
      <dl className="fd-fields"><Field label="Device" value={device?.device_name || 'No device assigned'} /><Field label="Connection" value={<FarmBadge value={device?.connectivity || 'Pending Setup'} />} /><Field label="Last synchronization" value={device?.last_seen_at ? formatDateTime(device.last_seen_at) : 'Not available'} /></dl>
    </ProfileCard>
    <ProfileCard title="Current Farm Condition" icon="check" className={`fd-condition fd-condition--${condition.toLowerCase().replaceAll(' ', '-')}`}>
      <div className="fd-condition-badges"><FarmBadge value={condition} icon={condition === 'Incomplete Data' ? 'info' : undefined} />{coverage.incomplete_data && condition !== 'Incomplete Data' && <FarmBadge value="Incomplete Data" icon="info" />}</div>
      <p>{explanation}</p><p>{reporting} of {devices.length} assigned devices reporting</p>
    </ProfileCard>
  </div></div>
}

export function FarmCompliance({ farm, onRecords }) {
  return <div className="fd-compliance">
    <CleanoutCompliance status={farm.maintenance_status} action={<button type="button" className="fd-button" onClick={() => onRecords('manure', 'cleanout')}>View Clean-out History <span aria-hidden="true">→</span></button>} />
    <ControlDocuments farm={farm} />
  </div>
}
