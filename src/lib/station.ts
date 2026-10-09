import type { Station } from '@/lib/types'

const PER_KG_FUELS = new Set(['metano', 'gnl', 'l-gnc'])

export function priceUnit(fuel: string): string {
  return PER_KG_FUELS.has(fuel) ? '€/kg' : '€/l'
}

/** Nome da mostrare: la bandiera, a meno che non sia generica. */
export function stationTitle(station: Station): string {
  if (station.gestore === 'Pompe Bianche' && station.nome) return station.nome
  return station.gestore || station.nome || 'Distributore'
}

export function stationSubtitle(station: Station): string | null {
  const title = stationTitle(station)
  if (station.gestore === 'Pompe Bianche') return 'Pompa bianca'
  return station.nome && station.nome !== title ? station.nome : null
}
