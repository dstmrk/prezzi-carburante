import { createApp } from './app.ts'
import { config } from './config.ts'
import { createDataStore } from './data/store.ts'

const store = createDataStore({
  sources: config.sources,
  refreshIntervalMs: config.refreshIntervalMs,
  fetchTimeoutMs: config.fetchTimeoutMs,
  retryMinMs: config.retryMinMs,
  retryMaxMs: config.retryMaxMs,
  userAgent: config.userAgent,
})

const app = createApp({ store, staticDir: config.staticDir })

const server = app.listen(config.port, () => {
  console.info(`Server started on port ${config.port}`)
  void store.refresh()
})

// Tiene i dati aggiornati anche senza traffico (sulle istanze che non vanno in sospensione).
const refreshTimer = setInterval(() => void store.get(), config.refreshIntervalMs)
refreshTimer.unref()

function shutdown(signal: string): void {
  console.info(`${signal} received, shutting down.`)
  clearInterval(refreshTimer)
  server.close(() => process.exit(0))
  // Le connessioni keep-alive inattive non devono bloccare il deploy.
  server.closeIdleConnections()
  setTimeout(() => process.exit(0), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
