import { SAN_JOSE_BOUNDARY } from '../constants/sanJoseBoundary'

// Mirrors backend App\Services\FarmLocationService: a farm pin "occupies" the
// area within the duplicate radius, so a new/moved pin inside another farm's
// radius is a conflict. The radius itself comes from GET /admin/farms-map
// (config/farms.php) so both sides always agree; this is only the fallback
// before that response arrives.
export const DEFAULT_DUPLICATE_RADIUS_METERS = 50

export const LOCATION_CONFLICT_MESSAGE = 'This area is already marked. Please select a different location.'

const EARTH_RADIUS_METERS = 6371000

// Great-circle (haversine) distance in metres.
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Nearest farm within the radius, or null when the spot is free.
// `excludeFarmId` is the farm being edited — its own pin never counts.
export function findConflictingFarm(lat, lng, farms, { excludeFarmId = null, radiusMeters = DEFAULT_DUPLICATE_RADIUS_METERS } = {}) {
  if (lat == null || lng == null) return null

  let nearest = null
  let nearestDistance = Infinity

  for (const farm of farms || []) {
    if (farm.latitude == null || farm.longitude == null) continue
    if (excludeFarmId != null && Number(farm.id) === Number(excludeFarmId)) continue

    const d = distanceMeters(lat, lng, Number(farm.latitude), Number(farm.longitude))
    if (d <= radiusMeters && d < nearestDistance) {
      nearest = farm
      nearestDistance = d
    }
  }

  return nearest
}

// ---------------------------------------------------------------------------
// San Jose, Batangas boundary
// ---------------------------------------------------------------------------

export const LOCATION_OUTSIDE_MESSAGE = 'Location outside San Jose, Batangas. Please select a location within San Jose.'
export const BARANGAY_MISMATCH_MESSAGE = 'The selected location does not match the selected barangay. Please move the pin or select the correct barangay.'

// Ray-casting point-in-polygon. `polygon` is a closed ring of [lat, lng]
// pairs (same shape as SAN_JOSE_BOUNDARY). Points exactly on an edge count
// as inside, which is the friendlier outcome for a boundary check.
export function isPointInPolygon(lat, lng, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i]
    const [latJ, lngJ] = polygon[j]
    const crosses = (lngI > lng) !== (lngJ > lng)
      && lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI
    if (crosses) inside = !inside
  }
  return inside
}

// Mirrors FarmLocationService::isInsideSanJose on the backend (same polygon,
// see constants/sanJoseBoundary.js). The frontend uses it to refuse map
// clicks/drags outside the municipality immediately; the backend re-checks
// on save so the rule can't be bypassed.
export function isInsideSanJose(lat, lng) {
  if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) return false
  return isPointInPolygon(Number(lat), Number(lng), SAN_JOSE_BOUNDARY)
}
