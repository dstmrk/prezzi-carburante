import type * as GeoJSON from 'geojson'
import { LngLatBounds } from 'maplibre-gl'
import { useEffect, useEffectEvent, useMemo, useRef } from 'react'
import {
  Map,
  MapControls,
  MapGeoJSON,
  MapMarker,
  MapPopup,
  MapRoute,
  MarkerContent,
  useMap,
} from '@/components/ui/map'
import { StationDetails } from '@/components/station-details'
import { formatPrice } from '@/lib/format'
import type { RoutePoint, SearchCenter, SearchMode, Station } from '@/lib/types'
import { cn } from '@/lib/utils'

const ITALY_CENTER: [number, number] = [12.5, 42.1]
const ITALY_ZOOM = 4.8

// MapLibre non legge le variabili CSS: questi sono i valori di --primary.
const PRIMARY_COLOR = { light: '#059669', dark: '#10b981' } as const

type LngLat = [number, number]

function toLngLat([lat, lon]: RoutePoint): LngLat {
  return [lon, lat]
}

/** Poligono che approssima un cerchio di `radiusKm` attorno al centro. */
function circlePolygon(center: SearchCenter, radiusKm: number, steps = 64): GeoJSON.Polygon {
  const latRadius = radiusKm / 110.574
  const lonRadius = radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180))
  const ring: LngLat[] = []
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI
    ring.push([center.lon + lonRadius * Math.cos(angle), center.lat + latRadius * Math.sin(angle)])
  }
  return { type: 'Polygon', coordinates: [ring] }
}

function PricePin({
  station,
  selected,
  cheapest,
}: {
  station: Station
  selected: boolean
  cheapest: boolean
}) {
  return (
    <div
      className={cn(
        'relative flex h-6 items-center rounded-full border bg-background px-2 text-xs font-semibold text-foreground tabular-nums shadow-md transition-transform',
        "after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-x-[5px] after:border-t-[6px] after:border-x-transparent after:border-t-background after:content-['']",
        cheapest && 'border-primary bg-primary text-primary-foreground after:border-t-primary',
        selected && 'scale-115 ring-2 ring-ring ring-offset-2 ring-offset-background',
      )}
    >
      {formatPrice(station.prezzo)}
    </div>
  )
}

interface MapBehaviorProps {
  visible: boolean
  fitPoints: LngLat[]
  fitKey: string
  selected: Station | null
  onClick: (lat: number, lon: number) => void
}

/** Comportamenti imperativi: click, ridimensionamento, inquadratura, focus sulla selezione. */
function MapBehavior({ visible, fitPoints, fitKey, selected, onClick }: MapBehaviorProps) {
  const { map, isLoaded } = useMap()
  const fittedKey = useRef<string | null>(null)
  const handleClick = useEffectEvent((lat: number, lon: number) => onClick(lat, lon))

  useEffect(() => {
    if (!map) return
    const listener = (event: { lngLat: { lat: number; lng: number } }) =>
      handleClick(event.lngLat.lat, event.lngLat.lng)
    map.on('click', listener)
    return () => {
      map.off('click', listener)
    }
  }, [map])

  // Nomi dei luoghi in italiano dove disponibili (gli stili OpenFreeMap usano l'inglese).
  useEffect(() => {
    if (!map) return
    const localize = () => {
      for (const layer of map.getStyle()?.layers ?? []) {
        if (layer.type !== 'symbol') continue
        const field = map.getLayoutProperty(layer.id, 'text-field')
        if (!JSON.stringify(field ?? '').includes('name')) continue
        map.setLayoutProperty(layer.id, 'text-field', [
          'coalesce',
          ['get', 'name:it'],
          ['get', 'name'],
        ])
      }
    }
    map.on('style.load', localize)
    if (map.isStyleLoaded()) localize()
    return () => {
      map.off('style.load', localize)
    }
  }, [map])

  // Su mobile la mappa resta montata ma nascosta: al ritorno va ridimensionata.
  useEffect(() => {
    if (map && visible) map.resize()
  }, [map, visible])

  useEffect(() => {
    if (!map || !isLoaded || !visible || fittedKey.current === fitKey || fitPoints.length === 0) {
      return
    }
    fittedKey.current = fitKey
    map.resize()
    if (fitPoints.length === 1) {
      map.easeTo({ center: fitPoints[0]!, zoom: 14 })
    } else {
      const bounds = fitPoints.reduce(
        (acc, point) => acc.extend(point),
        new LngLatBounds(fitPoints[0]!, fitPoints[0]!),
      )
      map.fitBounds(bounds, { padding: 56, maxZoom: 15 })
    }
  }, [map, isLoaded, visible, fitPoints, fitKey])

  useEffect(() => {
    if (!map || !visible || !selected) return
    const point = map.project([selected.longitudine, selected.latitudine])
    const { clientWidth: width, clientHeight: height } = map.getContainer()
    const margin = 0.2
    const outside =
      point.x < width * margin ||
      point.x > width * (1 - margin) ||
      point.y < height * margin ||
      point.y > height * (1 - margin)
    if (outside) map.easeTo({ center: [selected.longitudine, selected.latitudine] })
  }, [map, visible, selected])

  return null
}

