import { describe, expect, it } from 'vitest'
import { Polyline, haversineKm } from '../server/geo.ts'
import { findCheapestAlongRoute, findCheapestNear } from '../server/search.ts'
import { NOW, buildFixtureDataset, mimitDate, prezziRows } from './fixtures.ts'

const AGRIGENTO = { lat: 37.312, lon: 13.586 }

describe('haversineKm', () => {
  it('matches the known Milano–Roma distance', () => {
    expect(haversineKm({ lat: 45.4642, lon: 9.19 }, { lat: 41.9028, lon: 12.4964 })).toBeCloseTo(
      477,
      0,
    )
  })
})

describe('Polyline', () => {
  it('projects a point onto the closest segment', () => {
    const route = new Polyline(
      [
        { lat: 45, lon: 9 },
        { lat: 45, lon: 10 },
      ],
      5,
    )
    const projection = route.project({ lat: 45.01, lon: 9.5 }, 5)!
    expect(projection.distanceKm).toBeCloseTo(1.11, 1)
    expect(projection.alongKm).toBeCloseTo(route.lengthKm / 2, 0)
    expect(route.project({ lat: 45.2, lon: 9.5 }, 5)).toBeNull()
  })
})

describe('findCheapestNear', () => {
  const dataset = buildFixtureDataset()

  it('returns stations within the radius sorted by price, in the legacy shape', () => {
    const result = findCheapestNear(dataset, {
      center: AGRIGENTO,
      radiusKm: 5,
      fuel: 'benzina',
      limit: 5,
      now: NOW,
    })
    expect(result.map((s) => s.gestore)).toEqual(['Agip Eni', 'Q8'])
    expect(result[0]).toEqual({
      ranking: 1,
      gestore: 'Agip Eni',
      indirizzo: 'SS.189 KM. 64+649 S.N.C AGRIGENTO AG',
      prezzo: 1.637,
      self: true,
      data: mimitDate(0),
      distanza: expect.stringMatching(/^\d+\.\d{2}$/),
      latitudine: 37.333935,
      longitudine: 13.595533,
      id: 59183,
      nome: '19829 AGRIGENTO',
    })
  })

  it('breaks price ties by distance', () => {
    // Q8 (49195) e EOS (43200) costano entrambi 1.659: il più vicino viene prima.
    const result = findCheapestNear(dataset, {
      center: { lat: 37.35, lon: 13.84 },
      radiusKm: 50,
      fuel: 'benzina',
      limit: 5,
      now: NOW,
    })
    expect(result.map((s) => s.id)).toEqual([59183, 43200, 49195])
    expect(result.map((s) => s.ranking)).toEqual([1, 2, 3])
  })

  it('filters by maxAge before applying the limit', () => {
    const rows = [
      ...prezziRows(),
      `59183|GPL|0.7|1|${mimitDate(8)}`,
      `49195|GPL|0.8|1|${mimitDate(1)}`,
    ]
    const result = findCheapestNear(buildFixtureDataset(rows), {
      center: AGRIGENTO,
      radiusKm: 10,
      fuel: 'gpl',
      limit: 1,
      maxAgeDays: 7,
      now: NOW,
    })
    expect(result.map((s) => s.id)).toEqual([49195])
  })
})

describe('findCheapestAlongRoute', () => {
  it('returns stations in the corridor with their position along the route', () => {
    const dataset = buildFixtureDataset()
    const result = findCheapestAlongRoute(dataset, {
      points: [
        { lat: 37.33, lon: 13.5 },
        { lat: 37.33, lon: 13.9 },
      ],
      corridorKm: 3,
      fuel: 'benzina',
      limit: 10,
      now: NOW,
    })
    expect(result.map((s) => s.id)).toEqual([59183, 43200])
    expect(result[0]!.km).toBeCloseTo(8.4, 0)
    expect(Number(result[0]!.distanza)).toBeLessThan(1)
  })
})
