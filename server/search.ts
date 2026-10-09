import type { Distributore, DistributorePercorso } from '../shared/api.ts'
import { DAY_MS } from '../shared/mimit-date.ts'
import type { Dataset, FuelPrice, Station } from './data/dataset.ts'
import { type LatLon, Polyline, boundingBox, haversineKm, inBoundingBox } from './geo.ts'

interface Match {
  station: Station
  price: FuelPrice
  distanceKm: number
}

function toDistributore({ station, price, distanceKm }: Match, index: number): Distributore {
  return {
    ranking: index + 1,
    gestore: station.gestore,
    indirizzo: station.indirizzo,
    prezzo: price.prezzo,
    self: price.self,
    data: price.data,
    distanza: distanceKm.toFixed(2),
    latitudine: station.latitudine,
    longitudine: station.longitudine,
    id: Number(station.id),
    nome: station.nome,
  }
}

/** Prezzo più economico prima, a parità di prezzo il più vicino. */
function byPriceThenDistance(a: Match, b: Match): number {
  return a.price.prezzo - b.price.prezzo || a.distanceKm - b.distanceKm
}

function minTimestamp(now: number, maxAgeDays: number | undefined): number {
  return maxAgeDays === undefined ? -Infinity : now - maxAgeDays * DAY_MS
}

export interface NearbyQuery {
  center: LatLon
  radiusKm: number
  fuel: string
  limit: number
  maxAgeDays?: number
  now: number
}

export function findCheapestNear(dataset: Dataset, query: NearbyQuery): Distributore[] {
  const box = boundingBox(query.center, query.radiusKm)
  const notBefore = minTimestamp(query.now, query.maxAgeDays)
  const matches: Match[] = []

  for (const station of dataset.stations.values()) {
    const point = { lat: station.latitudine, lon: station.longitudine }
    if (!inBoundingBox(point, box)) continue
    const price = station.prezzi.get(query.fuel)
    if (!price || price.timestamp < notBefore) continue
    const distanceKm = haversineKm(query.center, point)
    if (distanceKm > query.radiusKm) continue
    matches.push({ station, price, distanceKm })
  }

  return matches.sort(byPriceThenDistance).slice(0, query.limit).map(toDistributore)
}

export interface RouteQuery {
  points: LatLon[]
  corridorKm: number
  fuel: string
  limit: number
  maxAgeDays?: number
  now: number
}

export function findCheapestAlongRoute(
  dataset: Dataset,
  query: RouteQuery,
): DistributorePercorso[] {
  const route = new Polyline(query.points, query.corridorKm)
  const notBefore = minTimestamp(query.now, query.maxAgeDays)
  const matches: (Match & { km: number })[] = []

  for (const station of dataset.stations.values()) {
    const point = { lat: station.latitudine, lon: station.longitudine }
    if (!inBoundingBox(point, route.box)) continue
    const price = station.prezzi.get(query.fuel)
    if (!price || price.timestamp < notBefore) continue
    const projection = route.project(point, query.corridorKm)
    if (!projection) continue
    matches.push({ station, price, distanceKm: projection.distanceKm, km: projection.alongKm })
  }

  return matches
    .sort((a, b) => byPriceThenDistance(a, b) || a.km - b.km)
    .slice(0, query.limit)
    .map((match, index) => ({
      ...toDistributore(match, index),
      km: Math.round(match.km * 10) / 10,
    }))
}
