import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { FuelIcon, ListIcon, MapIcon, MapPinIcon, RouteIcon } from 'lucide-react'
import { type MouseEvent, Suspense, lazy, useEffect, useState } from 'react'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { AppFooter } from '@/components/app-footer'
import { LocationSearch } from '@/components/location-search'
import { RouteOverlay, RoutePanel } from '@/components/route-panel'
import { SearchFilters } from '@/components/search-filters'
import { StationDrawer } from '@/components/station-drawer'
import { StationList } from '@/components/station-list'
import { ThemeToggle } from '@/components/theme-toggle'
import { useIsDesktop } from '@/hooks/use-media-query'
import { useStoredState } from '@/hooks/use-stored-state'
import { ApiRequestError, fetchAlongRoute, fetchNearby } from '@/lib/api'
import { reverseGeocode } from '@/lib/geocode'
import {
  DEFAULT_FILTERS,
  type Filters,
  type RoutePoint,
  type SearchCenter,
  type SearchMode,
  type Station,
} from '@/lib/types'
import { cn } from '@/lib/utils'

// MapLibre pesa: lo carichiamo a parte, così su mobile la lista appare subito.
const StationMap = lazy(() => import('@/components/station-map'))

type MobileView = 'lista' | 'mappa'

/** Mentre il server scarica i dati risponde 503: ritentiamo a lungo, il resto una volta sola. */
function retryPolicy(failureCount: number, error: Error): boolean {
  if (error instanceof ApiRequestError && error.isWarmingUp) return failureCount < 30
  if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) return false
  return failureCount < 1
}

function retryDelay(_attempt: number, error: Error): number {
  return error instanceof ApiRequestError && error.isWarmingUp ? 3000 : 1000
}

function sameRoute(a: RoutePoint[], b: RoutePoint[] | null): boolean {
  return (
    b !== null && a.length === b.length && a.every((p, i) => p[0] === b[i]![0] && p[1] === b[i]![1])
  )
}

