import { LocateFixedIcon, MapPinIcon, SearchIcon } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Spinner } from '@/components/ui/spinner'
import { type Place, searchPlaces } from '@/lib/geocode'

interface LocationSearchProps {
  /** Etichetta del punto attualmente selezionato. */
  currentLabel: string | null
  onSelect: (place: Place) => void
}

export function LocationSearch({ currentLabel, onSelect }: LocationSearchProps) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [locating, setLocating] = useState(false)
  const [choices, setChoices] = useState<Place[]>([])
  const [message, setMessage] = useState<string | null>(null)

  function select(place: Place) {
    setChoices([])
    setMessage(null)
    onSelect(place)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const text = query.trim()
    if (!text) return
    setSearching(true)
    setMessage(null)
    setChoices([])
    try {
      const places = await searchPlaces(text)
      if (places.length === 0) {
        setMessage('Nessun risultato. Prova ad aggiungere la città o il numero civico.')
      } else if (places.length === 1) {
        select(places[0]!)
      } else {
        setChoices(places)
      }
    } catch {
      setMessage('Ricerca non disponibile al momento. Riprova tra poco.')
    } finally {
      setSearching(false)
    }
  }

  function locate() {
    if (!('geolocation' in navigator)) {
      toast.error('Il browser non supporta la geolocalizzazione.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        select({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          label: 'La tua posizione',
        })
      },
      (error) => {
        setLocating(false)
        toast.error(
          error.code === error.PERMISSION_DENIED
            ? 'Permesso di localizzazione negato. Abilitalo nelle impostazioni del browser.'
            : 'Impossibile ottenere la posizione. Riprova o cerca un indirizzo.',
        )
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSubmit} role="search">
        <Field>
          <FieldLabel htmlFor="location-query">Dove cerchi?</FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              id="location-query"
              type="search"
              enterKeyHint="search"
              autoComplete="street-address"
              placeholder="Città, indirizzo o CAP"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="submit"
                variant="secondary"
                disabled={searching || !query.trim()}
              >
                {searching ? <Spinner /> : 'Cerca'}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {message ? (
            <FieldDescription role="status">{message}</FieldDescription>
          ) : (
            currentLabel && (
              <FieldDescription className="flex items-center gap-1.5">
                <MapPinIcon className="size-3.5 shrink-0" />
                <span className="truncate">{currentLabel}</span>
              </FieldDescription>
            )
          )}
        </Field>
      </form>

      {choices.length > 0 && (
        <ItemGroup className="gap-1" aria-label="Risultati della ricerca">
          {choices.map((place) => (
            <Item
              key={`${place.lat},${place.lon}`}
              size="xs"
              variant="outline"
              render={<button type="button" onClick={() => select(place)} />}
              className="cursor-pointer text-left hover:bg-muted"
            >
              <ItemMedia variant="icon">
                <MapPinIcon />
              </ItemMedia>
              <ItemContent>
                <ItemTitle className="line-clamp-2">{place.label}</ItemTitle>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      )}

      <Button variant="outline" onClick={locate} disabled={locating}>
        {locating ? <Spinner /> : <LocateFixedIcon />}
        Usa la mia posizione
      </Button>
    </div>
  )
}
