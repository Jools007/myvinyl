import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GeoPosition, RecordStore } from '../types';
import { haversineDistanceMeters } from '../utils/geo';

type RecordStoreMapProps = {
  center: GeoPosition;
  stores: RecordStore[];
  selectedIds: Set<string>;
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

function storeMarkerIcon(selected: boolean) {
  return L.divIcon({
    className: '',
    html: `<div class="record-locator-marker${selected ? ' record-locator-marker--selected' : ''}"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

const userMarkerIcon = L.divIcon({
  className: '',
  html: '<div class="record-locator-marker record-locator-marker--user"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

export function RecordStoreMap({
  center,
  stores,
  selectedIds,
  onSelectStore,
}: RecordStoreMapProps) {
  const localStores = useMemo(
    () =>
      stores.filter(
        (store) => haversineDistanceMeters(center, store) <= LOCAL_CLUSTER_MAX_METERS
      ),
    [stores, center]
  );

  const bounds = useMemo(() => {
    if (localStores.length === 0) return null;
    const points: [number, number][] = localStores.map((s) => [s.latitude, s.longitude]);
    points.push([center.latitude, center.longitude]);
    return L.latLngBounds(points);
  }, [localStores, center]);

  const initialZoom = localStores.length === 0 ? 13 : localStores.length === 1 ? 15 : 14;

  return (
    <div className="record-locator-map-pane" data-testid="record-locator-map-pane">
      <MapContainer
        center={[center.latitude, center.longitude]}
        zoom={initialZoom}
        scrollWheelZoom
        className="record-locator-map"
        data-testid="record-locator-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapRecenter center={center} zoom={initialZoom} />
        {bounds && localStores.length > 0 ? <FitBounds bounds={bounds} /> : null}
        <Marker position={[center.latitude, center.longitude]} icon={userMarkerIcon}>
          <Popup>You are here</Popup>
        </Marker>
        {localStores.map((store) => (
          <Marker
            key={store.id}
            position={[store.latitude, store.longitude]}
            icon={storeMarkerIcon(selectedIds.has(store.id))}
            eventHandlers={{ click: () => onSelectStore(store.id) }}
          >
            <Popup>
              <strong>{store.name}</strong>
              <br />
              {store.address}
              {store.phone ? (
                <>
                  <br />
                  <a href={`tel:${store.phone}`}>{store.phone}</a>
                </>
              ) : null}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

function FitBounds({ bounds }: { bounds: L.LatLngBounds }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
  }, [bounds, map]);
  return null;
}