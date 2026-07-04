import { Loader2, Route } from 'lucide-react';
import type { GeoPosition, RecordStore } from '../types';
import { formatDistanceMeters } from '../utils/geo';
import { useWalkingRoute } from '../hooks/useWalkingRoute';

type RecordRoutePanelProps = {
  origin: GeoPosition;
  stores: RecordStore[];
  selectedIds: Set<string>;
  onClearSelection: () => void;
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s walk`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min walk` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function RecordRoutePanel({
  origin,
  stores,
  selectedIds,
  onClearSelection,
}: RecordRoutePanelProps) {
  const { state, computeRoute, reset } = useWalkingRoute();
  const selectedCount = selectedIds.size;

  return (
    <div className="record-locator-route-panel" data-testid="record-locator-route-panel">
      <div className="record-locator-route-actions">
        <button
          type="button"
          className="record-locator-btn record-locator-btn--primary"
          disabled={selectedCount < 2 || state.status === 'loading'}
          onClick={() =>
            void computeRoute(origin, stores, [...selectedIds])
          }
        >
          {state.status === 'loading' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Route className="h-4 w-4" />
          )}
          Plan walking route ({selectedCount})
        </button>
        {selectedCount > 0 ? (
          <button
            type="button"
            className="record-locator-btn"
            onClick={() => {
              onClearSelection();
              reset();
            }}
          >
            Clear selection
          </button>
        ) : null}
      </div>

      {state.status === 'error' ? (
        <p className="text-sm text-[var(--text-secondary)]">{state.message}</p>
      ) : null}

      {state.status === 'success' ? (
        <div data-testid="record-locator-route-result">
          <p className="mb-2 text-sm font-medium">
            {formatDistanceMeters(state.route.totalDistanceMeters)} ·{' '}
            {formatDuration(state.route.totalDurationSeconds)}
          </p>
          {state.route.legs.map((leg, index) => (
            <div key={`${leg.fromName}-${leg.toName}-${index}`} className="record-locator-leg">
              <p className="record-locator-leg__title">
                {index + 1}. {leg.fromName} → {leg.toName}
              </p>
              <p className="record-locator-card__meta">
                {formatDistanceMeters(leg.distanceMeters)} · {formatDuration(leg.durationSeconds)}
              </p>
              {leg.steps.length > 0 ? (
                <ul className="record-locator-leg__steps">
                  {leg.steps.map((step, stepIndex) => (
                    <li key={`${index}-${stepIndex}`}>{step}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}