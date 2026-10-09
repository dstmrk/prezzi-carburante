import type {
  ApiError,
  Carburante,
  Distributore,
  DistributorePercorso,
  RichiestaPercorso,
  StatoDati,
} from '@shared/api'

export class ApiRequestError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }

  /** Il server è partito da poco e sta ancora scaricando i dati dal MIMIT. */
  get isWarmingUp(): boolean {
    return this.status === 503
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch {
    throw new ApiRequestError(0, 'Impossibile contattare il server. Controlla la connessione.')
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null
    throw new ApiRequestError(response.status, body?.error ?? `Errore HTTP ${response.status}`)
  }
  return (await response.json()) as T
}

export interface NearbyParams {
  lat: number
  lon: number
  fuel: string
  radiusKm: number
  results: number
  maxAgeDays: number
}

export function fetchNearby(params: NearbyParams, signal?: AbortSignal): Promise<Distributore[]> {
  const query = new URLSearchParams({
    latitude: params.lat.toFixed(6),
    longitude: params.lon.toFixed(6),
    distance: String(params.radiusKm),
    fuel: params.fuel,
    results: String(params.results),
    maxAge: String(params.maxAgeDays),
  })
  return request(`/api/distributori?${query}`, { signal })
}

export function fetchAlongRoute(
  body: RichiestaPercorso,
  signal?: AbortSignal,
): Promise<DistributorePercorso[]> {
  return request('/api/percorso', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
}

export function fetchFuels(signal?: AbortSignal): Promise<Carburante[]> {
  return request('/api/carburanti', { signal })
}

export function fetchStatus(signal?: AbortSignal): Promise<StatoDati> {
  return request('/api/stato', { signal })
}
