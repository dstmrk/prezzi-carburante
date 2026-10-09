import { describe, expect, it } from 'vitest'
import { decodeCsv, parseCsvTable } from '../server/data/csv.ts'
import { parseAnagrafica } from '../server/data/dataset.ts'
import { parseMimitDate } from '../shared/mimit-date.ts'
import {
  ANAGRAFICA_HEADER,
  PREZZI_HEADER,
  buildFixtureDataset,
  csv,
  mimitDate,
  prezziRows,
} from './fixtures.ts'

describe('decodeCsv', () => {
  it('decodes UTF-8 (formato attuale del MIMIT)', () => {
    expect(decodeCsv(new TextEncoder().encode('CANICATTÌ'))).toBe('CANICATTÌ')
  })

  it('falls back to Windows-1252 for legacy files', () => {
    expect(decodeCsv(new Uint8Array([0x43, 0x41, 0x4e, 0x49, 0x43, 0x41, 0x54, 0x54, 0xcc]))).toBe(
      'CANICATTÌ',
    )
  })

  it('strips the BOM', () => {
    expect(decodeCsv(new TextEncoder().encode('﻿abc'))).toBe('abc')
  })
})

describe('parseCsvTable', () => {
  it('skips the extraction row and maps cells by header', () => {
    const table = parseCsvTable(
      `Estrazione del 2026-03-23\n${ANAGRAFICA_HEADER}\n59183|ENIMOOV S.P.A.|Agip Eni|Stradale|19829 AGRIGENTO|SS.189|AGRIGENTO|AG|37.333935|13.595533\n`,
      { requiredHeaders: ['idImpianto', 'Latitudine'] },
    )
    expect(table.extractionDate).toBe('2026-03-23')
    expect(table.records).toHaveLength(1)
    expect(table.records[0]).toMatchObject({
      idimpianto: '59183',
      bandiera: 'Agip Eni',
      latitudine: '37.333935',
    })
  })

  it('throws when the header is missing', () => {
    expect(() => parseCsvTable('a|b\n1|2', { requiredHeaders: ['idImpianto'] })).toThrow(
      /header not found/,
    )
  })

  it('treats double quotes as plain text', () => {
    // Una virgoletta non chiusa non deve "mangiare" le righe successive.
    const table = parseCsvTable(
      [
        ANAGRAFICA_HEADER,
        '46593|"MEGA SERVICE S.A.S. &C .|Q8|Stradale|MEGA SERVICE|123 KM.15|CAMPOBELLO DI LICATA|AG|37.25|13.91',
        '58601|PAPPALARDO "SEPA S.R.L."|SEPA|Stradale|SEPA FAVARA|Via IV Novembre 47|FAVARA|AG|37.30|13.65',
      ].join('\n'),
      { requiredHeaders: ['idImpianto'] },
    )
    expect(table.records.map((r) => [r.idimpianto, r.bandiera])).toEqual([
      ['46593', 'Q8'],
      ['58601', 'SEPA'],
    ])
  })

  it('absorbs extra separators into the overflow column', () => {
    const table = parseCsvTable(
      [ANAGRAFICA_HEADER, '1|G|B|Stradale|NOME | CON PIPE|VIA ROMA 1|ROMA|RM|41.9|12.5'].join('\n'),
      { requiredHeaders: ['idImpianto'], overflowColumn: 'Nome Impianto' },
    )
    expect(table.records[0]).toMatchObject({
      'nome impianto': 'NOME | CON PIPE',
      indirizzo: 'VIA ROMA 1',
      latitudine: '41.9',
      longitudine: '12.5',
    })
  })

  it('skips rows with too many cells when there is no overflow column', () => {
    const table = parseCsvTable(`${PREZZI_HEADER}\n1|Benzina|1.8|1|01/01/2026 08:00:00|x`, {
      requiredHeaders: ['idImpianto'],
    })
    expect(table.records).toHaveLength(0)
    expect(table.skippedRows).toBe(1)
  })
})

