import { describe, expect, it, vi } from 'vitest'
import { createDataStore } from '../server/data/store.ts'
import {
  ANAGRAFICA_HEADER,
  NOW,
  PREZZI_HEADER,
  anagraficaRows,
  csv,
  prezziRows,
} from './fixtures.ts'

const silent = { info() {}, warn() {}, error() {} }
const sources = { anagrafica: 'https://example.test/a.csv', prezzi: 'https://example.test/p.csv' }

function setup(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  let now = NOW
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) =>
    handler(String(input), init ?? {}),
  )
  const store = createDataStore({
    sources,
    refreshIntervalMs: 60_000,
    fetchTimeoutMs: 1000,
    retryMinMs: 30_000,
    retryMaxMs: 120_000,
    userAgent: 'test',
    fetch,
    now: () => now,
    logger: silent,
  })
  return { store, fetch, advance: (ms: number) => (now += ms) }
}

function ok(url: string): Response {
  const body =
    url === sources.anagrafica
      ? csv(ANAGRAFICA_HEADER, anagraficaRows)
      : csv(PREZZI_HEADER, prezziRows())
  return new Response(body, { headers: { etag: `"${url}-v1"` } })
}

describe('createDataStore', () => {
  it('loads data on first access and shares concurrent loads', async () => {
    const { store, fetch } = setup(ok)
    const [a, b] = await Promise.all([store.get(), store.get()])
    expect(a).toBe(b)
    expect(a!.stations.size).toBe(4)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('serves cached data and revalidates in the background with ETags', async () => {
    const { store, fetch, advance } = setup((url, init) => {
      const headers = new Headers(init.headers)
      return headers.get('if-none-match') ? new Response(null, { status: 304 }) : ok(url)
    })
    const first = await store.get()
    advance(30_000)
    expect(await store.get()).toBe(first)
    expect(fetch).toHaveBeenCalledTimes(2)

    advance(60_000)
    expect(await store.get()).toBe(first) // risposta immediata con i dati in cache
    await store.refresh()
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(new Headers(fetch.mock.calls[2]![1]!.headers).get('if-none-match')).toBe(
      `"${sources.anagrafica}-v1"`,
    )
    expect(store.peek()).toBe(first)
  })

  it('backs off after a failure instead of retrying on every request', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    try {
      const { store, fetch, advance } = setup(() => {
        throw new Error('ECONNRESET')
      })
      const pending = store.get()
      await vi.runAllTimersAsync()
      expect(await pending).toBeNull()
      const callsAfterFirstFailure = fetch.mock.calls.length
      expect(callsAfterFirstFailure).toBe(6) // 2 file × 3 tentativi

      expect(await store.get()).toBeNull()
      expect(fetch).toHaveBeenCalledTimes(callsAfterFirstFailure)

      advance(30_000)
      const retry = store.get()
      await vi.runAllTimersAsync()
      await retry
      expect(fetch.mock.calls.length).toBeGreaterThan(callsAfterFirstFailure)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps serving stale data when a refresh fails', async () => {
    let fail = false
    const { store, advance } = setup((url) => {
      if (fail) return new Response('boom', { status: 500 })
      return ok(url)
    })
    const first = await store.get()
    fail = true
    advance(120_000)
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    try {
      const refreshing = store.refresh()
      await vi.runAllTimersAsync()
      await refreshing
    } finally {
      vi.useRealTimers()
    }
    expect(await store.get()).toBe(first)
  })
})