export default function App() {
  const isDesktop = useIsDesktop()
  const [mode, setMode] = useStoredState<SearchMode>('mode', 'vicino')
  const [storedFilters, setFilters] = useStoredState<Filters>('filters', DEFAULT_FILTERS)
  const filters = { ...DEFAULT_FILTERS, ...storedFilters }
  const [center, setCenter] = useState<SearchCenter | null>(null)
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([])
  const [submittedRoute, setSubmittedRoute] = useState<RoutePoint[] | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [mobileView, setMobileView] = useState<MobileView>('lista')
  // Cambiarla rimonta l'interfaccia: svuota i campi di ricerca e riporta la mappa sull'Italia.
  const [resetKey, setResetKey] = useState(0)

  const nearbyParams =
    mode === 'vicino' && center
      ? {
          lat: center.lat,
          lon: center.lon,
          fuel: filters.fuel,
          radiusKm: filters.radiusKm,
          results: filters.results,
          maxAgeDays: filters.maxAgeDays,
        }
      : null
  const nearby = useQuery({
    queryKey: ['distributori', nearbyParams],
    queryFn: ({ signal }) => fetchNearby(nearbyParams!, signal),
    enabled: nearbyParams !== null,
    placeholderData: keepPreviousData,
    retry: retryPolicy,
    retryDelay,
  })

  const routeBody =
    mode === 'percorso' && submittedRoute
      ? {
          points: submittedRoute,
          fuel: filters.fuel,
          distance: filters.corridorKm,
          results: filters.results,
          maxAge: filters.maxAgeDays,
        }
      : null
  const route = useQuery({
    queryKey: ['percorso', routeBody],
    queryFn: ({ signal }) => fetchAlongRoute(routeBody!, signal),
    enabled: routeBody !== null,
    placeholderData: keepPreviousData,
    retry: retryPolicy,
    retryDelay,
  })

  const active = mode === 'vicino' ? nearbyParams !== null : routeBody !== null
  const query = mode === 'vicino' ? nearby : route
  const stations: Station[] = (active && query.data) || []
  const selected = stations.find((s) => s.id === selectedId) ?? null

  // Su desktop la selezione dalla mappa porta in vista la riga corrispondente.
  useEffect(() => {
    if (selectedId === null || !isDesktop) return
    document
      .querySelector(`[data-station-id="${selectedId}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedId, isDesktop])

  function updateFilters(patch: Partial<Filters>) {
    setFilters((current) => ({ ...DEFAULT_FILTERS, ...current, ...patch }))
  }

  function selectStation(station: Station) {
    setSelectedId(station.id)
    if (!isDesktop) setDrawerOpen(true)
  }

  function chooseCenter(place: SearchCenter) {
    setCenter(place)
    setSelectedId(null)
  }

  function handleMapClick(lat: number, lon: number) {
    if (mode === 'percorso') {
      setRoutePoints((points) => [...points, [lat, lon]])
      return
    }
    chooseCenter({ lat, lon, label: 'Punto scelto sulla mappa' })
    reverseGeocode(lat, lon)
      .then((label) => {
        if (label) setCenter((c) => (c && c.lat === lat && c.lon === lon ? { ...c, label } : c))
      })
      .catch(() => {})
  }

  function resetAll(event: MouseEvent<HTMLAnchorElement>) {
    // Con i tasti modificatori il link si apre altrove, come ogni altro link.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
      return
    event.preventDefault()
    setMode('vicino')
    setFilters(DEFAULT_FILTERS)
    setCenter(null)
    setRoutePoints([])
    setSubmittedRoute(null)
    setSelectedId(null)
    setDrawerOpen(false)
    setMobileView('lista')
    setResetKey((key) => key + 1)
  }

  const routeControls = {
    points: routePoints,
    dirty: !sameRoute(routePoints, submittedRoute),
    searching: route.isFetching,
    onUndo: () => setRoutePoints((points) => points.slice(0, -1)),
    onClear: () => {
      setRoutePoints([])
      setSubmittedRoute(null)
      setSelectedId(null)
    },
    onSearch: () => {
      setSubmittedRoute(routePoints)
      setSelectedId(null)
    },
  }

  const showList = isDesktop || mobileView === 'lista'
  const showMap = isDesktop || mobileView === 'mappa'

  return (
    <div key={resetKey} className="flex h-dvh flex-col overflow-hidden md:flex-row">
      <aside
        className={cn(
          'flex min-h-0 flex-1 flex-col bg-background md:w-[380px] md:flex-none md:border-r lg:w-[420px]',
          !showList && 'hidden',
        )}
      >
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h1 className="font-heading text-lg font-semibold">
            <a
              href="/"
              onClick={resetAll}
              title="Nuova ricerca"
              className="flex items-center gap-2 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <FuelIcon className="size-4.5" />
              </span>
              Prezzi Carburante
            </a>
          </h1>
          <ThemeToggle />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-5 p-4">
            <Tabs value={mode} onValueChange={(value) => setMode(value as SearchMode)}>
              <TabsList className="w-full">
                <TabsTrigger value="vicino">
                  <MapPinIcon />
                  Vicino a
                </TabsTrigger>
                <TabsTrigger value="percorso">
                  <RouteIcon />
                  Lungo un percorso
                </TabsTrigger>
              </TabsList>
              <TabsContent value="vicino" className="pt-2">
                <LocationSearch currentLabel={center?.label ?? null} onSelect={chooseCenter} />
              </TabsContent>
              <TabsContent value="percorso" className="pt-2">
                <RoutePanel
                  {...routeControls}
                  isDesktop={isDesktop}
                  onOpenMap={() => setMobileView('mappa')}
                />
              </TabsContent>
            </Tabs>

            <SearchFilters
              mode={mode}
              filters={filters}
              onChange={updateFilters}
              compact={!isDesktop}
            />
            <Separator />
            <StationList
              mode={mode}
              fuel={filters.fuel}
              active={active}
              stations={active ? query.data : undefined}
              isLoading={query.isPending && query.fetchStatus === 'fetching'}
              isFetching={query.isFetching}
              warmingUp={
                query.failureReason instanceof ApiRequestError && query.failureReason.isWarmingUp
              }
              error={query.error}
              onRetry={() => void query.refetch()}
              selectedId={selectedId}
              onSelect={selectStation}
            />
          </div>
          <AppFooter />
          {/* Spazio per il selettore Lista/Mappa flottante. */}
          <div className="h-20 md:hidden" />
        </div>
      </aside>

      <main className={cn('relative isolate min-h-0 flex-1', !showMap && 'hidden')}>
        <Suspense fallback={<Skeleton className="size-full rounded-none" />}>
          <StationMap
            mode={mode}
            fuel={filters.fuel}
            stations={stations}
            selected={selected}
            onSelect={selectStation}
            onDeselect={() => setSelectedId(null)}
            center={center}
            radiusKm={filters.radiusKm}
            routePoints={routePoints}
            onMapClick={handleMapClick}
            showPopups={isDesktop}
            visible={showMap}
          />
        </Suspense>
        {!isDesktop && mode === 'percorso' && (
          <div className="absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[1000]">
            <RouteOverlay {...routeControls} />
          </div>
        )}
      </main>

      {!isDesktop && (
        <>
          <div
            className={cn(
              'pointer-events-none fixed inset-x-0 z-40 flex justify-center',
              // Sulla mappa sta sopra l'attribuzione di OpenStreetMap, che deve restare leggibile.
              mobileView === 'mappa'
                ? 'bottom-[max(2.75rem,env(safe-area-inset-bottom))]'
                : 'bottom-[max(1rem,env(safe-area-inset-bottom))]',
            )}
          >
            <ToggleGroup
              variant="outline"
              spacing={0}
              value={[mobileView]}
              onValueChange={(value) => value[0] && setMobileView(value[0] as MobileView)}
              aria-label="Vista"
              className="pointer-events-auto rounded-full bg-background shadow-lg"
            >
              <ToggleGroupItem value="lista" className="rounded-l-full! px-4">
                <ListIcon />
                Lista
              </ToggleGroupItem>
              <ToggleGroupItem value="mappa" className="rounded-r-full! px-4">
                <MapIcon />
                Mappa
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <StationDrawer
            station={selected}
            fuel={filters.fuel}
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            onShowOnMap={
              mobileView === 'lista'
                ? () => {
                    setDrawerOpen(false)
                    setMobileView('mappa')
                  }
                : undefined
            }
          />
        </>
      )}
    </div>
  )
}
