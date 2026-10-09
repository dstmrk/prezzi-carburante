import path from 'node:path'

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${name}: ${raw}`)
  return value
}

const MINUTE = 60_000

export const config = {
  port: intFromEnv('PORT', 8888),
  /** Cartella con la build del frontend (output di `vite build`). */
  staticDir: path.resolve(import.meta.dirname, '../dist'),
  sources: {
    anagrafica:
      process.env.MIMIT_ANAGRAFICA_URL ??
      'https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv',
    prezzi:
      process.env.MIMIT_PREZZI_URL ?? 'https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv',
  },
  // I file vengono pubblicati una volta al giorno (di solito verso le 8:45); il controllo
  // orario usa ETag/If-Modified-Since, quindi costa una risposta 304 quando non cambia nulla.
  refreshIntervalMs: intFromEnv('DATA_REFRESH_MINUTES', 60) * MINUTE,
  fetchTimeoutMs: 60_000,
  retryMinMs: 30_000,
  retryMaxMs: 30 * MINUTE,
  userAgent: 'prezzi-carburante (+https://github.com/dstmrk/prezzi-carburante)',
}
