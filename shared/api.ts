// Contratto pubblico dell'API, condiviso tra server e frontend.
// I campi esistenti non vanno rinominati né cambiati di tipo: ci sono client esterni che li usano.

/** Elemento restituito da GET /api/distributori. */
export interface Distributore {
  ranking: number
  /** Bandiera dell'impianto (es. "Agip Eni"), con fallback su gestore e nome. */
  gestore: string
  indirizzo: string
  prezzo: number
  self: boolean
  /** Data di comunicazione del prezzo, "DD/MM/YYYY HH:MM:SS" ora italiana. */
  data: string
  /** Distanza in km dal punto di ricerca, stringa con due decimali (es. "3.53"). */
  distanza: string
  latitudine: number
  longitudine: number
  /** Identificativo MIMIT dell'impianto, utilizzabile come `stationID` in /api/prezzo. */
  id: number
  /** Nome dell'impianto come registrato al MIMIT. */
  nome: string
}

/** Elemento restituito da POST /api/percorso. */
export interface DistributorePercorso extends Distributore {
  /** Progressiva in km lungo il percorso del punto più vicino all'impianto. */
  km: number
}

/** Risposta JSON di GET /api/prezzo. */
export interface PrezzoImpianto {
  gestore: string
  indirizzo: string
  prezzo: number
  self: boolean
  data: string
}

/** Elemento restituito da GET /api/carburanti. */
export interface Carburante {
  /** Valore da passare come parametro `fuel`. */
  id: string
  nome: string
  impianti: number
}

/** Risposta di GET /api/stato. */
export interface StatoDati {
  pronto: boolean
  /** Data di estrazione dichiarata nei CSV MIMIT (YYYY-MM-DD). */
  estrazione: string | null
  /** Istante (ISO 8601) dell'ultimo download riuscito. */
  aggiornatoIl: string | null
  impianti: number
}

/** Corpo di POST /api/percorso. */
export interface RichiestaPercorso {
  /** Punti del percorso come coppie [latitudine, longitudine], da 2 a 1000. */
  points: [number, number][]
  fuel: string
  /** Distanza massima dal percorso in km (default 2, max 10). */
  distance?: number
  /** Numero massimo di risultati (default 20, max 50). */
  results?: number
  /** Scarta i prezzi comunicati più di N giorni fa. */
  maxAge?: number
}

export interface ApiError {
  error: string
}

export const MAX_DISTANCE_KM = 50
export const MAX_RESULTS = 50
export const DEFAULT_RESULTS = 5
/** Prezzi più vecchi di così non vengono mai serviti. */
export const MAX_PRICE_AGE_DAYS = 15

export const ROUTE_MAX_POINTS = 1000
export const ROUTE_DEFAULT_DISTANCE_KM = 2
export const ROUTE_MAX_DISTANCE_KM = 10
export const ROUTE_DEFAULT_RESULTS = 20
