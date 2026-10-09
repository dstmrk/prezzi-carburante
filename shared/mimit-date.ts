// Il MIMIT pubblica le date come "DD/MM/YYYY HH:MM:SS", ora locale italiana.
// Questo modulo è condiviso tra server e frontend.

const MIMIT_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/

const romeOffsetFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Rome',
  timeZoneName: 'longOffset',
})

// L'offset cambia solo ai cambi d'ora legale, quindi la cache per ora UTC resta piccola.
const offsetCache = new Map<number, number>()

function romeOffsetMs(utcMs: number): number {
  const hourKey = Math.floor(utcMs / 3_600_000)
  const cached = offsetCache.get(hourKey)
  if (cached !== undefined) return cached

  const tzName =
    romeOffsetFormatter.formatToParts(utcMs).find((part) => part.type === 'timeZoneName')?.value ??
    ''
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(tzName)
  const offset = match
    ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) * 60_000
    : 0

  if (offsetCache.size > 10_000) offsetCache.clear()
  offsetCache.set(hourKey, offset)
  return offset
}

/** Converte una data MIMIT ("DD/MM/YYYY HH:MM:SS", ora di Roma) in epoch ms. */
export function parseMimitDate(raw: string | null | undefined): number | null {
  if (typeof raw !== 'string') return null
  const match = MIMIT_DATE_RE.exec(raw.trim())
  if (!match) return null

  const [, dd, mm, yyyy, hh, mi, ss] = match.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || hh > 23 || mi > 59 || ss > 59) return null

  const wallClockAsUtc = Date.UTC(yyyy, mm - 1, dd, hh, mi, ss)
  const firstGuess = wallClockAsUtc - romeOffsetMs(wallClockAsUtc)
  // Ricalcola l'offset sull'istante stimato: corregge i casi a cavallo del cambio d'ora.
  return wallClockAsUtc - romeOffsetMs(firstGuess)
}

export const DAY_MS = 24 * 60 * 60 * 1000
