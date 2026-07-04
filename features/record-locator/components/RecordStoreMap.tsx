import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GeoPosition, RecordStore } from '../types';

type RecordStoreMapProps = {
  center: GeoPosition;
  stores: RecordStore[];
  selectedIds: Set<string>;
  onSelectStore: (id: string) => void;
};

function MapRecenter({ center }: { center: GeoPosition }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.latitude, center.longitude], map.getZoom(), { animate: true });
  }, [center.latitude, center.longitude, map]);
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

export function RecordStoreMap({
  center,
  stores,
  selectedIds,
  onSelectStore,
}: RecordStoreMapProps) {
  const bounds = useMemo(() => {
    if (stores.length === 0) return null;
    const points: [number, number][] = stores.map((s) => [s.latitude, s.longitude]);
    points.push([center.latitude, center.longitude]);
    return L.latLngBounds(points);
  }, [stores, center]);

  return (
    <div className="record-locator-map-pane" data-testid="record-locator-map-pane">
      <MapContainer
        center={[center.latitude, center.longitude]}
        zoom={14}
        scrollWheelZoom
        className="record-locator-map"
        data-testid="record-locator-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapRecenter center={center} />
        {bounds && stores.length > 1 ? (
          <FitBounds bounds={bounds} />
        ) : null}
        <Marker position={[center.latitude, center.longitude]} icon={storeMarkerIcon(false)}>
          <Popup>You are here</Popup>
        </Marker>
        {stores.map((store) => (
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
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [bounds, map]);
  return null;
}