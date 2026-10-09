import { haversineKm } from '@shared/geo'
import type { RoutePoint } from '@/lib/types'

export function routeLengthKm(points: RoutePoint[]): number {
  let km = 0
  for (let i = 1; i < points.length; i++) {
    const [aLat, aLon] = points[i - 1]!
    const [bLat, bLon] = points[i]!
    km += haversineKm({ lat: aLat, lon: aLon }, { lat: bLat, lon: bLon })
  }
  return km
}
