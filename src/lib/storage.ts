// localStorage può non essere disponibile (navigazione privata, cookie bloccati):
// qui è solo una comodità, quindi ogni errore viene ignorato.

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writeStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignorato
  }
}
