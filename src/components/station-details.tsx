import { ChevronDownIcon, NavigationIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FreshnessBadge } from '@/components/freshness-badge'
import { formatDateTime, formatKm, formatPrice } from '@/lib/format'
import { getFreshness } from '@/lib/freshness'
import { MAPS_APP_LABELS, type MapsApp, defaultMapsApp, directionsUrl } from '@/lib/navigation'
import { priceUnit, stationSubtitle, stationTitle } from '@/lib/station'
import { type Station, isRouteStation } from '@/lib/types'
import { cn } from '@/lib/utils'

export function DirectionsButton({ station, className }: { station: Station; className?: string }) {
  const preferred = defaultMapsApp()
  const others = (Object.keys(MAPS_APP_LABELS) as MapsApp[]).filter((app) => app !== preferred)

  return (
    <ButtonGroup className={cn('w-full', className)}>
      <a
        href={directionsUrl(preferred, station.latitudine, station.longitudine)}
        target="_blank"
        rel="noopener noreferrer"
        data-slot="button"
        className={cn(buttonVariants(), 'flex-1')}
      >
        <NavigationIcon />
        Indicazioni
      </a>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="icon" aria-label="Apri con un'altra app" />}>
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {[preferred, ...others].map((app) => (
            <DropdownMenuItem
              key={app}
              render={
                <a
                  href={directionsUrl(app, station.latitudine, station.longitudine)}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              {MAPS_APP_LABELS[app]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  )
}

export function StationDetails({ station, fuel }: { station: Station; fuel: string }) {
  const freshness = getFreshness(station.data)
  const subtitle = stationSubtitle(station)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-heading text-base font-semibold">{stationTitle(station)}</p>
          {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
          <p className="mt-1 text-sm text-muted-foreground">{station.indirizzo}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {formatPrice(station.prezzo)}
          </p>
          <p className="text-xs text-muted-foreground">{priceUnit(fuel)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{station.self ? 'Self service' : 'Servito'}</Badge>
        {isRouteStation(station) ? (
          <>
            <Badge variant="outline">al km {station.km.toLocaleString('it-IT')}</Badge>
            <Badge variant="outline">{formatKm(station.distanza)} dal percorso</Badge>
          </>
        ) : (
          <Badge variant="outline">{formatKm(station.distanza)}</Badge>
        )}
        <FreshnessBadge date={station.data} />
      </div>

      {freshness.timestamp !== null && (
        <p className="text-xs text-muted-foreground">
          Prezzo comunicato il {formatDateTime(freshness.timestamp)} · ID impianto {station.id}
        </p>
      )}

      <DirectionsButton station={station} />
    </div>
  )
}