function RouteLayer({ points }: { points: RoutePoint[] }) {
  const { resolvedTheme } = useMap()
  const coordinates = useMemo(() => points.map(toLngLat), [points])
  return (
    <>
      {coordinates.length >= 2 && (
        <MapRoute
          coordinates={coordinates}
          color={PRIMARY_COLOR[resolvedTheme]}
          width={5}
          opacity={0.85}
          interactive={false}
        />
      )}
      {coordinates.map(([lon, lat], index) => (
        <MapMarker key={`${index}-${lon},${lat}`} longitude={lon} latitude={lat}>
          <MarkerContent className="pointer-events-none">
            <div className="size-3 rounded-full border-2 border-white bg-primary shadow" />
          </MarkerContent>
        </MapMarker>
      ))}
    </>
  )
}

function SearchArea({ center, radiusKm }: { center: SearchCenter; radiusKm: number }) {
  const { resolvedTheme } = useMap()
  const color = PRIMARY_COLOR[resolvedTheme]
  const area = useMemo(() => circlePolygon(center, radiusKm), [center, radiusKm])
  return (
    <>
      <MapGeoJSON
        data={area}
        fillPaint={{ 'fill-color': color, 'fill-opacity': 0.06 }}
        linePaint={{ 'line-color': color, 'line-width': 1.5, 'line-dasharray': [3, 3] }}
      />
      <MapMarker longitude={center.lon} latitude={center.lat}>
        <MarkerContent className="pointer-events-none">
          <div className="size-5 rounded-full border-[3px] border-white bg-blue-500 shadow-[0_0_0_6px_rgb(59_130_246/0.25)]" />
        </MarkerContent>
      </MapMarker>
    </>
  )
}

interface StationMapProps {
  mode: SearchMode
  fuel: string
  stations: Station[]
  selected: Station | null
  onSelect: (station: Station) => void
  onDeselect: () => void
  center: SearchCenter | null
  radiusKm: number
  routePoints: RoutePoint[]
  onMapClick: (lat: number, lon: number) => void
  /** Su desktop i dettagli si aprono in un popup, su mobile in un drawer. */
  showPopups: boolean
  visible: boolean
}

export default function StationMap({
  mode,
  fuel,
  stations,
  selected,
  onSelect,
  onDeselect,
  center,
  radiusKm,
  routePoints,
  onMapClick,
  showPopups,
  visible,
}: StationMapProps) {
  const cheapestPrice = stations.length ? Math.min(...stations.map((s) => s.prezzo)) : null
  const popupOpen = showPopups && selected !== null

  const fitPoints = useMemo<LngLat[]>(() => {
    // Sul percorso si inquadra solo all'arrivo dei risultati, non mentre si aggiungono tappe.
    if (mode === 'percorso' && stations.length === 0) return []
    const points: LngLat[] = stations.map((s) => [s.longitudine, s.latitudine])
    if (mode === 'vicino' && center) points.push([center.lon, center.lat])
    if (mode === 'percorso') points.push(...routePoints.map(toLngLat))
    return points
  }, [stations, center, mode, routePoints])
  const fitKey = useMemo(
    () => `${mode}|${center?.lat},${center?.lon}|${stations.map((s) => s.id).join(',')}`,
    [mode, center, stations],
  )

  function handleMapClick(lat: number, lon: number) {
    // Con un popup aperto il click serve a chiuderlo, non a spostare la ricerca.
    if (popupOpen) {
      onDeselect()
      return
    }
    onMapClick(lat, lon)
  }

  // La stazione selezionata viene montata per ultima così il suo pin sta sopra gli altri.
  const others = stations.filter((s) => s.id !== selected?.id)

  return (
    <Map
      center={ITALY_CENTER}
      zoom={ITALY_ZOOM}
      className="size-full"
      locale={{ 'Map.Title': 'Mappa dei distributori' }}
    >
      {/* Su mobile si zooma con le dita: i pulsanti tolgono solo spazio. */}
      {showPopups && <MapControls position="bottom-right" />}
      <MapBehavior
        visible={visible}
        fitPoints={fitPoints}
        fitKey={fitKey}
        selected={selected}
        onClick={handleMapClick}
      />

      {mode === 'vicino' && center && <SearchArea center={center} radiusKm={radiusKm} />}
      {mode === 'percorso' && routePoints.length > 0 && <RouteLayer points={routePoints} />}

      {[...others, ...(selected ? [selected] : [])].map((station) => (
        <MapMarker
          key={station.id === selected?.id ? `${station.id}-selected` : station.id}
          longitude={station.longitudine}
          latitude={station.latitudine}
          anchor="bottom"
          offset={[0, -6]}
          onClick={(event) => {
            event.stopPropagation()
            onSelect(station)
          }}
        >
          <MarkerContent>
            <button
              type="button"
              aria-label={`${station.gestore}, ${formatPrice(station.prezzo)} euro`}
              className="block rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <PricePin
                station={station}
                selected={station.id === selected?.id}
                cheapest={station.prezzo === cheapestPrice}
              />
            </button>
          </MarkerContent>
        </MapMarker>
      ))}

      {popupOpen && (
        <MapPopup
          key={selected.id}
          longitude={selected.longitudine}
          latitude={selected.latitudine}
          offset={36}
          closeOnClick={false}
          closeButton
          onClose={onDeselect}
          className="w-80 max-w-none p-4"
        >
          <StationDetails station={selected} fuel={fuel} />
        </MapPopup>
      )}
    </Map>
  )
}
