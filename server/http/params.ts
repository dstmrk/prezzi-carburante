// Parsing dei parametri in ingresso. Per gli endpoint storici il parsing resta
// permissivo come prima (parseFloat accetta "45.1abc"), per non rompere i client esistenti.

export function looseFloat(value: unknown): number {
  return typeof value === 'string' ? Number.parseFloat(value) : Number.NaN
}

export function looseInt(value: unknown): number {
  return typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN
}

export function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export function isLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90
}

export function isLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180
}

/** Parametro numerico opzionale e positivo: `undefined` se assente, `null` se non valido. */
export function optionalPositive(value: unknown): number | undefined | null {
  if (value === undefined || value === '') return undefined
  const parsed = typeof value === 'number' ? value : looseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}
