export type MapsApp = 'google' | 'apple' | 'waze'

export const MAPS_APP_LABELS: Record<MapsApp, string> = {
  google: 'Google Maps',
  apple: 'Apple Mappe',
  waze: 'Waze',
}

export function isApplePlatform(userAgent = navigator.userAgent): boolean {
  return /iPad|iPhone|iPod|Macintosh/.test(userAgent)
}

/** App predefinita: Apple Mappe sui dispositivi Apple, Google Maps altrove. */
export function defaultMapsApp(userAgent?: string): MapsApp {
  return isApplePlatform(userAgent) ? 'apple' : 'google'
}

/**
 * Link di navigazione verso le coordinate. Sono tutti universal link: su mobile
 * aprono l'app se installata, altrimenti il sito.
 */
export function directionsUrl(app: MapsApp, lat: number, lon: number): string {
  const coords = `${lat},${lon}`
  switch (app) {
    case 'apple':
      return `https://maps.apple.com/?daddr=${coords}&dirflg=d`
    case 'waze':
      return `https://waze.com/ul?ll=${coords}&navigate=yes`
    case 'google':
      return `https://www.google.com/maps/dir/?api=1&destination=${coords}&travelmode=driving`
  }
}
