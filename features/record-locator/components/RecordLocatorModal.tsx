import { lazy, Suspense, useMemo, useState } from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
import { useGeolocation } from '../hooks/useGeolocation';
import { useNearbyRecordStores } from '../hooks/useNearbyRecordStores';
import { filterOpenNowStores } from '../utils/openNow';
import { RecordStoreList } from './RecordStoreList';
import { RecordRoutePanel } from './RecordRoutePanel';
import '../styles/record-locator.css';

const RecordStoreMap = lazy(() =>
  import('./RecordStoreMap').then((mod) => ({ default: mod.RecordStoreMap }))
);

type RecordLocatorModalProps = {
  onClose: () => void;
};

export function RecordLocatorModal({ onClose }: RecordLocatorModalProps) {
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { state: geoState, requestLocation } = useGeolocation(true);
  const position = geoState.status === 'granted' ? geoState.position : null;
  const { state: storesState, retry } = useNearbyRecordStores(position);

  const visibleStores = useMemo(() => {
    if (storesState.status !== 'success') return [];
    return openNowOnly
      ? filterOpenNowStores(storesState.stores)
      : storesState.stores;
  }, [storesState, openNowOnly]);

  const visibleStoreIds = useMemo(
    () => new Set(visibleStores.map((store) => store.id)),
    [visibleStores]
  );

  const effectiveSelectedIds = useMemo(() => {
    const next = new Set<string>();
    for (const id of selectedIds) {
      if (visibleStoreIds.has(id)) next.add(id);
    }
    return next;
  }, [selectedIds, visibleStoreIds]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
              Discover vinyl shops near you and plan a walking route.
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

        <div className="record-locator-body">
          <aside className="record-locator-sidebar">
            {geoState.status === 'requesting' || storesState.status === 'loading' ? (
              <div className="record-locator-state">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
                <p>
                  {geoState.status === 'requesting'
                    ? 'Requesting your location…'
                    : 'Searching nearby record stores…'}
                </p>
              </div>
            ) : null}

            {geoState.status === 'denied' || geoState.status === 'error' ? (
              <div className="record-locator-state">
                <MapPin className="h-6 w-6 text-[var(--accent)]" />
                <p>{geoState.message}</p>
                <button type="button" className="record-locator-btn" onClick={requestLocation}>
                  Try again
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
                  <span className="text-xs text-[var(--text-secondary)]">
                    {visibleStores.length} shop{visibleStores.length === 1 ? '' : 's'}
                  </span>
                  <button
                    type="button"
                    className={`record-locator-filter${openNowOnly ? ' record-locator-filter--active' : ''}`}
                    onClick={() => setOpenNowOnly((value) => !value)}
                    aria-pressed={openNowOnly}
                    data-testid="record-locator-open-now-filter"
                  >
                    Open now
                  </button>
                </div>
                <RecordStoreList
                  stores={visibleStores}
                  selectedIds={effectiveSelectedIds}
                  onToggleSelect={toggleSelect}
                />
                {position ? (
                  <RecordRoutePanel
                    origin={position}
                    stores={visibleStores}
                    selectedIds={effectiveSelectedIds}
                    onClearSelection={() => setSelectedIds(new Set())}
                  />
                ) : null}
              </>
            ) : null}
          </aside>

          {position && storesState.status === 'success' ? (
            <Suspense
              fallback={
                <div className="record-locator-state">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
                  <p>Loading map…</p>
                </div>
              }
            >
              <RecordStoreMap
                center={position}
                stores={visibleStores}
                selectedIds={effectiveSelectedIds}
                onSelectStore={toggleSelect}
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
    </div>
  );
}