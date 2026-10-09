import { CircleAlertIcon, FuelIcon, MapPinnedIcon, RouteIcon } from 'lucide-react'
import { useState } from 'react'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { FreshnessBadge } from '@/components/freshness-badge'
import { priceUnit, stationSubtitle, stationTitle } from '@/lib/station'
import { formatKm, formatPrice } from '@/lib/format'
import { type SearchMode, type Station, isRouteStation } from '@/lib/types'
import { cn } from '@/lib/utils'

function StationItem({
  station,
  fuel,
  selected,
  cheapest,
  onSelect,
}: {
  station: Station
  fuel: string
  selected: boolean
  cheapest: boolean
  onSelect: () => void
}) {
  const subtitle = stationSubtitle(station)
  return (
    <Item
      variant="outline"
      size="sm"
      render={<button type="button" onClick={onSelect} />}
      aria-pressed={selected}
      data-station-id={station.id}
      className={cn(
        'cursor-pointer items-start text-left hover:bg-muted/50',
        selected && 'border-primary bg-primary/5 ring-1 ring-primary hover:bg-primary/5',
      )}
    >
      <ItemContent className="min-w-0 gap-1.5">
        <ItemTitle className="w-full">
          <span className="truncate">{stationTitle(station)}</span>
        </ItemTitle>
        <ItemDescription className="line-clamp-2 text-xs">
          {subtitle && <span className="font-medium text-foreground/80">{subtitle} · </span>}
          {station.indirizzo}
        </ItemDescription>
        <div className="flex flex-wrap items-center gap-1">
          {isRouteStation(station) ? (
            <Badge variant="outline">al km {station.km.toLocaleString('it-IT')}</Badge>
          ) : (
            <Badge variant="outline">{formatKm(station.distanza)}</Badge>
          )}
          {!station.self && <Badge variant="outline">servito</Badge>}
          <FreshnessBadge date={station.data} />
        </div>
      </ItemContent>
      <div className="shrink-0 text-right">
        <p
          className={cn(
            'text-lg leading-tight font-semibold tabular-nums',
            cheapest && 'text-primary',
          )}
        >
          {formatPrice(station.prezzo)}
        </p>
        <p className="text-xs text-muted-foreground">{priceUnit(fuel)}</p>
      </div>
    </Item>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-[88px] w-full rounded-lg" />
      ))}
    </div>
  )
}

type RouteSort = 'prezzo' | 'km'

interface StationListProps {
  mode: SearchMode
  fuel: string
  /** C'è una ricerca da mostrare (un punto scelto o un percorso inviato). */
  active: boolean
  stations: Station[] | undefined
  isLoading: boolean
  isFetching: boolean
  /** Il server sta ancora scaricando i dati: la richiesta viene ritentata da sola. */
  warmingUp: boolean
  error: Error | null
  onRetry: () => void
  selectedId: number | null
  onSelect: (station: Station) => void
}

export function StationList({
  mode,
  fuel,
  active,
  stations,
  isLoading,
  isFetching,
  warmingUp,
  error,
  onRetry,
  selectedId,
  onSelect,
}: StationListProps) {
  const [routeSort, setRouteSort] = useState<RouteSort>('prezzo')

  if (!active) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {mode === 'vicino' ? <MapPinnedIcon /> : <RouteIcon />}
          </EmptyMedia>
          <EmptyTitle>
            {mode === 'vicino' ? 'Scegli dove cercare' : 'Traccia un percorso'}
          </EmptyTitle>
          <EmptyDescription>
            {mode === 'vicino'
              ? 'Cerca un indirizzo, usa la tua posizione o tocca un punto sulla mappa.'
              : 'Tocca la mappa per aggiungere le tappe, poi cerca i distributori lungo il tragitto.'}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (isLoading || warmingUp) {
    return (
      <div className="flex flex-col gap-3">
        {warmingUp && (
          <Alert>
            <Spinner />
            <AlertTitle>Sto scaricando i prezzi dal MIMIT</AlertTitle>
            <AlertDescription>
              Il server si è appena avviato: bastano pochi secondi.
            </AlertDescription>
          </Alert>
        )}
        <ListSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertTitle>Ricerca non riuscita</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
        <AlertAction>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Riprova
          </Button>
        </AlertAction>
      </Alert>
    )
  }

  if (!stations || stations.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FuelIcon />
          </EmptyMedia>
          <EmptyTitle>Nessun distributore trovato</EmptyTitle>
          <EmptyDescription>
            {mode === 'vicino'
              ? 'Prova ad allargare il raggio di ricerca o ad accettare prezzi meno recenti.'
              : 'Prova ad aumentare la distanza dal percorso o ad accettare prezzi meno recenti.'}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const cheapestPrice = Math.min(...stations.map((s) => s.prezzo))
  const sorted =
    mode === 'percorso' && routeSort === 'km'
      ? [...stations].sort((a, b) => (isRouteStation(a) && isRouteStation(b) ? a.km - b.km : 0))
      : stations

  return (
    <section className="flex flex-col gap-3" aria-labelledby="results-heading">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <h2 id="results-heading" className="text-sm font-medium" aria-live="polite">
          {stations.length} {stations.length === 1 ? 'distributore' : 'distributori'}
          {isFetching && <Spinner className="ml-2 inline size-3.5 align-[-2px]" />}
        </h2>
        {mode === 'percorso' && (
          <ToggleGroup
            size="sm"
            variant="outline"
            spacing={0}
            value={[routeSort]}
            onValueChange={(value) => value[0] && setRouteSort(value[0] as RouteSort)}
            aria-label="Ordina per"
          >
            <ToggleGroupItem value="prezzo">Prezzo</ToggleGroupItem>
            <ToggleGroupItem value="km">Km</ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>
      <ItemGroup className="gap-2">
        {sorted.map((station) => (
          <div role="listitem" key={station.id}>
            <StationItem
              station={station}
              fuel={fuel}
              selected={station.id === selectedId}
              cheapest={station.prezzo === cheapestPrice}
              onSelect={() => onSelect(station)}
            />
          </div>
        ))}
      </ItemGroup>
    </section>
  )
}
