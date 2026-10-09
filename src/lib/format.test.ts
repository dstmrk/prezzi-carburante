import { describe, expect, it } from 'vitest'
import { formatIsoDay, formatKm, formatPrice } from './format'
import { routeLengthKm } from './route'
import { priceUnit, stationTitle } from './station'
import type { Station } from './types'

describe('format', () => {
  it('formats prices and distances the Italian way', () => {
    expect(formatPrice(1.8)).toBe('1,800')
    expect(formatKm('3.46')).toBe('3,5 km')
    expect(formatIsoDay('2026-10-08')).toBe('08/10/2026')
  })

  it('uses €/kg for gaseous fuels', () => {
    expect(priceUnit('metano')).toBe('€/kg')
    expect(priceUnit('gpl')).toBe('€/l')
  })

  it('names unbranded stations after the station name', () => {
    const base = { nome: 'STAR OIL' } as Station
    expect(stationTitle({ ...base, gestore: 'Pompe Bianche' })).toBe('STAR OIL')
    expect(stationTitle({ ...base, gestore: 'Q8' })).toBe('Q8')
  })

  it('measures route length', () => {
    expect(
      routeLengthKm([
        [45, 9],
        [45, 10],
      ]),
    ).toBeCloseTo(78.6, 0)
  })
})
