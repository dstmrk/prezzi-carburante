import { MAX_PRICE_AGE_DAYS } from '../../shared/api.ts'
import { DAY_MS, parseMimitDate } from '../../shared/mimit-date.ts'
import { type CsvRecord, decodeCsv, parseCsvTable } from './csv.ts'

export interface FuelPrice {
  prezzo: number
  self: boolean
  /** Data come pubblicata dal MIMIT ("DD/MM/YYYY HH:MM:SS"). */
  data: string
  /** La stessa data in epoch ms. */
  timestamp: number
}

export interface Station {
  id: string
  gestore: string
  nome: string
  indirizzo: string
  latitudine: number
  longitudine: number
  /** Prezzo più basso (self o servito) per tipo di carburante, chiave in minuscolo. */
  prezzi: Map<string, FuelPrice>
}

export interface FuelInfo {
  nome: string
  impianti: number
}

export interface Dataset {
  stations: Map<string, Station>
  fuels: Map<string, FuelInfo>
  extractionDate: string | null
  loadedAt: number
}

export const ANAGRAFICA_HEADERS = ['idImpianto', 'Indirizzo', 'Latitudine', 'Longitudine']
export const PREZZI_HEADERS = ['idImpianto', 'descCarburante', 'prezzo', 'isSelf', 'dtComu']

// Un prezzo fuori da [0,6×, 2×] la mediana nazionale del carburante è un errore di
// inserimento (0,100 €, 1,000 €, 8,888 €...). Le soglie sono tarate sui dati reali:
// scartano circa 70 prezzi su 90.000 e nessuno plausibile.
const PLAUSIBLE_MIN_RATIO = 0.6
const PLAUSIBLE_MAX_RATIO = 2
const MIN_SAMPLES_FOR_MEDIAN = 10
// Tolleranza per orologi disallineati: un prezzo datato nel futuro oltre questa soglia è un errore.
const FUTURE_TOLERANCE_MS = DAY_MS

// Alcuni impianti hanno " | gestori.prezzibenzina.it" nel nome e nel gestore: il "|"
// è il separatore di campo, quindi lo togliamo prima del parsing.
const PREZZIBENZINA_SUFFIX_RE = /\s*\|\s*gestori\.prezzibenzina\.it/gi

export function parseAnagrafica(bytes: ArrayBuffer | Uint8Array) {
  const text = decodeCsv(bytes).replace(PREZZIBENZINA_SUFFIX_RE, '')
  return parseCsvTable(text, {
    requiredHeaders: ANAGRAFICA_HEADERS,
    overflowColumn: 'Nome Impianto',
  })
}

export function parsePrezzi(bytes: ArrayBuffer | Uint8Array) {
  return parseCsvTable(decodeCsv(bytes), { requiredHeaders: PREZZI_HEADERS })
}

function field(record: CsvRecord, names: string[]): string {
  for (const name of names) {
    const value = record[name]
    if (value) return value
  }
  return ''
}

function parseNumber(value: string): number {
  return value === '' ? Number.NaN : Number.parseFloat(value.replace(',', '.'))
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

interface PriceCandidate {
  station: Station
  fuel: string
  fuelLabel: string
  price: FuelPrice
}

export interface BuildDatasetOptions {
  now: number
  extractionDate?: string | null
}

export function buildDataset(
  anagrafica: CsvRecord[],
  prezzi: CsvRecord[],
  { now, extractionDate = null }: BuildDatasetOptions,
): Dataset {
  const stations = new Map<string, Station>()

  for (const record of anagrafica) {
    const id = field(record, ['idimpianto'])
    const latitudine = parseNumber(field(record, ['latitudine']))
    const longitudine = parseNumber(field(record, ['longitudine']))
    if (!id || !Number.isFinite(latitudine) || !Number.isFinite(longitudine)) continue

    stations.set(id, {
      id,
      gestore: field(record, ['bandiera', 'gestore', 'nome impianto']),
      nome: collapseSpaces(field(record, ['nome impianto'])),
      indirizzo: collapseSpaces(
        [field(record, ['indirizzo']), field(record, ['comune']), field(record, ['provincia'])]
          .filter(Boolean)
          .join(' '),
      ),
      latitudine,
      longitudine,
      prezzi: new Map(),
    })
  }

  const oldest = now - MAX_PRICE_AGE_DAYS * DAY_MS
  const newest = now + FUTURE_TOLERANCE_MS
  const candidates: PriceCandidate[] = []
  const samplesByFuel = new Map<string, number[]>()

  for (const record of prezzi) {
    const station = stations.get(field(record, ['idimpianto']))
    if (!station) continue

    const fuelLabel = collapseSpaces(field(record, ['desccarburante']))
    const fuel = fuelLabel.toLowerCase()
    const prezzo = parseNumber(field(record, ['prezzo']))
    if (!fuel || !Number.isFinite(prezzo) || prezzo <= 0) continue

    const data = field(record, ['dtcomu'])
    const timestamp = parseMimitDate(data)
    if (timestamp === null || timestamp < oldest || timestamp > newest) continue

    candidates.push({
      station,
      fuel,
      fuelLabel,
      price: { prezzo, self: field(record, ['isself']) === '1', data, timestamp },
    })
    let samples = samplesByFuel.get(fuel)
    if (!samples) samplesByFuel.set(fuel, (samples = []))
    samples.push(prezzo)
  }

  const plausibleRange = new Map<string, [number, number]>()
  for (const [fuel, samples] of samplesByFuel) {
    if (samples.length < MIN_SAMPLES_FOR_MEDIAN) continue
    const m = median(samples)
    plausibleRange.set(fuel, [m * PLAUSIBLE_MIN_RATIO, m * PLAUSIBLE_MAX_RATIO])
  }

  const fuelLabels = new Map<string, string>()
  for (const { station, fuel, fuelLabel, price } of candidates) {
    const range = plausibleRange.get(fuel)
    if (range && (price.prezzo < range[0] || price.prezzo > range[1])) continue

    if (!fuelLabels.has(fuel)) fuelLabels.set(fuel, fuelLabel)
    const existing = station.prezzi.get(fuel)
    if (!existing || price.prezzo < existing.prezzo) station.prezzi.set(fuel, price)
  }

  const fuels = new Map<string, FuelInfo>()
  for (const station of stations.values()) {
    for (const fuel of station.prezzi.keys()) {
      const info = fuels.get(fuel)
      if (info) info.impianti++
      else fuels.set(fuel, { nome: fuelLabels.get(fuel) ?? fuel, impianti: 1 })
    }
  }

  return { stations, fuels, extractionDate, loadedAt: now }
}
