import { Sparkles, X } from 'lucide-react';
import type { CollectionCrate } from '../../lib/collectionContext';

interface GuestCrateBannerProps {
  crate: CollectionCrate;
  onDismiss?: () => void;
  onRemoveRequest?: () => void;
}

export function GuestCrateBanner({ crate, onDismiss, onRemoveRequest }: GuestCrateBannerProps) {
  return (
    <div className="guest-crate-banner" role="status">
      <Sparkles className="guest-crate-banner__icon h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
      <div className="guest-crate-banner__copy">
        <p className="guest-crate-banner__title">
          Viewing <span className="guest-crate-banner__name">{crate.name}</span>
        </p>
        <p className="guest-crate-banner__hint">
          Demo mode — browse, enrich, play, and export. New records from search go to your personal crate.
        </p>
        {onRemoveRequest ? (
          <button type="button" className="guest-crate-banner__remove-link" onClick={onRemoveRequest}>
            Remove this guest crate…
          </button>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          className="guest-crate-banner__dismiss"
          onClick={onDismiss}
          aria-label="Dismiss demo notice"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}