import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Navigation } from 'lucide-react';
import { RecordStorePhoto } from './RecordStorePhoto';
import type { GeoPosition, RecordStore } from '../types';
import { mapTileConfig, useMapTheme } from '../hooks/useMapTheme';
import { formatDistanceMeters, haversineDistanceMeters } from '../utils/geo';
import { buildDirectionsUrl, detectMapsProvider } from '../utils/mapsLinks';
import { resolveStoreOpenNow } from '../utils/openNow';
import { buildStoreRankMap } from '../utils/storeRanks';

type RecordStoreMapProps = {
  center: GeoPosition;
  stores: RecordStore[];
  selectedStoreId: string | null;
  onSelectStore: (id: string) => void;
};

const LOCAL_CLUSTER_MAX_METERS = 25_000;

function MapRecenter({ center, zoom }: { center: GeoPosition; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.latitude, center.longitude], zoom, { animate: true });
  }, [center.latitude, center.longitude, zoom, map]);
  return null;
}

function FlyToSelected({ store, zoom = 16 }: { store: RecordStore | null; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (!store) return;
    map.flyTo([store.latitude, store.longitude], zoom, { duration: 0.55 });
  }, [store, zoom, map]);
  return null;
}

function storeMarkerIcon(rank: number, selected: boolean, openNow: boolean | undefined) {
  const statusClass =
    openNow === true
      ? ' record-locator-pin--open'
      : openNow === false
        ? ' record-locator-pin--closed'
        : ' record-locator-pin--unknown';
  const selectedClass = selected ? ' record-locator-pin--selected' : '';
  return L.divIcon({
    className: '',
    html: `<div class="record-locator-pin${statusClass}${selectedClass}" aria-hidden="true"><span class="record-locator-pin__num">${rank}</span></div>`,
    iconSize: [34, 42],
    iconAnchor: [17, 42],
  });
}

const userMarkerIcon = L.divIcon({
  className: '',
  html: '<div class="record-locator-pin record-locator-pin--user" aria-hidden="true"><span class="record-locator-pin__you">You</span></div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

export function RecordStoreMap({
  center,
  stores,
  selectedStoreId,
  onSelectStore,
}: RecordStoreMapProps) {
  const mapTheme = useMapTheme();
  const tiles = mapTileConfig(mapTheme);
  const mapsProvider = detectMapsProvider();
  const ranks = useMemo(() => buildStoreRankMap(stores), [stores]);

  const localStores = useMemo(
    () =>
      stores.filter(
        (store) => haversineDistanceMeters(center, store) <= LOCAL_CLUSTER_MAX_METERS
      ),
    [stores, center]
  );

  const selectedStore = useMemo(
    () => localStores.find((store) => store.id === selectedStoreId) ?? null,
    [localStores, selectedStoreId]
  );

  const bounds = useMemo(() => {
    if (localStores.length === 0) return null;
    const points: [number, number][] = localStores.map((s) => [s.latitude, s.longitude]);
    points.push([center.latitude, center.longitude]);
    return L.latLngBounds(points);
  }, [localStores, center]);

  const initialZoom = localStores.length === 0 ? 13 : localStores.length === 1 ? 15 : 14;
  const selectedOpenNow = selectedStore ? resolveStoreOpenNow(selectedStore) : undefined;
  const selectedRank = selectedStore ? ranks.get(selectedStore.id) : undefined;
  const selectedDirectionsUrl = selectedStore
    ? buildDirectionsUrl(
        { latitude: selectedStore.latitude, longitude: selectedStore.longitude },
        selectedStore.name,
        center,
        mapsProvider
      )
    : null;

  return (
    <div className="record-locator-map-pane" data-testid="record-locator-map-pane">
      {selectedStore && selectedDirectionsUrl ? (
        <div className="record-locator-map-chip" data-testid="record-locator-map-chip">
          {selectedStore.photoUrl ? (
            <RecordStorePhoto
              photoUrl={selectedStore.photoUrl}
              name={selectedStore.name}
              className="record-locator-photo--chip"
            />
          ) : (
            <span className="record-locator-map-chip__rank">{selectedRank}</span>
          )}
          <div className="record-locator-map-chip__copy">
            <strong>{selectedStore.name}</strong>
            <span>
              {formatDistanceMeters(selectedStore.distanceMeters)}
              {selectedOpenNow === true
                ? ' · Open now'
                : selectedOpenNow === false
                  ? ' · Closed'
                  : ''}
            </span>
          </div>
          <a
            href={selectedDirectionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="record-locator-map-chip__go"
          >
            <Navigation className="h-4 w-4" />
            Go
          </a>
        </div>
      ) : (
        <div className="record-locator-map-chip record-locator-map-chip--idle">
          <span>Tap a numbered pin or shop in the list</span>
        </div>
      )}

      <MapContainer
        center={[center.latitude, center.longitude]}
        zoom={initialZoom}
        scrollWheelZoom
        className="record-locator-map"
        data-testid="record-locator-map"
      >
        <TileLayer attribution={tiles.attribution} url={tiles.url} />
        <MapRecenter center={center} zoom={initialZoom} />
        {bounds && localStores.length > 0 && !selectedStore ? <FitBounds bounds={bounds} /> : null}
        <FlyToSelected store={selectedStore} />
        <Marker position={[center.latitude, center.longitude]} icon={userMarkerIcon} />
        {localStores.map((store) => {
          const selected = selectedStoreId === store.id;
          const openNow = resolveStoreOpenNow(store);
          const rank = ranks.get(store.id) ?? 0;
          return (
            <Marker
              key={store.id}
              position={[store.latitude, store.longitude]}
              icon={storeMarkerIcon(rank, selected, openNow)}
              zIndexOffset={selected ? 1000 : rank}
              eventHandlers={{ click: () => onSelectStore(store.id) }}
            />
          );
        })}
      </MapContainer>

      <div className="record-locator-map-legend" aria-hidden="true">
        <span>
          <i className="record-locator-legend-dot record-locator-legend-dot--open" /> Open
        </span>
        <span>
          <i className="record-locator-legend-dot record-locator-legend-dot--closed" /> Closed
        </span>
        <span>
          <i className="record-locator-legend-dot record-locator-legend-dot--unknown" /> Unknown
        </span>
      </div>
    </div>
  );
}

function FitBounds({ bounds }: { bounds: L.LatLngBounds }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [72, 72], maxZoom: 16 });
  }, [bounds, map]);
  return null;
}