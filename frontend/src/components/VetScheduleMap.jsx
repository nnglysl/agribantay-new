import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useIsMobile } from '../hooks/useIsMobile'
import { SAN_JOSE_CENTER, SAN_JOSE_BOUNDARY, WORLD_RING } from './FarmMap'

// Same accent colors already used elsewhere on the vet dashboard — green
// for Vaccine (brand color, matches the stat cards), blue for Blood Test
// (matches the existing "Scheduled" badge color in Today's Schedule) —
// rather than reusing Admin's Follow-up/General clay-gold pair, which
// encodes a different distinction and would be confusing here.
const requestTypeColor = (type) => (type === 'Blood Test Request' ? '#3b82f6' : '#2E7D32')

export default function VetScheduleMap({ requests = [] }) {
  const mapRef = useRef(null)
  const containerRef = useRef(null)
  const markersRef = useRef([])
  const isMobile = useIsMobile()
  const [selected, setSelected] = useState(null)

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

      marker.on('click', () => setSelected(r))

      markersRef.current.push(marker)
    })
  }, [requests])

  const focusRequest = (r) => {
    if (!mapRef.current) return
    mapRef.current.flyTo([r.latitude, r.longitude], 16, { duration: 0.6 })
    const marker = markersRef.current.find(m => {
      const ll = m.getLatLng()
      return ll.lat === r.latitude && ll.lng === r.longitude
    })
    if (marker) marker.openPopup()
    setSelected(r)
  }

  const visibleItems = requests.slice(0, 3)

  return (
    <div style={styles.wrap}>
      <div ref={containerRef} style={{ height: isMobile ? '300px' : '420px', width: '100%' }} />

      <div style={{ ...styles.panel, ...(isMobile ? styles.panelMobile : {}) }}>
        <div style={styles.panelHead}>
          <span style={styles.panelTitle}>Scheduled visits</span>
          <span style={styles.panelCount}>{requests.length}</span>
        </div>

        <div style={styles.panelList}>
          {visibleItems.length === 0 && (
            <div style={styles.empty}>No scheduled visits right now.</div>
          )}

          {visibleItems.map(r => {
            const color = requestTypeColor(r.service_type)
            const active = selected?.id === r.id
            return (
              <div
                key={r.id}
                style={{ ...styles.item, ...(active ? styles.itemActive : {}) }}
                onClick={() => focusRequest(r)}
              >
                <span style={{ ...styles.itemDot, backgroundColor: color }} />
                <div style={styles.itemText}>
                  <div style={styles.itemName}>{r.farm_name}</div>
                  <div style={styles.itemSub}>
                    {r.scheduled_at ? new Date(r.scheduled_at).toLocaleDateString() : '—'}
                  </div>
                </div>
                <span style={{ ...styles.itemStatus, color }}>
                  {r.service_type.replace(' Request', '')}
                </span>
              </div>
            )
          })}
        </div>

        {requests.length > visibleItems.length && (
          <div style={styles.moreHint}>+{requests.length - visibleItems.length} more on the map</div>
        )}
      </div>

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

  panel: {
    position: 'absolute', right: '14px', top: '14px', zIndex: 1001,
    width: '230px', maxHeight: 'calc(100% - 28px)',
    background: 'rgba(24,46,34,0.7)',
    backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.18)', borderRadius: '14px',
    boxShadow: '0 10px 28px rgba(0,0,0,0.28)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  panelMobile: { width: '170px', top: '10px', maxHeight: 'calc(100% - 20px)' },

  panelHead: {
    padding: '12px 14px 9px', borderBottom: '1px solid rgba(255,255,255,0.14)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, gap: '8px',
  },
  panelTitle: { fontSize: '12px', fontWeight: '800', color: '#fff' },
  panelCount: {
    fontSize: '10.5px', fontWeight: '700', color: '#234A35', background: '#E8C766',
    padding: '2px 8px', borderRadius: '999px', flexShrink: 0,
  },

  panelList: { overflowY: 'auto', padding: '8px' },
  empty: { padding: '14px 8px', textAlign: 'center', fontSize: '11.5px', color: 'rgba(255,255,255,0.6)' },

  item: {
    display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 8px',
    borderRadius: '9px', cursor: 'pointer', marginBottom: '2px',
  },
  itemActive: { backgroundColor: 'rgba(255,255,255,0.1)' },
  itemDot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, boxShadow: '0 0 0 2px rgba(255,255,255,0.25)' },
  itemText: { minWidth: 0, flex: 1 },
  itemName: {
    fontSize: '12px', fontWeight: '700', color: '#fff',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  itemSub: { fontSize: '10px', color: 'rgba(255,255,255,0.6)', marginTop: '1px' },
  itemStatus: { fontSize: '9.5px', fontWeight: '700', whiteSpace: 'nowrap', flexShrink: 0 },

  moreHint: {
    flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.14)',
    color: 'rgba(255,255,255,0.6)', fontSize: '11px', padding: '9px 10px', textAlign: 'center',
  },

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