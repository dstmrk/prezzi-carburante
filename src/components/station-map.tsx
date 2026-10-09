import L from 'leaflet'
import { useEffect, useMemo, useRef } from 'react'
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import { StationDetails } from '@/components/station-details'
import { formatPrice } from '@/lib/format'
import type { RoutePoint, SearchCenter, SearchMode, Station } from '@/lib/types'

const ITALY_CENTER: L.LatLngTuple = [42.5, 12.5]
const ITALY_ZOOM = 6

function priceIcon(
  station: Station,
  { selected, cheapest }: { selected: boolean; cheapest: boolean },
) {
  const classes = [
    'price-pin',
    cheapest && 'price-pin--cheapest',
    selected && 'price-pin--selected',
  ]
    .filter(Boolean)
    .join(' ')
  return L.divIcon({
    className: '',
    html: `<div class="${classes}">${formatPrice(station.prezzo)}</div>`,
    iconSize: [56, 30],
    iconAnchor: [28, 30],
    popupAnchor: [0, -28],
  })
}

const centerIcon = L.divIcon({
  className: '',
  html: '<div class="center-pin"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

function MapClickHandler({ onClick }: { onClick: (lat: number, lon: number) => void }) {
  // Un click sulla mappa con un popup aperto serve a chiuderlo, non a spostare la ricerca.
  const popupClosedAt = useRef(0)
  useMapEvents({
    popupclose: () => {
      popupClosedAt.current = performance.now()
    },
    click: (event) => {
      if (performance.now() - popupClosedAt.current < 300) return
      onClick(event.latlng.lat, event.latlng.lng)
    },
  })
  return null
}

/** Ricalcola le dimensioni quando la mappa torna visibile (layout mobile). */
function VisibilityHandler({ visible }: { visible: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (visible) map.invalidateSize()
  }, [map, visible])
  return null
}

/** Inquadra risultati e punto di ricerca ogni volta che arriva una nuova ricerca. */
function FitBounds({
  points,
  fitKey,
  visible,
}: {
  points: L.LatLngTuple[]
  fitKey: string
  visible: boolean
}) {
  const map = useMap()
  const fittedKey = useRef<string | null>(null)
  useEffect(() => {
    if (!visible || fittedKey.current === fitKey || points.length === 0) return
    fittedKey.current = fitKey
    map.invalidateSize()
    if (points.length === 1) map.setView(points[0]!, 14)
    else map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 15 })
  }, [map, points, fitKey, visible])
  return null
}

/** Centra la stazione selezionata e, su desktop, ne apre il popup. */
function FocusSelected({
  station,
  visible,
  markers,
}: {
  station: Station | null
  visible: boolean
  markers: React.RefObject<Map<number, L.Marker>>
}) {
  const map = useMap()
  useEffect(() => {
    if (!station || !visible) return
    const target = L.latLng(station.latitudine, station.longitudine)
    if (!map.getBounds().pad(-0.2).contains(target)) map.panTo(target)
    markers.current.get(station.id)?.openPopup()
  }, [map, station, visible, markers])
  return null
}

interface StationMapProps {
  mode: SearchMode
  fuel: string
  stations: Station[]
  selected: Station | null
  onSelect: (station: Station) => void
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
  center,
  radiusKm,
  routePoints,
  onMapClick,
  showPopups,
  visible,
}: StationMapProps) {
  const markers = useRef(new Map<number, L.Marker>())
  const cheapestPrice = stations.length ? Math.min(...stations.map((s) => s.prezzo)) : null

  const fitPoints = useMemo<L.LatLngTuple[]>(() => {
    const points: L.LatLngTuple[] = stations.map((s) => [s.latitudine, s.longitudine])
    if (mode === 'vicino' && center) points.push([center.lat, center.lon])
    if (mode === 'percorso') points.push(...routePoints)
    return points
  }, [stations, center, mode, routePoints])
  const fitKey = useMemo(
    () => `${mode}|${center?.lat},${center?.lon}|${stations.map((s) => s.id).join(',')}`,
    [mode, center, stations],
  )

  return (
    <MapContainer
      center={ITALY_CENTER}
      zoom={ITALY_ZOOM}
      zoomControl={false}
      className="size-full"
      aria-label="Mappa dei distributori"
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
      />
      <ZoomControl position="bottomright" />
      <MapClickHandler onClick={onMapClick} />
      <VisibilityHandler visible={visible} />
      <FitBounds points={fitPoints} fitKey={fitKey} visible={visible} />
      <FocusSelected station={selected} visible={visible} markers={markers} />

      {mode === 'vicino' && center && (
        <>
          <Circle
            center={[center.lat, center.lon]}
            radius={radiusKm * 1000}
            className="search-radius"
            interactive={false}
          />
          <Marker position={[center.lat, center.lon]} icon={centerIcon} interactive={false} />
        </>
      )}

      {routePoints.length > 0 && (
        <>
          <Polyline positions={routePoints} className="route-line" interactive={false} />
          {routePoints.map((point, index) => (
            <CircleMarker
              key={`${index}-${point.join(',')}`}
              center={point}
              radius={5}
              className="route-vertex"
              interactive={false}
            />
          ))}
        </>
      )}

      {stations.map((station) => (
        <Marker
          key={station.id}
          position={[station.latitudine, station.longitudine]}
          icon={priceIcon(station, {
            selected: station.id === selected?.id,
            cheapest: station.prezzo === cheapestPrice,
          })}
          zIndexOffset={
            station.id === selected?.id ? 1000 : station.prezzo === cheapestPrice ? 500 : 0
          }
          title={`${station.gestore}, ${formatPrice(station.prezzo)} €`}
          eventHandlers={{ click: () => onSelect(station) }}
          ref={(marker) => {
            if (marker) markers.current.set(station.id, marker)
            else markers.current.delete(station.id)
          }}
        >
          {showPopups && (
            <Popup minWidth={300} maxWidth={340} className="station-popup">
              <StationDetails station={station} fuel={fuel} />
            </Popup>
          )}
        </Marker>
      ))}
    </MapContainer>
  )
}
