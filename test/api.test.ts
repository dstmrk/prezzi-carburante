import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Distributore, DistributorePercorso } from '../shared/api.ts'
import { createApp } from '../server/app.ts'
import type { Dataset } from '../server/data/dataset.ts'
import type { DataStore } from '../server/data/store.ts'
import { NOW, buildFixtureDataset } from './fixtures.ts'

const silent = { info() {}, warn() {}, error() {} }

function fakeStore(dataset: Dataset | null): DataStore {
  return { get: async () => dataset, refresh: async () => {}, peek: () => dataset }
}

async function listen(store: DataStore) {
  const server = createApp({ store, now: () => NOW, logger: silent }).listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const { port } = server.address() as AddressInfo
  return { server, base: `http://127.0.0.1:${port}` }
}

describe('API', () => {
  let server: Server
  let base: string

  beforeAll(async () => {
    ;({ server, base } = await listen(fakeStore(buildFixtureDataset())))
  })
  afterAll(() => {
    server.close()
  })

  describe('GET /api/distributori', () => {
    const query = 'latitude=37.312&longitude=13.586&distance=5&fuel=benzina'

    it('keeps the legacy contract', async () => {
      const res = await fetch(`${base}/api/distributori?${query}&results=2`)
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe(
        'public, max-age=300, stale-while-revalidate=86400',
      )
      expect(res.headers.get('access-control-allow-origin')).toBe('*')
      const body = (await res.json()) as Distributore[]
      expect(body).toHaveLength(2)
      for (const item of body) {
        expect(item).toEqual(
          expect.objectContaining({
            ranking: expect.any(Number),
            gestore: expect.any(String),
            indirizzo: expect.any(String),
            prezzo: expect.any(Number),
            self: expect.any(Boolean),
            data: expect.stringMatching(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/),
            distanza: expect.stringMatching(/^\d+\.\d{2}$/),
            latitudine: expect.any(Number),
            longitudine: expect.any(Number),
          }),
        )
      }
    })

    it('defaults to 5 results and is case-insensitive on fuel', async () => {
      const res = await fetch(
        `${base}/api/distributori?latitude=37.312&longitude=13.586&distance=50&fuel=BENZINA`,
      )
      expect(((await res.json()) as Distributore[]).length).toBe(3)
    })

    it.each([
      'longitude=13.586&distance=5&fuel=benzina',
      'latitude=abc&longitude=13.586&distance=5&fuel=benzina',
      'latitude=37.312&longitude=13.586&distance=0&fuel=benzina',
      'latitude=37.312&longitude=13.586&distance=5',
      'latitude=37.312&longitude=13.586&distance=5&fuel=',
    ])('rejects invalid parameters: %s', async (qs) => {
      const res = await fetch(`${base}/api/distributori?${qs}`)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({
        error: 'Invalid latitude, longitude, distance or fuel values.',
      })
    })

    it('validates maxAge', async () => {
      const res = await fetch(`${base}/api/distributori?${query}&maxAge=abc`)
      expect(res.status).toBe(400)
    })

    it('returns an empty list for an unknown fuel', async () => {
      const res = await fetch(`${base}/api/distributori?${query.replace('benzina', 'idrogeno')}`)
      expect(await res.json()).toEqual([])
    })
  })

  describe('GET /api/prezzo', () => {
    it('returns the station price as JSON', async () => {
      const res = await fetch(`${base}/api/prezzo?stationID=59183&fuel=benzina`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        gestore: 'Agip Eni',
        indirizzo: 'SS.189 KM. 64+649 S.N.C AGRIGENTO AG',
        prezzo: 1.637,
        self: true,
        data: expect.any(String),
      })
    })

    it('returns plain text with a comma and three decimals', async () => {
      const res = await fetch(`${base}/api/prezzo?stationID=1001&fuel=benzina&output=text`)
      expect(res.headers.get('content-type')).toMatch(/^text\/plain/)
      expect(await res.text()).toBe('1,800')
    })

    it.each([
      ['fuel=benzina', 400, 'stationID and fuel are required.'],
      ['stationID=59183', 400, 'stationID and fuel are required.'],
      ['stationID=1&fuel=benzina', 404, 'Station not found.'],
      ['stationID=__proto__&fuel=benzina', 404, 'Station not found.'],
      ['stationID=59183&fuel=gpl', 404, 'Fuel type not found for this station.'],
    ])('%s → %i', async (qs, status, error) => {
      const res = await fetch(`${base}/api/prezzo?${qs}`)
      expect(res.status).toBe(status)
      expect(await res.json()).toEqual({ error })
    })
  })

  describe('POST /api/percorso', () => {
    const post = (body: unknown) =>
      fetch(`${base}/api/percorso`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      })

    it('returns stations along the route', async () => {
      const res = await post({
        points: [
          [37.33, 13.5],
          [37.33, 13.9],
        ],
        fuel: 'benzina',
        distance: 3,
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as DistributorePercorso[]
      expect(body.map((s) => s.id)).toEqual([59183, 43200])
      expect(body[0]).toHaveProperty('km')
    })

    it.each([
      [{ points: [[37.33, 13.5]], fuel: 'benzina' }],
      [
        {
          points: [
            [37.33, 13.5],
            [100, 13.9],
          ],
          fuel: 'benzina',
        },
      ],
      [
        {
          points: [
            [37.33, 13.5],
            [37.33, 13.9],
          ],
        },
      ],
      [
        {
          points: [
            [37.33, 13.5],
            [37.33, 13.9],
          ],
          fuel: 'benzina',
          distance: 50,
        },
      ],
      [
        {
          points: [
            [37.33, 13.5],
            [37.33, 13.9],
          ],
          fuel: 'benzina',
          results: 0,
        },
      ],
      [
        {
          points: [
            [37.33, 13.5],
            [37.33, 13.9],
          ],
          fuel: 'benzina',
          maxAge: -1,
        },
      ],
      ['{not json'],
      ['[]'],
    ])('rejects %j', async (body) => {
      const res = await post(body)
      expect(res.status).toBe(400)
      expect(await res.json()).toHaveProperty('error')
    })
  })

  it('GET /api/carburanti lists fuels by number of stations', async () => {
    const res = await fetch(`${base}/api/carburanti`)
    expect(await res.json()).toEqual([
      { id: 'benzina', nome: 'Benzina', impianti: 4 },
      { id: 'gasolio', nome: 'Gasolio', impianti: 2 },
    ])
  })

  it('GET /api/stato reports the dataset status', async () => {
    const res = await fetch(`${base}/api/stato`)
    expect(await res.json()).toEqual({
      pronto: true,
      estrazione: '2026-10-08',
      aggiornatoIl: new Date(NOW).toISOString(),
      impianti: 4,
    })
  })

  it('GET /healthz', async () => {
    const res = await fetch(`${base}/healthz`)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('GET /openapi.yaml serves the API spec', async () => {
    const res = await fetch(`${base}/openapi.yaml`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/yaml/)
    expect(await res.text()).toMatch(/^openapi: 3\.1/)
  })

  it('unknown API routes return JSON 404', async () => {
    const res = await fetch(`${base}/api/nope`)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found.' })
  })

  it('sends security headers', async () => {
    const res = await fetch(`${base}/healthz`)
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'")
    expect(res.headers.get('x-powered-by')).toBeNull()
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
  })
})

describe('API without data', () => {
  it('responds 503 with Retry-After', async () => {
    const { server, base } = await listen(fakeStore(null))
    try {
      const res = await fetch(`${base}/api/prezzo?stationID=1&fuel=benzina`)
      expect(res.status).toBe(503)
      expect(res.headers.get('retry-after')).toBe('30')
      expect(await res.json()).toEqual({
        error: 'Fuel station data not yet available, try again shortly.',
      })
    } finally {
      server.close()
    }
  })
})