describe('parseAnagrafica', () => {
  it('removes the "| gestori.prezzibenzina.it" artifact before splitting', () => {
    const table = parseAnagrafica(
      csv(ANAGRAFICA_HEADER, [
        '54386|PRADELLI | gestori.prezzibenzina.it|Pompe Bianche|Stradale|PRADELLI - MONTEOMBRARO | gestori.prezzibenzina.it|Via dei Martiri 255 41059|ZOCCA|MO|44.379|11.004',
      ]),
    )
    expect(table.records[0]).toMatchObject({
      gestore: 'PRADELLI',
      bandiera: 'Pompe Bianche',
      'nome impianto': 'PRADELLI - MONTEOMBRARO',
      latitudine: '44.379',
    })
  })
})

describe('parseMimitDate', () => {
  it('interprets dates as Europe/Rome time (CEST)', () => {
    expect(parseMimitDate('09/10/2026 08:00:00')).toBe(Date.UTC(2026, 9, 9, 6, 0, 0))
  })

  it('interprets dates as Europe/Rome time (CET)', () => {
    expect(parseMimitDate('15/01/2026 08:00:00')).toBe(Date.UTC(2026, 0, 15, 7, 0, 0))
  })

  it('rejects malformed values', () => {
    expect(parseMimitDate('2026-01-15 08:00:00')).toBeNull()
    expect(parseMimitDate('32/13/2026 08:00:00')).toBeNull()
    expect(parseMimitDate('')).toBeNull()
    expect(parseMimitDate(undefined)).toBeNull()
  })
})

describe('buildDataset', () => {
  it('keeps the lowest price per fuel and maps gestore to the bandiera', () => {
    const dataset = buildFixtureDataset()
    const station = dataset.stations.get('59183')!
    expect(station.gestore).toBe('Agip Eni')
    expect(station.prezzi.get('benzina')).toMatchObject({ prezzo: 1.637, self: true })
    expect(station.indirizzo).toBe('SS.189 KM. 64+649 S.N.C AGRIGENTO AG')
    expect(station.nome).toBe('19829 AGRIGENTO')
  })

  it('keeps accented characters intact', () => {
    expect(buildFixtureDataset().stations.get('43200')!.indirizzo).toContain('CANICATTÌ')
  })

  it('drops prices older than 15 days or dated in the future', () => {
    const dataset = buildFixtureDataset([
      `59183|Benzina|1.7|1|${mimitDate(16)}`,
      `49195|Benzina|1.7|1|${mimitDate(-3)}`,
      `43200|Benzina|1.7|1|${mimitDate(14)}`,
    ])
    expect(dataset.stations.get('59183')!.prezzi.size).toBe(0)
    expect(dataset.stations.get('49195')!.prezzi.size).toBe(0)
    expect(dataset.stations.get('43200')!.prezzi.size).toBe(1)
  })

  it('drops implausible prices relative to the national median', () => {
    const today = mimitDate(0)
    const ids = Array.from({ length: 12 }, (_, i) => 2000 + i)
    const anagrafica = ids.map((id) => `${id}|G|B|Stradale|N|VIA|ROMA|RM|41.9|12.5`)
    const rows = ids.map((id) => `${id}|Metano|1.900|1|${today}`)
    rows[0] = `2000|Metano|0.100|1|${today}` // segnaposto
    rows[1] = `2001|Metano|4.999|1|${today}` // errore di battitura
    rows.push(`2002|Metano|0.100|0|${today}`) // il servito sbagliato non deve vincere sul self
    const dataset = buildFixtureDataset(rows, anagrafica)
    expect(dataset.stations.get('2000')!.prezzi.size).toBe(0)
    expect(dataset.stations.get('2001')!.prezzi.size).toBe(0)
    expect(dataset.stations.get('2002')!.prezzi.get('metano')!.prezzo).toBe(1.9)
  })

  it('counts stations per fuel', () => {
    const dataset = buildFixtureDataset()
    expect(dataset.fuels.get('benzina')).toEqual({ nome: 'Benzina', impianti: 4 })
    expect(dataset.fuels.get('gasolio')).toEqual({ nome: 'Gasolio', impianti: 2 })
    expect(dataset.extractionDate).toBe('2026-10-08')
  })

  it('ignores prices for unknown stations and rows without coordinates', () => {
    const dataset = buildFixtureDataset(
      [...prezziRows(), `999|Benzina|1.5|1|${mimitDate(0)}`],
      ['60502|FERRARA LUIGI|Pompe Bianche|Stradale||VIALE SAN VITO 31|CIRCELLO|BN||'],
    )
    expect(dataset.stations.size).toBe(0)
  })
})
