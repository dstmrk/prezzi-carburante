import { type LatLon, haversineKm } from '../shared/geo.ts'

export { type LatLon, haversineKm }

const KM_PER_DEGREE_LAT = 111.32

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export interface BoundingBox {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}

/** Rettangolo che contiene tutti i punti entro `radiusKm` da `center` (filtro grossolano). */
export function boundingBox(center: LatLon, radiusKm: number): BoundingBox {
  const latDelta = radiusKm / KM_PER_DEGREE_LAT
  const lonDelta = radiusKm / (KM_PER_DEGREE_LAT * Math.max(Math.cos(toRad(center.lat)), 0.01))
  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLon: center.lon - lonDelta,
    maxLon: center.lon + lonDelta,
  }
}

export function inBoundingBox(point: LatLon, box: BoundingBox): boolean {
  return (
    point.lat >= box.minLat &&
    point.lat <= box.maxLat &&
    point.lon >= box.minLon &&
    point.lon <= box.maxLon
  )
}

interface Segment {
  from: LatLon
  to: LatLon
  /** Progressiva in km all'inizio del segmento. */
  startKm: number
  lengthKm: number
  box: BoundingBox
}

export interface PolylineProjection {
  /** Distanza minima in km dal punto alla polilinea. */
  distanceKm: number
  /** Progressiva in km lungo la polilinea del punto più vicino. */
  alongKm: number
}

/**
 * Polilinea preparata per interrogazioni ripetute "quanto dista questo punto dal percorso".
 * Ogni segmento è proiettato su un piano locale centrato nel suo punto medio: su segmenti
 * di qualche decina di km l'errore è trascurabile rispetto ai raggi di ricerca.
 */
export class Polyline {
  readonly segments: Segment[]
  readonly lengthKm: number
  readonly box: BoundingBox

  constructor(points: LatLon[], corridorKm: number) {
    if (points.length < 2) throw new Error('A polyline needs at least two points')
    this.segments = []
    let startKm = 0
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1]!
      const to = points[i]!
      const lengthKm = haversineKm(from, to)
      const fromBox = boundingBox(from, corridorKm)
      const toBox = boundingBox(to, corridorKm)
      this.segments.push({
        from,
        to,
        startKm,
        lengthKm,
        box: {
          minLat: Math.min(fromBox.minLat, toBox.minLat),
          maxLat: Math.max(fromBox.maxLat, toBox.maxLat),
          minLon: Math.min(fromBox.minLon, toBox.minLon),
          maxLon: Math.max(fromBox.maxLon, toBox.maxLon),
        },
      })
      startKm += lengthKm
    }
    this.lengthKm = startKm
    this.box = this.segments.reduce<BoundingBox>(
      (acc, { box }) => ({
        minLat: Math.min(acc.minLat, box.minLat),
        maxLat: Math.max(acc.maxLat, box.maxLat),
        minLon: Math.min(acc.minLon, box.minLon),
        maxLon: Math.max(acc.maxLon, box.maxLon),
      }),
      { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity },
    )
  }

  /** Proietta il punto sulla polilinea, considerando solo i segmenti entro `maxDistanceKm`. */
  project(point: LatLon, maxDistanceKm: number): PolylineProjection | null {
    let best: PolylineProjection | null = null
    for (const segment of this.segments) {
      if (!inBoundingBox(point, segment.box)) continue
      const { distanceKm, fraction } = projectOnSegment(point, segment.from, segment.to)
      if (distanceKm > maxDistanceKm) continue
      if (!best || distanceKm < best.distanceKm) {
        best = { distanceKm, alongKm: segment.startKm + fraction * segment.lengthKm }
      }
    }
    return best
  }
}

function projectOnSegment(
  point: LatLon,
  from: LatLon,
  to: LatLon,
): { distanceKm: number; fraction: number } {
  const kx = KM_PER_DEGREE_LAT * Math.cos(toRad((from.lat + to.lat) / 2))
  const ky = KM_PER_DEGREE_LAT
  const dx = (to.lon - from.lon) * kx
  const dy = (to.lat - from.lat) * ky
  const px = (point.lon - from.lon) * kx
  const py = (point.lat - from.lat) * ky
  const lengthSq = dx * dx + dy * dy
  const fraction = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, (px * dx + py * dy) / lengthSq))
  return { distanceKm: Math.hypot(px - fraction * dx, py - fraction * dy), fraction }
}
