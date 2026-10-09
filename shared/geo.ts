const EARTH_RADIUS_KM = 6371

export interface LatLon {
  lat: number
  lon: number
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Distanza ortodromica (haversine) in km. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}
