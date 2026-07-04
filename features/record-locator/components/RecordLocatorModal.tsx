import { lazy, Suspense, useMemo, useState } from 'react';
import { Loader2, MapPin, Navigation, RefreshCw, X } from 'lucide-react';
import { useGeolocation } from '../hooks/useGeolocation';
import { useNearbyRecordStores } from '../hooks/useNearbyRecordStores';
import { filterOpenNowStores } from '../utils/openNow';
import { findNearestOpenStore } from '../utils/nearestOpenStore';
import { buildStoreRankMap } from '../utils/storeRanks';
import { RecordLocatorQuickAction } from './RecordLocatorQuickAction';
import { RecordStoreList } from './RecordStoreList';
import '../styles/record-locator.css';

const RecordStoreMap = lazy(() =>
  import('./RecordStoreMap').then((mod) => ({ default: mod.RecordStoreMap }))
);

type RecordLocatorModalProps = {
  onClose: () => void;
};

function sourceLabel(source: string | undefined, googleEnriched?: boolean): string {
  switch (source) {
    case 'google':
      return 'Google Places';
    case 'osm':
      return googleEnriched ? 'OpenStreetMap + Google details' : 'OpenStreetMap';
    case 'combined':
      return 'Google Places + OpenStreetMap';
    case 'fixture':
      return 'Demo data';
    default:
      return 'Local search';
  }
}

export function RecordLocatorModal({ onClose }: RecordLocatorModalProps) {
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const { state: geoState, requestLocation } = useGeolocation(true);
  const position = geoState.status === 'granted' ? geoState.position : null;
  const { state: storesState, retry } = useNearbyRecordStores(position);

  const visibleStores = useMemo(() => {
    if (storesState.status !== 'success') return [];
    return openNowOnly
      ? filterOpenNowStores(storesState.stores)
      : storesState.stores;
  }, [storesState, openNowOnly]);

  const nearestOpenStore = useMemo(
    () => findNearestOpenStore(storesState.status === 'success' ? storesState.stores : []),
    [storesState]
  );

  const nearestOpenRank = useMemo(() => {
    if (storesState.status !== 'success' || !nearestOpenStore) return 0;
    return buildStoreRankMap(storesState.stores).get(nearestOpenStore.id) ?? 0;
  }, [storesState, nearestOpenStore]);

  const locationBanner =
    storesState.status === 'success'
      ? storesState.meta.locationLabel
      : geoState.status === 'granted'
        ? `${geoState.position.latitude.toFixed(4)}°, ${geoState.position.longitude.toFixed(4)}°`
        : null;

  const handleSelectStore = (id: string) => {
    setSelectedStoreId((current) => (current === id ? null : id));
  };

  return (
    <div
      className="record-locator-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-locator-title"
      data-testid="record-locator-modal"
    >
      <div className="record-locator-shell">
        <header className="record-locator-header">
          <div>
            <h2 id="record-locator-title" className="record-locator-title">
              Record Store Locator
            </h2>
            <p className="record-locator-subtitle">
              Numbered pins match the list. <strong>Go</strong> jumps to the nearest open shop.
            </p>
          </div>
          <button
            type="button"
            className="record-locator-close"
            onClick={onClose}
            aria-label="Close record store locator"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {locationBanner ? (
          <div className="record-locator-location-bar" data-testid="record-locator-location-bar">
            <Navigation className="h-4 w-4 shrink-0 text-[var(--accent)]" />
            <span className="truncate">{locationBanner}</span>
            {geoState.status === 'granted' && geoState.accuracyMeters != null ? (
              <span className="record-locator-location-bar__accuracy">
                ±{Math.round(geoState.accuracyMeters)} m
              </span>
            ) : null}
            <button
              type="button"
              className="record-locator-location-bar__refresh"
              onClick={requestLocation}
              aria-label="Refresh location"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        <div className="record-locator-body">
          <aside className="record-locator-sidebar">
            {geoState.status === 'requesting' || storesState.status === 'loading' ? (
              <div className="record-locator-state">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
                <p>
                  {geoState.status === 'requesting'
                    ? 'Pinpointing your location…'
                    : 'Searching record shops near you…'}
                </p>
              </div>
            ) : null}

            {geoState.status === 'denied' || geoState.status === 'error' ? (
              <div className="record-locator-state">
                <MapPin className="h-6 w-6 text-[var(--accent)]" />
                <p>{geoState.message}</p>
                <button type="button" className="record-locator-btn" onClick={requestLocation}>
                  Use my location
                </button>
              </div>
            ) : null}

            {storesState.status === 'error' ? (
              <div className="record-locator-state">
                <p>{storesState.message}</p>
                {retry ? (
                  <button type="button" className="record-locator-btn" onClick={retry}>
                    Retry search
                  </button>
                ) : null}
              </div>
            ) : null}

            {storesState.status === 'success' ? (
              <>
                <div className="record-locator-toolbar">
                  <div className="min-w-0">
                    <span className="text-xs text-[var(--text-secondary)]">
                      {visibleStores.length} shop{visibleStores.length === 1 ? '' : 's'} · sorted by distance
                    </span>
                    <span className="record-locator-source-pill">
                      {sourceLabel(storesState.meta.source, storesState.meta.googleEnriched)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`record-locator-filter${openNowOnly ? ' record-locator-filter--active' : ''}`}
                    onClick={() => {
                      setOpenNowOnly((value) => !value);
                      setSelectedStoreId(null);
                    }}
                    aria-pressed={openNowOnly}
                    data-testid="record-locator-open-now-filter"
                  >
                    Open now
                  </button>
                </div>

                {nearestOpenStore && nearestOpenRank > 0 && !openNowOnly ? (
                  <RecordLocatorQuickAction
                    store={nearestOpenStore}
                    rank={nearestOpenRank}
                    userPosition={position}
                    variant="inline"
                    onSelect={() => handleSelectStore(nearestOpenStore.id)}
                  />
                ) : null}

                <RecordStoreList
                  stores={visibleStores}
                  selectedStoreId={selectedStoreId}
                  userPosition={position}
                  onSelectStore={handleSelectStore}
                  openNowOnly={openNowOnly}
                />
              </>
            ) : null}
          </aside>

          <div className="record-locator-map-column">
            {position && storesState.status === 'success' ? (
              <Suspense
                fallback={
                  <div className="record-locator-map-pane record-locator-state">
                    <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
                    <p>Loading map…</p>
                  </div>
                }
              >
                <RecordStoreMap
                  center={position}
                  stores={visibleStores}
                  selectedStoreId={selectedStoreId}
                  onSelectStore={handleSelectStore}
                />
              </Suspense>
            ) : (
              <div
                className="record-locator-map-pane record-locator-state"
                data-testid="record-locator-map-placeholder"
              >
                <MapPin className="h-8 w-8 text-[var(--text-muted)]" />
                <p>Map appears once your location and nearby shops load.</p>
              </div>
            )}
          </div>
        </div>

        {nearestOpenStore && nearestOpenRank > 0 && storesState.status === 'success' && !openNowOnly ? (
          <RecordLocatorQuickAction
            store={nearestOpenStore}
            rank={nearestOpenRank}
            userPosition={position}
            variant="sticky"
            onSelect={() => handleSelectStore(nearestOpenStore.id)}
          />
        ) : null}
      </div>
    </div>
  );
}