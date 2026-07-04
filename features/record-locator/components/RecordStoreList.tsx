import { ExternalLink, MapPin, Phone, Star } from 'lucide-react';
import type { RecordStore } from '../types';
import { formatDistanceMeters } from '../utils/geo';

type RecordStoreListProps = {
  stores: RecordStore[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
};

export function RecordStoreList({ stores, selectedIds, onToggleSelect }: RecordStoreListProps) {
  if (stores.length === 0) {
    return (
      <div className="record-locator-state" data-testid="record-locator-empty-list">
        <p>No record stores match your filters nearby.</p>
      </div>
    );
  }

  return (
    <div className="record-locator-list" data-testid="record-locator-shop-list">
      {stores.map((store) => {
        const selected = selectedIds.has(store.id);
        return (
          <article
            key={store.id}
            className={`record-locator-card${selected ? ' record-locator-card--selected' : ''}`}
            onClick={() => onToggleSelect(store.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onToggleSelect(store.id);
              }
            }}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(store.id)}
              onClick={(event) => event.stopPropagation()}
              aria-label={`Select ${store.name}`}
            />
            <div className="min-w-0 flex-1">
              <h3 className="record-locator-card__name">{store.name}</h3>
              <p className="record-locator-card__meta">
                <MapPin className="inline h-3 w-3" strokeWidth={2} /> {store.address}
              </p>
              {store.openingHoursSummary ? (
                <p className="record-locator-card__meta">{store.openingHoursSummary}</p>
              ) : null}
              {store.phone ? (
                <p className="record-locator-card__meta">
                  <Phone className="inline h-3 w-3" strokeWidth={2} />
                  <a
                    href={`tel:${store.phone}`}
                    className="record-locator-link"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {store.phone}
                  </a>
                </p>
              ) : null}
              {store.website ? (
                <p className="record-locator-card__meta">
                  <ExternalLink className="inline h-3 w-3" strokeWidth={2} />
                  <a
                    href={store.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="record-locator-link"
                    onClick={(event) => event.stopPropagation()}
                  >
                    Website
                  </a>
                </p>
              ) : null}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {store.openNow === true ? (
                  <span className="record-locator-badge record-locator-badge--open">Open now</span>
                ) : store.openNow === false ? (
                  <span className="record-locator-badge record-locator-badge--closed">Closed</span>
                ) : null}
                {store.rating != null ? (
                  <span className="record-locator-card__meta inline-flex items-center gap-1">
                    <Star className="h-3 w-3 text-[var(--gold)]" fill="currentColor" strokeWidth={0} />
                    {store.rating.toFixed(1)}
                  </span>
                ) : null}
              </div>
            </div>
            <span className="text-xs font-medium tabular-nums text-[var(--text-secondary)]">
              {formatDistanceMeters(store.distanceMeters)}
            </span>
          </article>
        );
      })}
    </div>
  );
}