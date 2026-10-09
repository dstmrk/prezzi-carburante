export interface Place {
  lat: number
  lon: number
  label: string
}

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
  address?: Record<string, string | undefined>
}

function formatAddress(result: NominatimResult): string {
  const a = result.address ?? {}
  const street = [a.road ?? a.pedestrian ?? a.footway ?? a.path, a.house_number]
    .filter(Boolean)
    .join(' ')
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county
  const place = [street, [a.postcode, city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return place || result.display_name
}

/**
 * Geocoding con Nominatim (OpenStreetMap). La policy d'uso vieta l'autocompletamento:
 * la ricerca parte solo su invio esplicito dell'utente.
 */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    q: query,
    limit: '5',
    countrycodes: 'it',
    addressdetails: '1',
    'accept-language': 'it',
  })
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal })
  if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`)
  const results = (await response.json()) as NominatimResult[]
  return results.map((r) => ({ lat: Number(r.lat), lon: Number(r.lon), label: formatAddress(r) }))
}

/** Indirizzo leggibile per un punto scelto sulla mappa (best effort). */
export async function reverseGeocode(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lon),
    zoom: '18',
    addressdetails: '1',
    'accept-language': 'it',
  })
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, { signal })
  if (!response.ok) return null
  const result = (await response.json()) as NominatimResult & { error?: string }
  return result.error ? null : formatAddress(result)
}
