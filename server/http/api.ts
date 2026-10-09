import express, { type Request, type Response, Router } from 'express'
import {
  type Carburante,
  DEFAULT_RESULTS,
  MAX_DISTANCE_KM,
  MAX_RESULTS,
  type PrezzoImpianto,
  ROUTE_DEFAULT_DISTANCE_KM,
  ROUTE_DEFAULT_RESULTS,
  ROUTE_MAX_DISTANCE_KM,
  ROUTE_MAX_POINTS,
  type StatoDati,
} from '../../shared/api.ts'
import type { Dataset } from '../data/dataset.ts'
import type { DataStore } from '../data/store.ts'
import type { LatLon } from '../geo.ts'
import { findCheapestAlongRoute, findCheapestNear } from '../search.ts'
import {
  isLatitude,
  isLongitude,
  looseFloat,
  looseInt,
  nonEmptyString,
  optionalPositive,
} from './params.ts'

export interface ApiOptions {
  store: DataStore
  now?: () => number
}

function setDataCacheHeaders(res: Response): void {
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400')
}

function badRequest(res: Response, error: string): void {
  res.status(400).json({ error })
}

export function createApiRouter({ store, now = Date.now }: ApiOptions): Router {
  const router = Router()

  /** Carica i dati o risponde 503 se non sono ancora disponibili. */
  async function requireData(res: Response): Promise<Dataset | null> {
    const dataset = await store.get()
    if (!dataset) {
      res.set('Retry-After', '30')
      res.status(503).json({ error: 'Fuel station data not yet available, try again shortly.' })
    }
    return dataset
  }

  router.get('/distributori', async (req: Request, res: Response) => {
    const lat = looseFloat(req.query.latitude)
    const lon = looseFloat(req.query.longitude)
    const distance = looseFloat(req.query.distance)
    const fuel = nonEmptyString(req.query.fuel)

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      !Number.isFinite(distance) ||
      distance <= 0 ||
      !fuel
    ) {
      return badRequest(res, 'Invalid latitude, longitude, distance or fuel values.')
    }

    const maxAgeDays = optionalPositive(req.query.maxAge)
    if (maxAgeDays === null) return badRequest(res, 'Invalid maxAge value.')

    const results = looseInt(req.query.results)
    const limit = Math.min(Math.max(results || DEFAULT_RESULTS, 1), MAX_RESULTS)

    const dataset = await requireData(res)
    if (!dataset) return

    setDataCacheHeaders(res)
    res.json(
      findCheapestNear(dataset, {
        center: { lat, lon },
        radiusKm: Math.min(distance, MAX_DISTANCE_KM),
        fuel: fuel.toLowerCase(),
        limit,
        maxAgeDays,
        now: now(),
      }),
    )
  })

  router.get('/prezzo', async (req: Request, res: Response) => {
    const stationId = nonEmptyString(req.query.stationID)
    const fuel = nonEmptyString(req.query.fuel)
    if (!stationId || !fuel) return badRequest(res, 'stationID and fuel are required.')

    const dataset = await requireData(res)
    if (!dataset) return

    const station = dataset.stations.get(stationId)
    if (!station) return void res.status(404).json({ error: 'Station not found.' })

    const price = station.prezzi.get(fuel.toLowerCase())
    if (!price) {
      return void res.status(404).json({ error: 'Fuel type not found for this station.' })
    }

    setDataCacheHeaders(res)
    if (req.query.output === 'text') {
      res.type('text/plain').send(price.prezzo.toFixed(3).replace('.', ','))
      return
    }
    const body: PrezzoImpianto = {
      gestore: station.gestore,
      indirizzo: station.indirizzo,
      prezzo: price.prezzo,
      self: price.self,
      data: price.data,
    }
    res.json(body)
  })

  router.post(
    '/percorso',
    express.json({ limit: '100kb' }),
    async (req: Request, res: Response) => {
      const body: unknown = req.body
      if (typeof body !== 'object' || body === null) {
        return badRequest(res, 'Request body must be a JSON object.')
      }
      const input = body as Record<string, unknown>

      const rawPoints = input.points
      if (
        !Array.isArray(rawPoints) ||
        rawPoints.length < 2 ||
        rawPoints.length > ROUTE_MAX_POINTS ||
        !rawPoints.every(
          (p) => Array.isArray(p) && p.length === 2 && isLatitude(p[0]) && isLongitude(p[1]),
        )
      ) {
        return badRequest(
          res,
          `points must be an array of 2 to ${ROUTE_MAX_POINTS} [latitude, longitude] pairs.`,
        )
      }
      const points: LatLon[] = (rawPoints as [number, number][]).map(([lat, lon]) => ({ lat, lon }))

      const fuel = nonEmptyString(input.fuel)
      if (!fuel) return badRequest(res, 'fuel is required.')

      const distance = optionalPositive(input.distance)
      const corridorKm = distance === undefined ? ROUTE_DEFAULT_DISTANCE_KM : distance
      if (corridorKm === null || corridorKm > ROUTE_MAX_DISTANCE_KM) {
        return badRequest(res, `distance must be a number between 0 and ${ROUTE_MAX_DISTANCE_KM}.`)
      }

      const results = input.results === undefined ? ROUTE_DEFAULT_RESULTS : input.results
      if (
        !Number.isInteger(results) ||
        (results as number) < 1 ||
        (results as number) > MAX_RESULTS
      ) {
        return badRequest(res, `results must be an integer between 1 and ${MAX_RESULTS}.`)
      }

      const maxAgeDays = optionalPositive(input.maxAge)
      if (maxAgeDays === null) return badRequest(res, 'Invalid maxAge value.')

      const dataset = await requireData(res)
      if (!dataset) return

      res.json(
        findCheapestAlongRoute(dataset, {
          points,
          corridorKm,
          fuel: fuel.toLowerCase(),
          limit: results as number,
          maxAgeDays,
          now: now(),
        }),
      )
    },
  )

  router.get('/carburanti', async (_req: Request, res: Response) => {
    const dataset = await requireData(res)
    if (!dataset) return

    const fuels: Carburante[] = [...dataset.fuels]
      .map(([id, info]) => ({ id, nome: info.nome, impianti: info.impianti }))
      .sort((a, b) => b.impianti - a.impianti)
    setDataCacheHeaders(res)
    res.json(fuels)
  })

  router.get('/stato', (_req: Request, res: Response) => {
    const dataset = store.peek()
    // Avvia il caricamento se manca, senza far attendere chi chiede solo lo stato.
    void store.get()
    const body: StatoDati = {
      pronto: dataset !== null,
      estrazione: dataset?.extractionDate ?? null,
      aggiornatoIl: dataset ? new Date(dataset.loadedAt).toISOString() : null,
      impianti: dataset?.stations.size ?? 0,
    }
    res.set('Cache-Control', 'no-cache')
    res.json(body)
  })

  router.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found.' })
  })

  return router
}
