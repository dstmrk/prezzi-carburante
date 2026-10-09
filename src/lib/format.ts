const priceFormatter = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
})

const kmFormatter = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 })

const dateFormatter = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Rome',
})

const dateTimeFormatter = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Rome',
})

/** 1.639 → "1,639" */
export function formatPrice(value: number): string {
  return priceFormatter.format(value)
}

/** 3.456 → "3,5 km" */
export function formatKm(value: number | string): string {
  return `${kmFormatter.format(Number(value))} km`
}

export function formatDate(timestamp: number): string {
  return dateFormatter.format(timestamp)
}

export function formatDateTime(timestamp: number): string {
  return dateTimeFormatter.format(timestamp)
}

/** "2026-10-08" → "08/10/2026" */
export function formatIsoDay(isoDay: string): string {
  const [year, month, day] = isoDay.split('-')
  return year && month && day ? `${day}/${month}/${year}` : isoDay
}
