import { useEffect, useRef, useState, useMemo, useLayoutEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useIsMobile } from '../hooks/useIsMobile'
import { serviceTypeBadgeStyle } from '../utils/serviceBadgeStyle'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// The polygon now lives in constants/sanJoseBoundary.js so the location
// validation can share it; re-exported here for existing importers.
import { SAN_JOSE_CENTER, SAN_JOSE_BOUNDARY, WORLD_RING } from '../constants/sanJoseBoundary'
export { SAN_JOSE_CENTER, SAN_JOSE_BOUNDARY, WORLD_RING }

const statusColor = {
  Safe: '#2c8047',
  Warning: '#d9880f',
  Critical: '#c0392b',
  'Pending Setup': '#9ca3af',
}

const REQUEST_COLORS = {
  odor: serviceTypeBadgeStyle('Odor Control').color,
  fly: serviceTypeBadgeStyle('Fly Control').color,
  none: '#d4d8cf',
}

function requestTypeColor(type = '') {
  return /fly/i.test(type) ? REQUEST_COLORS.fly : REQUEST_COLORS.odor
}

// `service_type` is what the API actually sends (e.g. "Odor Control
// Request"); `request_type`/`type` are kept as fallbacks for any caller
// still using an older shape.
function requestTypeOf(r) {
  return r.request_type || r.type || r.service_type || ''
}

function isOdorRequest(r) {
  return /odor/i.test(requestTypeOf(r))
}

function isFlyRequest(r) {
  return /fly/i.test(requestTypeOf(r))
}

function inspectionTypeColor(type) {
  return type === 'Follow-up' ? '#d9880f' : '#2c8047'
}

