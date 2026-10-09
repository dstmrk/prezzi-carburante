import { buildDataset, parseAnagrafica, parsePrezzi } from '../server/data/dataset.ts'

export const NOW = Date.UTC(2026, 9, 9, 10, 0, 0) // 9 ottobre 2026, 12:00 a Roma

/** Data in formato MIMIT, `daysAgo` giorni prima di NOW. */
export function mimitDate(daysAgo = 0): string {
  const d = new Date(NOW - daysAgo * 24 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} 08:00:00`
}

export const ANAGRAFICA_HEADER =
  'idImpianto|Gestore|Bandiera|Tipo Impianto|Nome Impianto|Indirizzo|Comune|Provincia|Latitudine|Longitudine'
export const PREZZI_HEADER = 'idImpianto|descCarburante|prezzo|isSelf|dtComu'

export function csv(header: string, rows: string[]): Uint8Array {
  return new TextEncoder().encode(['Estrazione del 2026-10-08', header, ...rows, ''].join('\n'))
}

// Tre impianti ad Agrigento, uno a Milano.
export const anagraficaRows = [
  '59183|ENIMOOV S.P.A.|Agip Eni|Stradale|19829 AGRIGENTO|SS.189 KM. 64+649  S.N.C|AGRIGENTO|AG|37.333935|13.595533',
  '49195|EOS SERVICES S.R.L.|Q8|Stradale|AG021|VIA PETRARCA S.N. 92100|AGRIGENTO|AG|37.29823424642592|13.589792251586909',
  '43200|EOS SERVICES S.R.L.|EOS|Stradale|AG014|VIALE VITTORIA SN 92024|CANICATTÌ|AG|37.35353585537418|13.84522438049305',
  '1001|MILANO SRL|Tamoil|Stradale|MILANO 1|VIA ROMA 1|MILANO|MI|45.4642|9.19',
]

export function prezziRows(): string[] {
  const today = mimitDate(0)
  return [
    `59183|Benzina|1.742|0|${today}`,
    `59183|Benzina|1.637|1|${today}`,
    `59183|Gasolio|1.700|1|${today}`,
    `49195|Benzina|1.659|1|${today}`,
    `49195|Gasolio|1.650|1|${mimitDate(10)}`,
    `43200|Benzina|1.659|1|${today}`,
    `1001|Benzina|1.800|1|${today}`,
  ]
}

export function buildFixtureDataset(rows = prezziRows(), anagrafica = anagraficaRows) {
  const a = parseAnagrafica(csv(ANAGRAFICA_HEADER, anagrafica))
  const p = parsePrezzi(csv(PREZZI_HEADER, rows))
  return buildDataset(a.records, p.records, { now: NOW, extractionDate: p.extractionDate })
}
