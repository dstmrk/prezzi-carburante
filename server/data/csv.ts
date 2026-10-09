// Parser per i CSV del MIMIT: separatore "|", nessun quoting, una riga di
// intestazione preceduta da "Estrazione del YYYY-MM-DD".
//
// Non usiamo un parser CSV generico perché il formato MIMIT non è CSV standard:
// le virgolette nei nomi non sono mai bilanciate (es. `"MEGA SERVICE S.A.S.|Q8|...`)
// e un parser con quoting le interpreta come campi multiriga, fondendo impianti diversi.

const utf8Decoder = new TextDecoder('utf-8', { fatal: true })
const latin1Decoder = new TextDecoder('windows-1252')

/** Decodifica il CSV: UTF-8 se valido, altrimenti Windows-1252 (formato storico MIMIT). */
export function decodeCsv(bytes: ArrayBuffer | Uint8Array): string {
  let text: string
  try {
    text = utf8Decoder.decode(bytes)
  } catch {
    text = latin1Decoder.decode(bytes)
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

export function normalizeHeader(value: string | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

export type CsvRecord = Record<string, string>

export interface CsvTable {
  records: CsvRecord[]
  /** Data dichiarata nella riga "Estrazione del ...", se presente. */
  extractionDate: string | null
  /** Righe scartate perché il numero di campi non è riconducibile all'intestazione. */
  skippedRows: number
}

export interface ParseCsvOptions {
  /** Colonne che devono comparire nella riga di intestazione. */
  requiredHeaders: string[]
  /**
   * Colonna di testo libero che può contenere il separatore "|". Se una riga ha più
   * campi dell'intestazione, quelli in eccesso vengono riassorbiti in questa colonna:
   * le colonne precedenti si allineano da sinistra, le successive da destra.
   */
  overflowColumn?: string
}

const EXTRACTION_RE = /estrazione del\s+(\d{4}-\d{2}-\d{2})/i

export function parseCsvTable(text: string, options: ParseCsvOptions): CsvTable {
  const required = options.requiredHeaders.map(normalizeHeader)
  const lines = text.split(/\r?\n/)

  let extractionDate: string | null = null
  let headerIndex = -1
  let header: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const extraction = EXTRACTION_RE.exec(line)
    if (extraction) {
      extractionDate = extraction[1] ?? null
      continue
    }
    const cells = line.split('|').map(normalizeHeader)
    if (required.every((name) => cells.includes(name))) {
      headerIndex = i
      header = cells
      break
    }
  }

  if (headerIndex === -1) {
    throw new Error(`CSV header not found. Expected headers: ${options.requiredHeaders.join(', ')}`)
  }

  const overflowIndex = options.overflowColumn
    ? header.indexOf(normalizeHeader(options.overflowColumn))
    : -1

  const records: CsvRecord[] = []
  let skippedRows = 0

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.trim() === '') continue

    let cells = line.split('|')
    if (cells.length > header.length) {
      if (overflowIndex === -1) {
        skippedRows++
        continue
      }
      const extra = cells.length - header.length
      cells = [
        ...cells.slice(0, overflowIndex),
        cells.slice(overflowIndex, overflowIndex + extra + 1).join('|'),
        ...cells.slice(overflowIndex + extra + 1),
      ]
    }

    const record: CsvRecord = Object.create(null)
    for (let c = 0; c < header.length; c++) {
      record[header[c] as string] = (cells[c] ?? '').trim()
    }
    records.push(record)
  }

  return { records, extractionDate, skippedRows }
}
