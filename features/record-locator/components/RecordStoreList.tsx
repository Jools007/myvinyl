import { Clock, ExternalLink, MapPin, Navigation, Phone, Star } from 'lucide-react';
import { RecordStorePhoto } from './RecordStorePhoto';
import { useEffect, useRef } from 'react';
import type { GeoPosition, RecordStore } from '../types';
import { formatDistanceMeters } from '../utils/geo';
import {
  buildDirectionsUrl,
  buildPlaceSearchUrl,
  detectMapsProvider,
  mapsProviderLabel,
} from '../utils/mapsLinks';
import { resolveStoreOpenNow } from '../utils/openNow';
import { buildStoreRankMap } from '../utils/storeRanks';

type RecordStoreListProps = {
  stores: RecordStore[];
  selectedStoreId: string | null;
  userPosition?: GeoPosition | null;
  onSelectStore: (id: string) => void;
  openNowOnly?: boolean;
};

export function RecordStoreList({
  stores,
  selectedStoreId,
  userPosition,
  onSelectStore,
  openNowOnly = false,
}: RecordStoreListProps) {
  const mapsProvider = detectMapsProvider();
  const ranks = buildStoreRankMap(stores);
  const selectedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!selectedStoreId) return;
    selectedRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [selectedStoreId]);

  if (stores.length === 0) {
    return (
      <div className="record-locator-state" data-testid="record-locator-empty-list">
        <p>
          {openNowOnly
            ? 'No record stores are open right now nearby. Try turning off the Open now filter.'
            : 'No record stores match your filters nearby.'}
        </p>
      </div>
    );
  }

  return (
    <div className="record-locator-list" data-testid="record-locator-shop-list">
      {stores.map((store) => {
        const selected = selectedStoreId === store.id;
        const openNow = resolveStoreOpenNow(store);
        const rank = ranks.get(store.id) ?? 0;
        const directionsUrl = buildDirectionsUrl(
          { latitude: store.latitude, longitude: store.longitude },
          store.name,
          userPosition ?? undefined,
          mapsProvider
        );
        const placeUrl = buildPlaceSearchUrl(store, mapsProvider);

        return (
          <article
            key={store.id}
            ref={selected ? selectedRef : undefined}
            className={`record-locator-card${selected ? ' record-locator-card--selected' : ''}`}
            data-testid={`record-locator-card-${store.id}`}
          >
            <button
              type="button"
              className="record-locator-card__main"
              onClick={() => onSelectStore(store.id)}
              aria-expanded={selected}
            >
              <span
                className={`record-locator-card__rank${
                  openNow === true
                    ? ' record-locator-card__rank--open'
                    : openNow === false
                      ? ' record-locator-card__rank--closed'
                      : ' record-locator-card__rank--unknown'
                }`}
              >
                {rank}
              </span>
              {store.photoUrl ? (
                <RecordStorePhoto
                  photoUrl={store.photoUrl}
                  name={store.name}
                  className="record-locator-photo--thumb"
                />
              ) : null}
              <div className="record-locator-card__content min-w-0 flex-1">
                <div className="record-locator-card__topline">
                  <h3 className="record-locator-card__name">{store.name}</h3>
                  <span className="record-locator-card__distance">
                    {formatDistanceMeters(store.distanceMeters)}
                  </span>
                </div>
                <p className="record-locator-card__meta record-locator-card__address">
                  {store.address}
                </p>
                <div className="record-locator-card__tags">
                  {openNow === true ? (
                    <span className="record-locator-badge record-locator-badge--open">Open now</span>
                  ) : openNow === false ? (
                    <span className="record-locator-badge record-locator-badge--closed">Closed</span>
                  ) : (
                    <span className="record-locator-badge record-locator-badge--unknown">Hours unknown</span>
                  )}
                  {store.openingHoursSummary ? (
                    <span className="record-locator-card__hours">{store.openingHoursSummary}</span>
                  ) : null}
                  {store.rating != null ? (
                    <span className="record-locator-card__rating">
                      <Star className="h-3 w-3 text-[var(--gold)]" fill="currentColor" strokeWidth={0} />
                      {store.rating.toFixed(1)}
                      {store.ratingCount != null ? ` (${store.ratingCount})` : ''}
                    </span>
                  ) : null}
                </div>
              </div>
            </button>

            <div className="record-locator-card__actions">
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="record-locator-card__directions"
                data-testid={`record-locator-directions-${store.id}`}
              >
                <Navigation className="h-3.5 w-3.5" />
                Directions
              </a>
            </div>

            {selected ? (
              <div className="record-locator-card__expand" data-testid="record-locator-store-detail">
                <RecordStorePhoto photoUrl={store.photoUrl} name={store.name} />
                {store.phone ? (
                  <p className="record-locator-card__detail-row">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <a href={`tel:${store.phone}`} className="record-locator-link">
                      {store.phone}
                    </a>
                  </p>
                ) : null}
                {store.website ? (
                  <p className="record-locator-card__detail-row">
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    <a
                      href={store.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="record-locator-link"
                    >
                      Visit website
                    </a>
                  </p>
                ) : null}
                {store.openingHoursSummary ? (
                  <p className="record-locator-card__detail-row">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>{store.openingHoursSummary}</span>
                  </p>
                ) : null}
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="record-locator-card__cta"
                  data-testid="record-locator-directions-cta"
                >
                  <Navigation className="h-4 w-4" />
                  Get directions in {mapsProviderLabel(mapsProvider)}
                </a>
                <a
                  href={placeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="record-locator-card__maps-link"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  View on {mapsProviderLabel(mapsProvider)}
                </a>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}