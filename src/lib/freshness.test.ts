import { describe, expect, it } from 'vitest'
import { getFreshness, relativeDays } from './freshness'

// 9 ottobre 2026, 12:00 a Roma
const NOW = Date.UTC(2026, 9, 9, 10, 0, 0)

describe('getFreshness', () => {
  it.each([
    ['09/10/2026 08:00:00', 'fresh', 'oggi'],
    ['08/10/2026 23:30:00', 'fresh', 'ieri'],
    ['05/10/2026 08:00:00', 'aging', '4 giorni fa'],
    ['01/10/2026 08:00:00', 'stale', '8 giorni fa'],
  ])('%s → %s (%s)', (date, level, relative) => {
    expect(getFreshness(date, NOW)).toMatchObject({ level, relative })
  })

  it('handles missing dates', () => {
    expect(getFreshness('', NOW)).toEqual({ level: 'unknown', timestamp: null, relative: '' })
  })
})

describe('relativeDays', () => {
  it('uses natural Italian labels', () => {
    expect([0, 1, 2].map(relativeDays)).toEqual(['oggi', 'ieri', '2 giorni fa'])
  })
})
