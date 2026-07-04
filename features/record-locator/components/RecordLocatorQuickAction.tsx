import { Navigation } from 'lucide-react';
import type { GeoPosition, RecordStore } from '../types';
import { formatDistanceMeters } from '../utils/geo';
import { buildDirectionsUrl, detectMapsProvider } from '../utils/mapsLinks';

type RecordLocatorQuickActionProps = {
  store: RecordStore;
  rank: number;
  userPosition?: GeoPosition | null;
  variant?: 'inline' | 'sticky';
  onSelect: () => void;
};

export function RecordLocatorQuickAction({
  store,
  rank,
  userPosition,
  variant = 'inline',
  onSelect,
}: RecordLocatorQuickActionProps) {
  const mapsProvider = detectMapsProvider();
  const directionsUrl = buildDirectionsUrl(
    { latitude: store.latitude, longitude: store.longitude },
    store.name,
    userPosition ?? undefined,
    mapsProvider
  );

  return (
    <div
      className={`record-locator-quick-action record-locator-quick-action--${variant}`}
      data-testid="record-locator-nearest-open"
    >
      <button type="button" className="record-locator-quick-action__select" onClick={onSelect}>
        <span className="record-locator-quick-action__rank">{rank}</span>
        <span className="record-locator-quick-action__copy">
          <strong>Nearest open</strong>
          <span>
            {store.name} · {formatDistanceMeters(store.distanceMeters)}
          </span>
        </span>
      </button>
      <a
        href={directionsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="record-locator-quick-action__go"
        data-testid="record-locator-nearest-open-go"
      >
        <Navigation className="h-4 w-4" />
        Go
      </a>
    </div>
  );
}