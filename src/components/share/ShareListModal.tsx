import { AnimatePresence, motion } from 'framer-motion';
import { Check, Link2, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  createOrGetShareLink,
  fetchSignedInOwnerLabel,
  type OwnerLabel,
} from '../../lib/shareLinks';
import { shareAbsoluteUrl } from '../../lib/shareRoute';

interface ShareListModalProps {
  open: boolean;
  onClose: () => void;
  collectionId: string | null;
  listName: string;
  recordCount: number;
}

export function ShareListModal({
  open,
  onClose,
  collectionId,
  listName,
  recordCount,
}: ShareListModalProps) {
  const [owner, setOwner] = useState<OwnerLabel | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !collectionId) return;

    let cancelled = false;
    void Promise.all([createOrGetShareLink(collectionId), fetchSignedInOwnerLabel()]).then(
      ([link, label]) => {
        if (cancelled) return;
        setOwner(label);
        setCopied(false);
        setLoadedFor(collectionId);
        if (link.error || !link.data) {
          setUrl(null);
          setError(link.error?.message ?? 'Could not create a share link');
          return;
        }
        setError(null);
        setUrl(shareAbsoluteUrl(link.data.token));
      }
    );

    return () => {
      cancelled = true;
    };
  }, [open, collectionId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Copied');
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('Could not copy the link');
    }
  };

  const countLabel = recordCount === 1 ? '1 record' : `${recordCount} records`;
  const loading = open && !!collectionId && loadedFor !== collectionId;
  const blocked = open && !collectionId ? 'This crate is not ready to share yet.' : null;
  const visibleError = blocked ?? (loadedFor === collectionId ? error : null);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="discogs-import-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-list-title"
            className="discogs-import-modal share-list-modal"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="discogs-import-modal__close"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>

            <p className="share-list-modal__kicker">
              <Link2 className="h-3.5 w-3.5" aria-hidden />
              Share list
            </p>
            <div className="share-list-modal__owner">
              <span className="share-owner__avatar" aria-hidden>
                {owner?.initial ?? '·'}
              </span>
              <div className="share-list-modal__owner-copy">
                <p className="share-owner__name">{owner?.name ?? '…'}</p>
                <h2 id="share-list-title" className="share-list-modal__title">
                  {listName}
                </h2>
                <p className="share-list-modal__count tabular-nums">{countLabel}</p>
              </div>
            </div>

            {loading ? (
              <p className="share-list-modal__status">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Preparing link…
              </p>
            ) : visibleError ? (
              <p className="share-list-modal__error" role="alert">
                {visibleError}
              </p>
            ) : (
              <>
                <label className="share-list-modal__url-label" htmlFor="share-list-url">
                  Link
                </label>
                <input
                  id="share-list-url"
                  className="input-field share-list-modal__url"
                  readOnly
                  value={url ?? ''}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button type="button" className="btn-primary share-list-modal__copy" onClick={() => void copy()}>
                  {copied ? <Check className="h-4 w-4" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <p className="share-list-modal__hint">
                  Anyone with the link can view this list. They cannot add, edit, or remove records.
                </p>
              </>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
