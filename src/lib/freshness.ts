import { DAY_MS, parseMimitDate } from '@shared/mimit-date'

/** Fino a questa età il prezzo è considerato aggiornato. */
export const FRESH_DAYS = 3
/** Oltre questa età il prezzo è considerato vecchio. */
export const STALE_DAYS = 7

export type FreshnessLevel = 'fresh' | 'aging' | 'stale' | 'unknown'

export interface Freshness {
  level: FreshnessLevel
  timestamp: number | null
  /** "oggi", "ieri", "3 giorni fa" */
  relative: string
}

export function relativeDays(days: number): string {
  const n = Math.floor(days)
  if (n <= 0) return 'oggi'
  if (n === 1) return 'ieri'
  return `${n} giorni fa`
}

/** Calendario di Roma: un prezzo delle 23:00 di ieri è "ieri" anche se sono passate 2 ore. */
function romeDayNumber(timestamp: number): number {
  const [day, month, year] = new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Rome',
  })
    .format(timestamp)
    .split('/')
    .map(Number)
  return Date.UTC(year!, month! - 1, day!) / DAY_MS
}

export function getFreshness(rawDate: string, now = Date.now()): Freshness {
  const timestamp = parseMimitDate(rawDate)
  if (timestamp === null) return { level: 'unknown', timestamp: null, relative: '' }

  const ageDays = (now - timestamp) / DAY_MS
  const level: FreshnessLevel =
    ageDays > STALE_DAYS ? 'stale' : ageDays > FRESH_DAYS ? 'aging' : 'fresh'
  return {
    level,
    timestamp,
    relative: relativeDays(romeDayNumber(now) - romeDayNumber(timestamp)),
  }
}
