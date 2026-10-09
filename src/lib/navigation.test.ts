import { describe, expect, it } from 'vitest'
import { defaultMapsApp, directionsUrl } from './navigation'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0'

describe('navigation', () => {
  it('prefers Apple Maps on Apple devices and Google Maps elsewhere', () => {
    expect(defaultMapsApp(IPHONE)).toBe('apple')
    expect(defaultMapsApp(ANDROID)).toBe('google')
  })

  it('builds directions links', () => {
    expect(directionsUrl('google', 45.1, 7.2)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=45.1,7.2&travelmode=driving',
    )
    expect(directionsUrl('apple', 45.1, 7.2)).toBe(
      'https://maps.apple.com/?daddr=45.1,7.2&dirflg=d',
    )
    expect(directionsUrl('waze', 45.1, 7.2)).toBe('https://waze.com/ul?ll=45.1,7.2&navigate=yes')
  })
})
