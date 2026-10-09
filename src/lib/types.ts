import type { Distributore, DistributorePercorso } from '@shared/api'

export type SearchMode = 'vicino' | 'percorso'

export interface Filters {
  fuel: string
  radiusKm: number
  corridorKm: number
  maxAgeDays: number
  results: number
}

export const DEFAULT_FILTERS: Filters = {
  fuel: 'benzina',
  radiusKm: 5,
  corridorKm: 2,
  maxAgeDays: 7,
  results: 15,
}

export interface SearchCenter {
  lat: number
  lon: number
  label: string
}

/** [latitudine, longitudine] */
export type RoutePoint = [number, number]

export type Station = Distributore | DistributorePercorso

export function isRouteStation(station: Station): station is DistributorePercorso {
  return 'km' in station
}
