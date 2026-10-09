import { type Dataset, buildDataset, parseAnagrafica, parsePrezzi } from './dataset.ts'

export interface DataSources {
  anagrafica: string
  prezzi: string
}

export interface DataStoreOptions {
  sources: DataSources
  /** Ogni quanto ricontrollare se il MIMIT ha pubblicato dati nuovi. */
  refreshIntervalMs: number
  /** Timeout di ciascun download. */
  fetchTimeoutMs: number
  /** Attesa minima e massima tra un tentativo fallito e il successivo. */
  retryMinMs: number
  retryMaxMs: number
  userAgent: string
  fetch?: typeof fetch
  now?: () => number
  logger?: Pick<Console, 'info' | 'warn' | 'error'>
}

export interface DataStore {
  /**
   * Restituisce i dati in memoria. Se non ce ne sono attende il primo download;
   * se sono vecchi li restituisce subito e avvia l'aggiornamento in background.
   */
  get(): Promise<Dataset | null>
  /** Forza un controllo degli aggiornamenti (condiviso tra chiamate concorrenti). */
  refresh(): Promise<void>
  peek(): Dataset | null
}

interface Download {
  bytes: Uint8Array | null
  etag: string | null
  lastModified: string | null
}

type Validators = { etag: string | null; lastModified: string | null }

export function createDataStore(options: DataStoreOptions): DataStore {
  const fetchImpl = options.fetch ?? globalThis.fetch
  const now = options.now ?? Date.now
  const logger = options.logger ?? console

  let dataset: Dataset | null = null
  let lastCheckAt = 0
  let nextAttemptAt = 0
  let consecutiveFailures = 0
  let inflight: Promise<void> | null = null
  const validators: Record<keyof DataSources, Validators> = {
    anagrafica: { etag: null, lastModified: null },
    prezzi: { etag: null, lastModified: null },
  }

  // Il server MIMIT chiude spesso le connessioni (ECONNRESET): qualche tentativo
  // ravvicinato evita di lasciare l'API senza dati fino al prossimo ciclo di backoff.
  async function download(url: string, conditional: Validators | null): Promise<Download> {
    const attempts = 3
    for (let attempt = 1; ; attempt++) {
      try {
        return await downloadOnce(url, conditional)
      } catch (error) {
        if (attempt >= attempts) throw error
        logger.warn(`Retry ${attempt}/${attempts - 1} for ${url}: ${String(error)}`)
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
      }
    }
  }

  async function downloadOnce(url: string, conditional: Validators | null): Promise<Download> {
    const headers: Record<string, string> = { 'user-agent': options.userAgent }
    if (conditional?.etag) headers['if-none-match'] = conditional.etag
    if (conditional?.lastModified) headers['if-modified-since'] = conditional.lastModified

    const response = await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(options.fetchTimeoutMs),
    })
    const meta = {
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
    }
    if (response.status === 304) return { bytes: null, ...meta }
    if (!response.ok) throw new Error(`GET ${url} failed with HTTP ${response.status}`)
    return { bytes: new Uint8Array(await response.arrayBuffer()), ...meta }
  }

  async function load(): Promise<void> {
    const keys = ['anagrafica', 'prezzi'] as const
    const conditional = dataset !== null
    const downloads = await Promise.all(
      keys.map((key) => download(options.sources[key], conditional ? validators[key] : null)),
    )

    if (downloads.every((d) => d.bytes === null)) {
      logger.info('MIMIT data unchanged.')
      return
    }

    // Se è cambiato solo uno dei due file serve comunque anche l'altro per ricostruire i dati.
    const [anagrafica, prezzi] = await Promise.all(
      downloads.map((d, i) => (d.bytes ? d : download(options.sources[keys[i]!], null))),
    )

    const startedAt = now()
    const anagraficaTable = parseAnagrafica(anagrafica!.bytes!)
    const prezziTable = parsePrezzi(prezzi!.bytes!)
    dataset = buildDataset(anagraficaTable.records, prezziTable.records, {
      now: startedAt,
      extractionDate: prezziTable.extractionDate ?? anagraficaTable.extractionDate,
    })
    validators.anagrafica = { etag: anagrafica!.etag, lastModified: anagrafica!.lastModified }
    validators.prezzi = { etag: prezzi!.etag, lastModified: prezzi!.lastModified }

    const skipped = anagraficaTable.skippedRows + prezziTable.skippedRows
    logger.info(
      `MIMIT data loaded: ${dataset.stations.size} stations, ${dataset.fuels.size} fuel types, ` +
        `extraction ${dataset.extractionDate ?? 'n/a'}, ${skipped} malformed rows, ` +
        `${now() - startedAt} ms to parse.`,
    )
  }

  function refresh(): Promise<void> {
    inflight ??= load()
      .then(() => {
        lastCheckAt = now()
        consecutiveFailures = 0
        nextAttemptAt = 0
      })
      .catch((error: unknown) => {
        consecutiveFailures++
        const delay = Math.min(
          options.retryMinMs * 2 ** (consecutiveFailures - 1),
          options.retryMaxMs,
        )
        nextAttemptAt = now() + delay
        logger.error(
          `MIMIT data refresh failed (attempt ${consecutiveFailures}, next in ${Math.round(delay / 1000)} s):`,
          error,
        )
      })
      .finally(() => {
        inflight = null
      })
    return inflight
  }

  async function get(): Promise<Dataset | null> {
    const canAttempt = now() >= nextAttemptAt
    if (!dataset) {
      if (canAttempt || inflight) await refresh()
      return dataset
    }
    if (canAttempt && now() - lastCheckAt >= options.refreshIntervalMs) void refresh()
    return dataset
  }

  return { get, refresh, peek: () => dataset }
}
