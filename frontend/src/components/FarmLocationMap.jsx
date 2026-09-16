import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '../api/axios'
import { SAN_JOSE_BOUNDARY, SAN_JOSE_CENTER } from '../constants/sanJoseBoundary'
import {
  DEFAULT_DUPLICATE_RADIUS_METERS,
  LOCATION_CONFLICT_MESSAGE,
  LOCATION_OUTSIDE_MESSAGE,
  findConflictingFarm,
  isInsideSanJose,
} from '../utils/farmLocation'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const EXISTING_MARKER_STYLE = { radius: 7, color: '#ffffff', weight: 2, fillColor: '#6b7770', fillOpacity: 0.95 }
const OCCUPIED_ZONE_STYLE = { color: '#b91c1c', weight: 1, opacity: 0.35, fillColor: '#b91c1c', fillOpacity: 0.08, interactive: false }
const BOUNDARY_STYLE = { color: '#2c8047', weight: 2, opacity: 0.7, dashArray: '6 4', fill: false, interactive: false }

const CHECK_DEBOUNCE_MS = 400

/**
 * Location Preview used by farm registration and farm editing.
 *
 * - Shows the current/new farm as the draggable blue pin (map click also
 *   moves it, as before).
 * - Shows every other registered farm as a grey dot with its occupied radius,
 *   loaded from GET /admin/farms-map.
 * - Refuses to put the pin outside San Jose, Batangas (dashed green outline):
 *   a click outside is ignored and a drag outside snaps back to where the
 *   pin was, with LOCATION_OUTSIDE_MESSAGE shown.
 * - Whenever the pin lands (drag, click, or a geocode result pushed in via
 *   the ref), checks it against the existing farms and reports the result
 *   through onConflictChange(farm | null) so the parent can block saving.
 * - When a `barangay` is given, asks POST /admin/farms/check-location
 *   (debounced) for the server's verdict on the pin + barangay pair — the
 *   same rules the server enforces on save — and reports it through
 *   onValidityChange({ status, ok, message, detected_barangay }). `ok`
 *   false means Save must stay blocked. Verdicts: outside, mismatch,
 *   conflict, invalid_barangay (blocking); verified, unverified (allowed;
 *   "unverified" = the map data can't confirm the barangay, so the user is
 *   asked to double-check). `checking` is reported while a request is in
 *   flight, `error` when the request itself failed (allowed — the server
 *   re-checks on save anyway).
 *   The check is skipped while the pin AND barangay are still exactly the
 *   farm's stored values (initialPosition / initialBarangay), mirroring the
 *   server, which only re-validates a location that is actually changing —
 *   so editing other fields of a farm registered before these rules existed
 *   isn't blocked by its old pin.
 *
 * Geocoding stays with the caller; it drives the map through the ref:
 *   ref.current.setPosition(lat, lng)  — move/create the pin; returns false
 *                                        (and leaves the pin alone) when the
 *                                        point is outside San Jose
 *   ref.current.flyTo(lat, lng, zoom)  — pan the view
 */
