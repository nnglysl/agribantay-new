import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useIsMobile } from '../hooks/useIsMobile'
import { SAN_JOSE_CENTER, SAN_JOSE_BOUNDARY, WORLD_RING } from './FarmMap'
import { serviceTypeBadgeStyle } from '../utils/serviceBadgeStyle'

const DEFAULT_COLOR = '#d4d8cf' // same "no request" neutral used on the Admin Farm Map
const requestTypeColor = (type) => serviceTypeBadgeStyle(type).color

/**
 * Every registered farm (from `farms`) always gets a pin — that's the
 * "show all farm locations" base layer. A farm additionally gets its
 * scheduled request's designated color (Teal for Blood Test, Indigo for
 * Vaccination) only when that request matches `activeTab`, so switching
 * tabs re-colors the map instead of always showing both at once.
 *
 * `focusFarm` is exposed via ref so the dashboard's request list (a sibling
 * component, not a child, unlike Admin's combined FarmMap) can drive the
 * same pan/zoom/highlight interaction Admin's Alerts/Inspections/Service
 * Requests already use — same pattern, just called across a ref instead of
 * a local function, since the map and the list live in separate components
 * here.
 */
const VetScheduleMap = forwardRef(function VetScheduleMap({ farms = [], requests = [], activeTab }, ref) {
  const mapRef = useRef(null)
  const containerRef = useRef(null)
  const markersRef = useRef([])
  const isMobile = useIsMobile()
  const [selectedFarmId, setSelectedFarmId] = useState(null)

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
      color: '#1B4332',
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
      if (farm.latitude == null || farm.longitude == null) return

      const request = activeTab
        ? requests.find(r => r.farm_id === farm.id && (r.service_type || '').replace(' Request', '') === activeTab)
        : null
      const isSelected = selectedFarmId === farm.id
      const color = request ? requestTypeColor(request.service_type) : DEFAULT_COLOR
      const size = isSelected ? 22 : 16

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          background:${color};
          width:${size}px;height:${size}px;border-radius:50%;
          border:${isSelected ? 3 : 2}px solid white;
          box-shadow:0 1px ${isSelected ? 8 : 4}px rgba(0,0,0,${isSelected ? 0.5 : 0.4});
        "></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      })

      const popupLines = [`<strong>${farm.farm_name}</strong>`, farm.barangay || '']
      if (request) {
        popupLines.push(request.service_type)
        popupLines.push(request.status || 'Scheduled')
        if (request.scheduled_at) popupLines.push(new Date(request.scheduled_at).toLocaleDateString())
      }

      const marker = L.marker([farm.latitude, farm.longitude], { icon })
        .addTo(mapRef.current)
        .bindTooltip(request ? `${farm.farm_name} — ${request.service_type}` : farm.farm_name, { direction: 'top', offset: [0, -8] })
        .bindPopup(popupLines.filter(Boolean).join('<br/>'))

      marker.__farmId = farm.id
      markersRef.current.push(marker)
    })
  }, [farms, requests, activeTab, selectedFarmId])

  const focusFarm = (farm) => {
    if (!mapRef.current || !farm || farm.latitude == null || farm.longitude == null) return
    setSelectedFarmId(farm.id)
    mapRef.current.flyTo([farm.latitude, farm.longitude], 16, { duration: 0.6 })
    const marker = markersRef.current.find(m => m.__farmId === farm.id)
    if (marker) marker.openPopup()
  }

  useImperativeHandle(ref, () => ({ focusFarm }))

  return (
    <div style={styles.wrap}>
      <div ref={containerRef} style={{ height: isMobile ? '300px' : '520px', width: '100%' }} />

      <div style={{ ...styles.legend, ...(isMobile ? styles.legendMobile : {}) }}>
        <div style={styles.legendTitle}>Request type</div>
        <LegendRow color={requestTypeColor('Vaccine Request')} label="Vaccination" />
        <LegendRow color={requestTypeColor('Blood Test Request')} label="Blood Test" />
        <LegendRow color={DEFAULT_COLOR} label="No selected-type request" />
      </div>
    </div>
  )
})

export default VetScheduleMap

function LegendRow({ color, label }) {
  return (
    <div style={styles.legendRow}>
      <span style={{ ...styles.legendDot, backgroundColor: color }} />
      {label}
    </div>
  )
}

const styles = {
  wrap: { position: 'relative', borderRadius: '12px', overflow: 'hidden', isolation: 'isolate' },

  legend: {
    position: 'absolute', left: '14px', bottom: '14px', zIndex: 1001,
    background: 'rgba(255,255,255,0.96)', borderRadius: '12px', padding: '10px 12px',
    boxShadow: '0 4px 14px rgba(0,0,0,0.18)', border: '1px solid #E8E2D3', minWidth: '120px',
  },
  legendMobile: { padding: '8px 10px', minWidth: '100px' },
  legendTitle: {
    fontSize: '9.5px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.4px',
    color: '#6b7280', marginBottom: '6px',
  },
  legendRow: { display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11.5px', color: '#374151', marginBottom: '4px' },
  legendDot: { width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0 },
}
