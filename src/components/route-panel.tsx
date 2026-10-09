import { MapIcon, SearchIcon, Trash2Icon, Undo2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Card, CardContent } from '@/components/ui/card'
import { formatKm } from '@/lib/format'
import { routeLengthKm } from '@/lib/route'
import type { RoutePoint } from '@/lib/types'
import { cn } from '@/lib/utils'

interface RouteControlsProps {
  points: RoutePoint[]
  /** Il percorso è cambiato rispetto all'ultima ricerca. */
  dirty: boolean
  searching: boolean
  onUndo: () => void
  onClear: () => void
  onSearch: () => void
  className?: string
}

/** Riepilogo del percorso e comandi: nel pannello laterale e sopra la mappa su mobile. */
export function RouteControls({
  points,
  dirty,
  searching,
  onUndo,
  onClear,
  onSearch,
  className,
}: RouteControlsProps) {
  const stops = points.length
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {stops === 0
            ? 'Nessuna tappa'
            : `${stops} ${stops === 1 ? 'tappa' : 'tappe'} · ${formatKm(routeLengthKm(points))}`}
        </span>
        <ButtonGroup>
          <Button variant="outline" size="sm" onClick={onUndo} disabled={stops === 0}>
            <Undo2Icon />
            Annulla
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={onClear}
            disabled={stops === 0}
            aria-label="Cancella percorso"
          >
            <Trash2Icon />
          </Button>
        </ButtonGroup>
      </div>
      <Button onClick={onSearch} disabled={stops < 2 || searching || !dirty}>
        <SearchIcon />
        {stops < 2
          ? 'Aggiungi almeno due tappe'
          : dirty
            ? 'Cerca lungo il percorso'
            : 'Risultati aggiornati'}
      </Button>
    </div>
  )
}

interface RoutePanelProps extends RouteControlsProps {
  isDesktop: boolean
  onOpenMap: () => void
}

export function RoutePanel({ isDesktop, onOpenMap, ...controls }: RoutePanelProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {isDesktop
          ? 'Clicca sulla mappa per aggiungere le tappe del tragitto, nell’ordine in cui le percorri.'
          : 'Apri la mappa e tocca per aggiungere le tappe del tragitto, nell’ordine in cui le percorri.'}
      </p>
      {isDesktop ? (
        <RouteControls {...controls} />
      ) : (
        <Button variant="outline" onClick={onOpenMap}>
          <MapIcon />
          {controls.points.length ? 'Modifica il percorso sulla mappa' : 'Disegna sulla mappa'}
        </Button>
      )}
    </div>
  )
}

export function RouteOverlay(props: RouteControlsProps) {
  return (
    <Card size="sm" className="shadow-lg">
      <CardContent>
        <RouteControls {...props} />
      </CardContent>
    </Card>
  )
}