function findFarm(item, farms) {
  if (item.farm_id) {
    const byId = farms.find(f => f.id === item.farm_id)
    if (byId) return byId
  }
  return farms.find(f => f.farm_name === item.farm_name)
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function criticalSensorLabel(sensor) {
  if (!sensor) return 'Critical condition'
  const value = `${sensor.value ?? '—'}${sensor.unit}`
  return sensor.type === 'Ammonia' ? `Ammonia level (${value})` : `${sensor.type} (${value})`
}

export default function FarmMap({
  farms = [], alerts = [], inspections = [], serviceRequests = [],
  onSeeAllAlerts, onSeeAllInspections, onSeeAllServiceRequests,
  variant = 'tabs', pendingRequestBreakdown = [],
}) {
  const mapRef = useRef(null)
  const containerRef = useRef(null)
  const markersRef = useRef([])
  const listRef = useRef(null)
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const isNeedsAttention = variant === 'needsAttention'
  const [tabMode, setTabMode] = useState('alerts')
  const mode = isNeedsAttention ? 'alerts' : tabMode
  const setMode = setTabMode
  // Sub-tab within the "Service Requests" main tab — Odor Control / Fly
  // Control are no longer separate top-level tabs, just a nested switch.
  const [requestSubTab, setRequestSubTab] = useState('odor')
  const [visibleCount, setVisibleCount] = useState(3)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current).setView(SAN_JOSE_CENTER, isMobile ? 12 : 13)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map)

    L.polygon([WORLD_RING, SAN_JOSE_BOUNDARY], {
      stroke: false,
      fillColor: '#7C8577',
      fillOpacity: 0.5,
      interactive: false,
    }).addTo(map)

    L.polygon(SAN_JOSE_BOUNDARY, {
      color: '#14301c',
      weight: 2.5,
      fillOpacity: 0,
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!mapRef.current) return
    const timeout = setTimeout(() => {
      mapRef.current.invalidateSize()
    }, 200)
    return () => clearTimeout(timeout)
  }, [isMobile])

  useEffect(() => {
    if (!mapRef.current) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    farms.forEach(farm => {
      if (!farm.latitude || !farm.longitude) return

      let color
      let tooltip
      let inspection
      let request

      if (mode === 'alerts') {
        color = statusColor[farm.current_status] || '#9ca3af'
        // Super Admin's map is oversight-only — the hover tooltip carries
        // more identifying detail (owner, location) since it's the only
        // way they can look up a farm on this map at all.
        tooltip = isNeedsAttention
          ? `<strong>${farm.farm_name}</strong><br/>Owner: ${farm.owner_name || '—'}<br/>Location: ${farm.barangay || '—'}<br/>Status: ${farm.current_status || 'Unknown'}`
          : `${farm.farm_name} — ${farm.current_status || 'Unknown'}`
      } else if (mode === 'inspection') {
        inspection = inspections.find(i => findFarm(i, farms)?.id === farm.id)
        color = inspection ? inspectionTypeColor(inspection.inspection_type) : '#d4d8cf'
        tooltip = inspection
          ? `${farm.farm_name} — ${inspection.inspection_type}`
          : `${farm.farm_name} — No inspection scheduled`
      } else {
        const pool = requestSubTab === 'fly' ? serviceRequests.filter(isFlyRequest) : serviceRequests.filter(isOdorRequest)
        request = pool.find(r => findFarm(r, farms)?.id === farm.id)
        const rType = request && requestTypeOf(request)
        color = request ? requestTypeColor(rType) : REQUEST_COLORS.none
        tooltip = request
          ? `${farm.farm_name} — ${rType || 'Service request'}`
          : `${farm.farm_name} — No service request`
      }

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          background:${color};
          width:16px;height:16px;border-radius:50%;
          border:2px solid white;
          box-shadow:0 1px 4px rgba(0,0,0,0.4);
        "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      })

      const marker = L.marker([farm.latitude, farm.longitude], { icon })
        .addTo(mapRef.current)
        .bindTooltip(tooltip, { direction: 'top', offset: [0, -8] })

      if (isNeedsAttention) {
        // Super Admin's map is for municipality-wide monitoring and
        // oversight only — pins are inert on click (no popup, no
        // navigation to farm details or scheduling). Identifying info is
        // hover-only, via the tooltip above.
      } else if (mode === 'alerts' && farm.current_status === 'Critical') {
        marker.on('click', () => {
          navigate(`/admin/inspections?farmId=${farm.id}`)
        })
      } else {
        const statusLine =
          mode === 'alerts'
            ? `Status: ${farm.current_status || 'Unknown'}`
            : mode === 'inspection'
              ? (inspection ? `Inspection: ${inspection.inspection_type}` : 'No inspection scheduled')
              : (request ? `Request: ${requestTypeOf(request) || 'Service request'} (${request.status || 'Pending'})` : 'No service request')
        marker.bindPopup(`<strong>${farm.farm_name}</strong><br/>${farm.owner_name}<br/>${statusLine}`)
      }

      markersRef.current.push(marker)
    })
  }, [farms, inspections, serviceRequests, mode, requestSubTab, navigate, isNeedsAttention])

  const focusFarm = (farm) => {
    if (!mapRef.current || !farm || farm.latitude == null || farm.longitude == null) return
    mapRef.current.flyTo([farm.latitude, farm.longitude], 16, { duration: 0.6 })
    const marker = markersRef.current.find(m => {
      const ll = m.getLatLng()
      return ll.lat === farm.latitude && ll.lng === farm.longitude
    })
    if (marker) marker.openPopup()
  }

  const alertItems = useMemo(
    () => [...alerts].sort((a, b) => (b.critical_count ?? 0) - (a.critical_count ?? 0)),
    [alerts]
  )

  const inspectionItems = useMemo(
    () => [...inspections].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)),
    [inspections]
  )

  const serviceRequestItems = useMemo(
    () => [...serviceRequests].sort(
      (a, b) => new Date(b.created_at || b.requested_at || 0) - new Date(a.created_at || a.requested_at || 0)
    ),
    [serviceRequests]
  )

  const odorItems = useMemo(() => serviceRequestItems.filter(isOdorRequest), [serviceRequestItems])
  const flyItems = useMemo(() => serviceRequestItems.filter(isFlyRequest), [serviceRequestItems])

  const listItems = mode === 'alerts' ? alertItems
    : mode === 'inspection' ? inspectionItems
    : requestSubTab === 'fly' ? flyItems
    : odorItems
  const visibleItems = listItems.slice(0, visibleCount)
  const hiddenCount = Math.max(0, listItems.length - visibleItems.length)

  const ITEM_HEIGHT = mode === 'alerts' ? 92 : 60
  const recomputeFit = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const fits = Math.max(1, Math.floor(el.clientHeight / ITEM_HEIGHT))
    setVisibleCount(prev => (prev === fits ? prev : fits))
  }, [ITEM_HEIGHT])

  useLayoutEffect(() => {
    recomputeFit()
    const el = listRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(recomputeFit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [recomputeFit, mode, listItems.length])

  return (
    <div style={{ ...styles.layout, ...(isMobile ? styles.layoutMobile : {}) }}>
      <div style={styles.mapCol}>
        <div ref={containerRef} style={{ height: isMobile ? '320px' : '520px', width: '100%' }} />
        <div style={{ ...styles.legend, ...(isMobile ? styles.legendMobile : {}) }}>
          <div style={styles.legendTitle}>
            {mode === 'alerts' ? 'Alert status'
              : mode === 'inspection' ? 'Inspection type'
              : requestSubTab === 'fly' ? 'Fly Control requests'
              : 'Odor Control requests'}
          </div>
          {mode === 'alerts' && (
            <>
              <LegendRow color={statusColor.Safe} label="Safe" />
              <LegendRow color={statusColor.Warning} label="Warning" />
              <LegendRow color={statusColor.Critical} label="Critical" />
              <LegendRow color={statusColor['Pending Setup']} label="Pending Setup" />
            </>
          )}
          {mode === 'inspection' && (
            <>
              <LegendRow color={inspectionTypeColor('Follow-up')} label="Follow-up Inspection" />
              <LegendRow color={inspectionTypeColor('General')} label="General Inspection" />
            </>
          )}
          {mode === 'requests' && requestSubTab === 'odor' && (
            <>
              <LegendRow color={REQUEST_COLORS.odor} label="Odor Control" />
              <LegendRow color={REQUEST_COLORS.none} label="No Request" />
            </>
          )}
          {mode === 'requests' && requestSubTab === 'fly' && (
            <>
              <LegendRow color={REQUEST_COLORS.fly} label="Fly Control" />
              <LegendRow color={REQUEST_COLORS.none} label="No Request" />
            </>
          )}
        </div>
      </div>

      <div style={{ ...styles.side, ...(isNeedsAttention ? styles.sideWide : {}), ...(isMobile ? styles.sideMobile : {}) }}>
        {isNeedsAttention ? (
          <div style={styles.naWrap}>
            <div style={styles.naTitle}>Summary</div>
            <div style={styles.naSubtitle}>View the latest farm updates and activities.</div>

            <div style={styles.naSection}>
              <div style={styles.naSectionHead}>
                <span style={styles.naSectionLabel}>Critical Alerts</span>
                <div style={styles.naHeadRight}>
                  <span style={{ ...styles.naCount, ...styles.naCountRed }}>{alertItems.length}</span>
                  {alertItems.length > 3 && (
                    <button type="button" style={styles.naViewAll} onClick={() => onSeeAllAlerts?.()}>View all →</button>
                  )}
                </div>
              </div>
              {alertItems.length === 0 ? (
                <div style={styles.empty}>No critical alerts right now.</div>
              ) : alertItems.slice(0, 3).map((f, idx, arr) => {
                const critical = (f.all_sensors || []).find(s => s.critical)
                return (
                  <div
                    key={f.farm_id ?? f.farm_name}
                    style={{ ...styles.naItem, ...(idx === arr.length - 1 ? styles.naItemLast : {}) }}
                    onClick={() => focusFarm(findFarm(f, farms))}
                  >
                    <div style={styles.naItemText}>
                      <div style={styles.naItemTitle}>{f.farm_name}</div>
                      <div style={styles.naItemSub}>{criticalSensorLabel(critical)}</div>
                    </div>
                    <span style={styles.naTimeAgo}>{timeAgo(f.reading_at)}</span>
                  </div>
                )
              })}
            </div>

            <div style={styles.naSection}>
              <div style={styles.naSectionHead}>
                <span style={styles.naSectionLabel}>Pending Service Requests</span>
                <div style={styles.naHeadRight}>
                  <span style={styles.naCount}>
                    {pendingRequestBreakdown.reduce((sum, g) => sum + (g.count || 0), 0)}
                  </span>
                  {pendingRequestBreakdown.length > 3 && (
                    <button type="button" style={styles.naViewAll} onClick={() => onSeeAllServiceRequests?.()}>View all →</button>
                  )}
                </div>
              </div>
              {pendingRequestBreakdown.length === 0 ? (
                <div style={styles.empty}>No pending service requests.</div>
              ) : pendingRequestBreakdown.slice(0, 3).map((g, idx, arr) => (
                <div key={g.label} style={{ ...styles.naItem, ...(idx === arr.length - 1 ? styles.naItemLast : {}) }}>
                  <span style={styles.naItemTitle}>{g.label}</span>
                  <span style={styles.naGroupCount}>{g.count}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
        <>
        <div style={styles.sideTabsWrap}>
          <div style={styles.sideTabs}>
            <button onClick={() => setMode('alerts')} style={{ ...styles.sideTab, ...(mode === 'alerts' ? styles.sideTabActive : {}) }}>Alerts</button>
            <button onClick={() => setMode('inspection')} style={{ ...styles.sideTab, ...(mode === 'inspection' ? styles.sideTabActive : {}) }}>Inspections</button>
            <button onClick={() => setMode('requests')} style={{ ...styles.sideTab, ...(mode === 'requests' ? styles.sideTabActive : {}) }}>Service Requests</button>
          </div>
        </div>

        {mode === 'requests' && (
          <div style={styles.subTabsWrap}>
            <div style={styles.sideTabs}>
              <button onClick={() => setRequestSubTab('odor')} style={{ ...styles.sideTab, ...(requestSubTab === 'odor' ? styles.sideTabActive : {}) }}>Odor Control</button>
              <button onClick={() => setRequestSubTab('fly')} style={{ ...styles.sideTab, ...(requestSubTab === 'fly' ? styles.sideTabActive : {}) }}>Fly Control</button>
            </div>
          </div>
        )}

        <div style={styles.sideHead}>
          <div style={styles.sideHeadLeft}>
            <span style={styles.sideTitle}>
              {mode === 'alerts' ? 'Critical Alerts'
                : mode === 'inspection' ? 'Upcoming Inspections'
                : requestSubTab === 'fly' ? 'Fly Control Requests'
                : 'Odor Control Requests'}
            </span>
          </div>
          {mode === 'alerts' && <span style={styles.countAlert}>{listItems.length}</span>}
          {mode === 'inspection' && (
            <div style={styles.countGroup}>
              <div style={styles.countPill}>
                <span style={styles.countValue}>{listItems.length}</span>
                <span style={styles.countLabel}>Total</span>
              </div>
              <div style={{ ...styles.countPill, ...styles.countPillGreen }}>
                <span style={styles.countValue}>{listItems.filter(i => i.inspection_type !== 'Follow-up').length}</span>
                <span style={styles.countLabel}>General</span>
              </div>
              <div style={{ ...styles.countPill, ...styles.countPillAmber }}>
                <span style={styles.countValue}>{listItems.filter(i => i.inspection_type === 'Follow-up').length}</span>
                <span style={styles.countLabel}>Follow-up</span>
              </div>
            </div>
          )}
          {mode === 'requests' && (
            <div style={styles.countGroup}>
              <div style={styles.countPill}>
                <span style={styles.countValue}>{listItems.length}</span>
                <span style={styles.countLabel}>Total</span>
              </div>
            </div>
          )}
        </div>

        <div ref={listRef} style={styles.sideList}>
          {visibleItems.length === 0 && (
            <div style={styles.empty}>
              {mode === 'alerts' ? 'No critical alerts right now.'
                : mode === 'inspection' ? 'No upcoming inspections.'
                : requestSubTab === 'fly' ? 'No fly control requests.'
                : 'No odor control requests.'}
            </div>
          )}

          {mode === 'alerts' && visibleItems.map(f => {
            const farm = findFarm(f, farms)
            const sensors = f.all_sensors || []
            const color = '#c0392b'
            return (
              <div key={f.farm_id ?? f.farm_name} style={styles.item} onClick={() => focusFarm(farm)}>
                <span style={{ ...styles.itemDot, backgroundColor: color }} />
                <div style={styles.itemText}>
                  <div style={styles.itemTopRow}>
                    <span style={styles.itemName}>{f.farm_name}</span>
                    <span style={{ ...styles.itemStatus, color }}>{f.critical_count} Critical</span>
                  </div>
                  <div style={styles.sensorTableRow}>
                    {sensors.map(s => (
                      <div key={s.type} style={styles.sensorCell}>
                        <span style={styles.sensorCellLabel}>{s.type}</span>
                        <span style={{ ...styles.sensorCellValue, ...(s.critical ? styles.sensorCellValueCritical : {}) }}>
                          {s.value ?? '—'}{s.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}

          {mode === 'inspection' && visibleItems.map(i => {
            const farm = findFarm(i, farms)
            const color = inspectionTypeColor(i.inspection_type)
            return (
              <div key={i.id} style={styles.item} onClick={() => focusFarm(farm)}>
                <span style={{ ...styles.itemDot, backgroundColor: color }} />
                <div style={styles.itemText}>
                  <div style={styles.itemName}>{i.farm_name}</div>
                  <div style={styles.itemSub}>{new Date(i.scheduled_at).toLocaleDateString()} · {i.inspection_type}</div>
                </div>
                <span style={{ ...styles.itemStatus, color }}>{i.inspection_type}</span>
              </div>
            )
          })}

          {mode === 'requests' && visibleItems.map(r => {
            const farm = findFarm(r, farms)
            const type = requestTypeOf(r) || 'Service request'
            const status = r.status || 'Pending'
            const color = requestTypeColor(type)
            return (
              <div key={r.id ?? r.farm_name} style={styles.item} onClick={() => focusFarm(farm)}>
                <span style={{ ...styles.itemDot, backgroundColor: color }} />
                <div style={styles.itemText}>
                  <div style={styles.itemName}>{r.farm_name}</div>
                  <div style={styles.itemSub}>{status} · {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</div>
                </div>
                <span style={{ ...styles.itemStatus, color }}>{status}</span>
              </div>
            )
          })}
        </div>

        {hiddenCount > 0 && (
          <button
            style={styles.seeAll}
            onClick={() => (
              mode === 'alerts' ? onSeeAllAlerts?.()
                : mode === 'inspection' ? onSeeAllInspections?.()
                : onSeeAllServiceRequests?.(requestSubTab)
            )}
          >
            See all ({hiddenCount} more)
          </button>
        )}
        </>
        )}
      </div>
    </div>
  )
}

function LegendRow({ color, label }) {
  return (
    <div style={styles.legendRow}>
      <span style={{ ...styles.legendDot, backgroundColor: color }} />
      {label}
    </div>
  )
}

const styles = {
  layout: { display: 'flex', gap: '16px', alignItems: 'stretch', fontFamily: "'Inter', sans-serif" },
  layoutMobile: { flexDirection: 'column' },

  mapCol: { position: 'relative', flex: 1, minWidth: 0, borderRadius: '14px', overflow: 'hidden', border: '1px solid #e7e8e0', isolation: 'isolate' },

  side: { width: '300px', flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', overflow: 'hidden' },
  sideWide: { width: '420px' },
  sideMobile: { width: '100%' },

  sideTabsWrap: { padding: '12px', borderBottom: '1px solid #eceee7' },
  // Odor Control / Fly Control sub-tabs, nested under the Service Requests
  // main tab — same tab styling, just no top padding so it sits directly
  // beneath the main tab row.
  subTabsWrap: { padding: '0 12px 12px', borderBottom: '1px solid #eceee7' },
  sideTabs: { display: 'flex', gap: '3px', background: '#f3f4ef', borderRadius: '10px', padding: '3px' },
  sideTab: { flex: 1, border: 'none', background: 'transparent', color: '#6b7770', padding: '8px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  sideTabActive: { background: '#2c8047', color: '#fff' },

  sideHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', padding: '14px 16px 10px' },
  sideHeadLeft: { minWidth: 0 },
  sideTitle: { fontSize: '13px', fontWeight: 800, color: '#16311d' },

  countAlert: { fontSize: '11px', fontWeight: 700, color: '#b91c1c', background: '#fbeaea', padding: '3px 9px', borderRadius: '999px', flexShrink: 0 },
  countGroup: { display: 'flex', gap: '6px', flexShrink: 0 },
  countPill: { display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#f3f4ef', borderRadius: '8px', padding: '3px 9px', minWidth: '40px' },
  countPillAmber: { backgroundColor: '#fbf1e2' },
  countPillGreen: { backgroundColor: '#eaf3ec' },
  countPillPurple: { backgroundColor: '#f3ecfd' },
  countValue: { fontSize: '14px', fontWeight: 800, color: '#16311d', lineHeight: 1.1 },
  countLabel: { fontSize: '8px', fontWeight: 700, color: '#8a968d', textTransform: 'uppercase' },

  sideList: { overflowY: 'auto', padding: '0 8px', flex: 1, minHeight: 0 },
  empty: { padding: '18px 8px', textAlign: 'center', fontSize: '12.5px', color: '#9aa79d' },
  item: { display: 'flex', alignItems: 'flex-start', gap: '11px', padding: '11px 8px', borderRadius: '9px', cursor: 'pointer' },
  itemTopRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' },
  itemDot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, marginTop: '3px' },
  itemText: { minWidth: 0, flex: 1 },
  itemName: { fontSize: '13px', fontWeight: 700, color: '#16311d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  itemSub: { fontSize: '11px', color: '#8a968d', marginTop: '1px' },
  itemStatus: { fontSize: '10.5px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 },

  sensorTableRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginTop: '6px' },
  sensorCell: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start' },
  sensorCellLabel: { fontSize: '9px', fontWeight: 700, color: '#9aa79d', textTransform: 'uppercase', letterSpacing: '0.02em' },
  sensorCellValue: { fontSize: '11px', fontWeight: 700, color: '#4b5a50', marginTop: '1px' },
  sensorCellValueCritical: { color: '#c0392b' },

  seeAll: { border: 'none', borderTop: '1px solid #eceee7', background: 'transparent', color: '#2c8047', fontSize: '12px', fontWeight: 700, padding: '12px', cursor: 'pointer', fontFamily: 'inherit' },

  // "Summary" variant — plain white cards with subtle borders, no colored blocks or icons.
  naWrap: { display: 'flex', flexDirection: 'column', overflowY: 'auto', flex: 1, minHeight: 0, padding: '22px 24px' },
  naTitle: { fontSize: '19px', fontWeight: 800, color: '#16311d' },
  naSubtitle: { fontSize: '12.5px', color: '#8a968d', marginTop: '4px', marginBottom: '18px' },

  naSection: { border: '1px solid #eceee7', borderRadius: '12px', padding: '16px 20px', marginBottom: '16px' },
  naSectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eceee7', paddingBottom: '10px', marginBottom: '4px' },
  naSectionLabel: { fontSize: '13.5px', fontWeight: 700, color: '#16311d' },
  naHeadRight: { display: 'flex', alignItems: 'center', gap: '12px' },
  naCount: { fontSize: '13.5px', fontWeight: 800, color: '#16311d' },
  naCountRed: { color: '#c0392b' },
  naViewAll: { border: 'none', background: 'none', padding: 0, color: '#2c8047', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },

  naItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', padding: '10px 0', borderBottom: '1px solid #f2f3ed', cursor: 'pointer' },
  naItemLast: { borderBottom: 'none', paddingBottom: 0 },
  naItemText: { minWidth: 0 },
  naItemTitle: { fontSize: '13px', fontWeight: 500, color: '#16311d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  naItemSub: { fontSize: '11.5px', color: '#8a968d', marginTop: '2px' },
  naTimeAgo: { fontSize: '11.5px', color: '#8a968d', whiteSpace: 'nowrap', flexShrink: 0 },
  naGroupCount: { fontSize: '13px', fontWeight: 700, color: '#16311d' },

  legend: { position: 'absolute', left: '14px', bottom: '14px', zIndex: 1001, background: '#fff', border: '1px solid #e7e8e0', borderRadius: '12px', padding: '11px 13px', boxShadow: '0 4px 14px rgba(20,48,28,0.14)', minWidth: '150px' },
  legendMobile: { padding: '9px 11px', minWidth: '120px' },
  legendTitle: { fontSize: '9.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a968d', marginBottom: '8px' },
  legendRow: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#33413a', marginBottom: '5px' },
  legendDot: { width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0 },
}