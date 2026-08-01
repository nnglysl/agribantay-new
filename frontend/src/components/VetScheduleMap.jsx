import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useIsMobile } from '../hooks/useIsMobile'
import { SAN_JOSE_CENTER, SAN_JOSE_BOUNDARY, WORLD_RING } from './FarmMap'

const requestTypeColor = (type) => (type === 'Blood Test Request' ? '#3b82f6' : '#2E7D32')

export default function VetScheduleMap({ requests = [] }) {
  const mapRef = useRef(null)
  const containerRef = useRef(null)
  const markersRef = useRef([])
  const isMobile = useIsMobile()

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

    requests.forEach(r => {
      const color = requestTypeColor(r.service_type)

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

      const marker = L.marker([r.latitude, r.longitude], { icon })
        .addTo(mapRef.current)
        .bindTooltip(`${r.farm_name} — ${r.service_type}`, { direction: 'top', offset: [0, -8] })
        .bindPopup(`
          <strong>${r.farm_name}</strong><br/>
          ${r.owner_name}<br/>
          ${r.service_type}<br/>
          ${r.scheduled_at ? new Date(r.scheduled_at).toLocaleDateString() : ''}
        `)

      markersRef.current.push(marker)
    })
  }, [requests])

  return (
    <div style={styles.wrap}>
      <div ref={containerRef} style={{ height: isMobile ? '300px' : '520px', width: '100%' }} />

      <div style={{ ...styles.legend, ...(isMobile ? styles.legendMobile : {}) }}>
        <div style={styles.legendTitle}>Request type</div>
        <LegendRow color={requestTypeColor('Vaccine Request')} label="Vaccine" />
        <LegendRow color={requestTypeColor('Blood Test Request')} label="Blood Test" />
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