import { Sparkles, X } from 'lucide-react';
import type { CollectionCrate } from '../../lib/collectionContext';

interface GuestCrateBannerProps {
  crate: CollectionCrate;
  onDelete?: () => void;
}

export function GuestCrateBanner({ crate, onDelete }: GuestCrateBannerProps) {
  return (
    <div className="guest-crate-banner" role="status">
      <Sparkles className="guest-crate-banner__icon h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
      <div className="guest-crate-banner__copy">
        <p className="guest-crate-banner__title">
          Viewing <span className="guest-crate-banner__name">{crate.name}</span>
        </p>
        <p className="guest-crate-banner__hint">
          Demo mode — enrich, play, export PDF, and print labels. Adds and deletes stay on your personal crate.
        </p>
      </div>
      {onDelete ? (
        <button
          type="button"
          className="guest-crate-banner__remove"
          onClick={onDelete}
          aria-label={`Remove ${crate.name}`}
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}