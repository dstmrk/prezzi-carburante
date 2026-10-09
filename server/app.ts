import fs from 'node:fs'
import path from 'node:path'
import compression from 'compression'
import cors from 'cors'
import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express'
import helmet from 'helmet'
import type { DataStore } from './data/store.ts'
import { createApiRouter } from './http/api.ts'

export interface AppOptions {
  store: DataStore
  /** Cartella con la build del frontend; se manca viene servita solo l'API. */
  staticDir?: string
  now?: () => number
  logger?: Pick<Console, 'info' | 'warn' | 'error'>
}

const OPENAPI_SPEC = path.resolve(import.meta.dirname, '../openapi.yaml')

const accessLog =
  (logger: Pick<Console, 'info'>): RequestHandler =>
  (req, res, next) => {
    const startedAt = performance.now()
    res.on('finish', () => {
      const ms = (performance.now() - startedAt).toFixed(0)
      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`)
    })
    next()
  }

export function createApp({ store, staticDir, now, logger = console }: AppOptions): Express {
  const app = express()

  app.disable('x-powered-by')
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:', 'blob:', 'https://ko-fi.com'],
          // Stili, tile, font e sprite della mappa (OpenFreeMap) e geocoding (Nominatim).
          'connect-src': [
            "'self'",
            'https://tiles.openfreemap.org',
            'https://nominatim.openstreetmap.org',
          ],
          'worker-src': ["'self'", 'blob:'],
          // MapLibre e Sonner applicano stili inline.
          'style-src': ["'self'", "'unsafe-inline'"],
        },
      },
      // L'API è pubblica: deve poter essere letta da qualsiasi origine.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // La policy d'uso di Nominatim richiede il Referer.
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  )
  app.use(compression())
  app.use(cors())

  app.get('/healthz', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ status: 'ok' })
  })

  app.get('/openapi.yaml', (_req, res) => {
    res.type('application/yaml').sendFile(OPENAPI_SPEC)
  })

  app.use('/api', accessLog(logger), createApiRouter({ store, now }))

  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
    app.use(
      express.static(staticDir, {
        setHeaders(res, filePath) {
          // Gli asset generati da Vite hanno l'hash nel nome: si possono cachare per sempre.
          const immutable = filePath.startsWith(path.join(staticDir, 'assets') + path.sep)
          res.set('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache')
        },
      }),
    )
  } else if (staticDir) {
    logger.warn(`Frontend build not found in ${staticDir}: run "npm run build". Serving API only.`)
  }

  const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) return next(error)
    const status = typeof error?.status === 'number' ? error.status : 500
    if (status >= 500) {
      logger.error(error)
      res.status(500).json({ error: 'Internal server error.' })
      return
    }
    // Errori del client sollevati dai middleware (JSON non valido, body troppo grande...).
    res.status(status).json({ error: error.expose ? error.message : 'Bad request.' })
  }
  app.use(errorHandler)

  return app
}