const FarmLocationMap = forwardRef(function FarmLocationMap(
  {
    initialPosition,
    initialBarangay = null,
    barangay = null,
    excludeFarmId = null,
    onPositionChange,
    onConflictChange,
    onValidityChange,
    style,
  },
  ref,
) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const existingLayerRef = useRef(null)
  const checkTimerRef = useRef(null)
  const checkSeqRef = useRef(0)

  const [position, setPosition] = useState(initialPosition ?? null)
  const [existingFarms, setExistingFarms] = useState([])
  const [radiusMeters, setRadiusMeters] = useState(DEFAULT_DUPLICATE_RADIUS_METERS)
  const [conflict, setConflict] = useState(null)
  const [outsideAttempt, setOutsideAttempt] = useState(false)
  const [verdict, setVerdict] = useState(null)

  const onPositionChangeRef = useRef(onPositionChange)
  const onConflictChangeRef = useRef(onConflictChange)
  const onValidityChangeRef = useRef(onValidityChange)
  onPositionChangeRef.current = onPositionChange
  onConflictChangeRef.current = onConflictChange
  onValidityChangeRef.current = onValidityChange

  const addOrMoveMarker = (lat, lng) => {
    if (!mapRef.current) return
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng])
    } else {
      const marker = L.marker([lat, lng], { draggable: true, zIndexOffset: 1000 }).addTo(mapRef.current)
      let dragOrigin = null
      marker.on('dragstart', () => {
        dragOrigin = marker.getLatLng()
      })
      marker.on('dragend', () => {
        const pos = marker.getLatLng()
        if (!isInsideSanJose(pos.lat, pos.lng)) {
          // Snap back to where the drag started — that spot was valid.
          if (dragOrigin) marker.setLatLng(dragOrigin)
          setOutsideAttempt(true)
          return
        }
        setOutsideAttempt(false)
        setPosition({ lat: pos.lat, lng: pos.lng })
        onPositionChangeRef.current?.(pos.lat, pos.lng)
      })
      markerRef.current = marker
    }
  }

  useImperativeHandle(ref, () => ({
    setPosition(lat, lng) {
      if (!isInsideSanJose(lat, lng)) {
        setOutsideAttempt(true)
        return false
      }
      setOutsideAttempt(false)
      addOrMoveMarker(lat, lng)
      setPosition({ lat, lng })
      return true
    },
    flyTo(lat, lng, zoom = 16) {
      mapRef.current?.flyTo([lat, lng], zoom, { duration: 0.6 })
    },
  }))

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const hasInitial = initialPosition?.lat != null && initialPosition?.lng != null
    const center = hasInitial ? [initialPosition.lat, initialPosition.lng] : SAN_JOSE_CENTER

    const map = L.map(containerRef.current).setView(center, hasInitial ? 16 : 13)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map)

    // Municipal boundary — the area a pin may be placed in.
    L.polygon(SAN_JOSE_BOUNDARY, BOUNDARY_STYLE).addTo(map)

    existingLayerRef.current = L.layerGroup().addTo(map)

    map.on('click', (e) => {
      if (!isInsideSanJose(e.latlng.lat, e.latlng.lng)) {
        setOutsideAttempt(true)
        return
      }
      setOutsideAttempt(false)
      addOrMoveMarker(e.latlng.lat, e.latlng.lng)
      setPosition({ lat: e.latlng.lat, lng: e.latlng.lng })
      onPositionChangeRef.current?.(e.latlng.lat, e.latlng.lng)
    })

    mapRef.current = map

    if (hasInitial) addOrMoveMarker(initialPosition.lat, initialPosition.lng)

    setTimeout(() => map.invalidateSize(), 200)

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
      existingLayerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Existing registered farms — every pin except the one being edited.
  useEffect(() => {
    let cancelled = false
    api.get('/admin/farms-map')
      .then(res => {
        if (cancelled) return
        const farms = (res.data?.data || []).filter(f => excludeFarmId == null || Number(f.id) !== Number(excludeFarmId))
        setExistingFarms(farms)
        if (res.data?.duplicate_radius_meters) setRadiusMeters(Number(res.data.duplicate_radius_meters))
      })
      .catch(() => { /* preview still works without the overlay; the server re-checks on save */ })
    return () => { cancelled = true }
  }, [excludeFarmId])

  useEffect(() => {
    const layer = existingLayerRef.current
    if (!layer) return
    layer.clearLayers()
    existingFarms.forEach(f => {
      const latlng = [Number(f.latitude), Number(f.longitude)]
      L.circle(latlng, { ...OCCUPIED_ZONE_STYLE, radius: radiusMeters }).addTo(layer)
      L.circleMarker(latlng, EXISTING_MARKER_STYLE)
        .bindTooltip(`${f.farm_name}${f.owner_name ? ` — ${f.owner_name}` : ''}`, { direction: 'top', offset: [0, -8] })
        .addTo(layer)
    })
  }, [existingFarms, radiusMeters])

  // Re-check on every pin move and again once the existing farms arrive.
  useEffect(() => {
    const next = position
      ? findConflictingFarm(position.lat, position.lng, existingFarms, { excludeFarmId, radiusMeters })
      : null
    setConflict(next)
    onConflictChangeRef.current?.(next)
  }, [position, existingFarms, excludeFarmId, radiusMeters])

  // Server verdict on the pin + barangay pair (see the header comment).
  useEffect(() => {
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current)

    const report = (v) => {
      setVerdict(v)
      onValidityChangeRef.current?.(v)
    }

    if (!position || !barangay) {
      report(null)
      return undefined
    }

    const unchanged = initialPosition?.lat != null && initialPosition?.lng != null
      && initialBarangay != null
      && Math.abs(Number(initialPosition.lat) - position.lat) < 1e-7
      && Math.abs(Number(initialPosition.lng) - position.lng) < 1e-7
      && initialBarangay === barangay
    if (unchanged) {
      report(null)
      return undefined
    }

    const seq = ++checkSeqRef.current
    report({ status: 'checking', ok: false, message: 'Verifying the location… please wait a moment.' })

    checkTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.post('/admin/farms/check-location', {
          latitude: position.lat,
          longitude: position.lng,
          barangay,
          exclude_farm_id: excludeFarmId ?? undefined,
        })
        if (seq !== checkSeqRef.current) return
        report(res.data?.data || { status: 'error', ok: true, message: '' })
      } catch (err) {
        if (seq !== checkSeqRef.current) return
        const msg = err.response?.data?.message
        if (err.response?.status === 422 && msg) {
          report({ status: 'invalid_barangay', ok: false, message: msg })
        } else {
          report({
            status: 'error',
            ok: true,
            message: 'Could not verify the location right now — it will be checked again when you save.',
          })
        }
      }
    }, CHECK_DEBOUNCE_MS)

    return () => { if (checkTimerRef.current) clearTimeout(checkTimerRef.current) }
    // initialPosition / initialBarangay are the farm's stored values and don't change while mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, barangay, excludeFarmId])

  // What to show under the map, strongest problem first. The one-farm-per-area
  // conflict keeps its own box (below) exactly as before.
  const blocking = outsideAttempt || (verdict && !verdict.ok && verdict.status !== 'checking' && verdict.status !== 'conflict')
  const statusLine = (() => {
    if (outsideAttempt) return { tone: 'error', text: LOCATION_OUTSIDE_MESSAGE }
    if (!verdict || verdict.status === 'conflict') return null
    if (verdict.status === 'checking') return { tone: 'muted', text: verdict.message }
    if (verdict.status === 'verified') return { tone: 'ok', text: `✓ ${verdict.message}` }
    if (verdict.status === 'unverified' || verdict.status === 'error') return { tone: 'warn', text: verdict.message }
    const detail = verdict.status === 'mismatch' && verdict.detected_barangay
      ? ` The pin appears to be in Brgy. ${verdict.detected_barangay}.`
      : ''
    return { tone: 'error', text: `${verdict.message}${detail}` }
  })()

  return (
    <div>
      <div
        ref={containerRef}
        style={{ ...mapStyles.container, ...(conflict || blocking ? mapStyles.containerConflict : {}), ...style }}
      />
      <p style={mapStyles.hint}>
        The location is automatically detected from the farm address. Drag the marker to adjust the location if needed.
        Grey dots are existing registered farms. The pin must stay inside the dashed San Jose boundary.
      </p>
      {statusLine && (
        <div style={{ ...mapStyles.status, ...mapStyles[`status_${statusLine.tone}`] }}>{statusLine.text}</div>
      )}
      {conflict && (
        <div style={mapStyles.conflict}>{LOCATION_CONFLICT_MESSAGE}</div>
      )}
    </div>
  )
})

const mapStyles = {
  container: { height: '260px', width: '100%', borderRadius: '10px', border: '1px solid #dcdfd6', overflow: 'hidden' },
  containerConflict: { border: '2px solid #b91c1c' },
  hint: { fontSize: '11.5px', color: '#9aa79d', margin: '8px 0 0', lineHeight: '1.4' },
  conflict: { fontSize: '12.5px', color: '#b91c1c', fontWeight: 600, backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 12px', marginTop: '8px' },
  status: { fontSize: '12.5px', fontWeight: 600, borderRadius: '8px', padding: '8px 12px', marginTop: '8px', lineHeight: '1.4' },
  status_error: { color: '#b91c1c', backgroundColor: '#fef2f2', border: '1px solid #fecaca' },
  status_warn: { color: '#92400e', backgroundColor: '#fffbeb', border: '1px solid #fde68a' },
  status_ok: { color: '#2c8047', backgroundColor: '#f0f7f2', border: '1px solid #cfe5d6' },
  status_muted: { color: '#6b7770', backgroundColor: '#f6f7f4', border: '1px solid #e7e8e0', fontWeight: 500 },
}

export default FarmLocationMap
