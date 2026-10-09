import { useEffect, useState } from 'react'
import { readStorage, writeStorage } from '@/lib/storage'

/** useState che ricorda il valore tra una visita e l'altra. */
export function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readStorage(key, initial))
  useEffect(() => writeStorage(key, value), [key, value])
  return [value, setValue] as const
}
