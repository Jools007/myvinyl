import { AnimatePresence, motion } from 'framer-motion';
import { Disc3, Loader2, X } from 'lucide-react';
import { useEffect } from 'react';
import {
  countDiscogsLinkedRecords,
  countLikelyIncompleteTracklists,
} from '../lib/fullTracklistEnrichment';
import type { VinylRecord } from '../lib/types';

interface EnrichTracklistsModalProps {
  open: boolean;
  records: VinylRecord[];
  running: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function EnrichTracklistsModal({
  open,
  records,
  running,
  onClose,
  onConfirm,
}: EnrichTracklistsModalProps) {
  const linked = countDiscogsLinkedRecords(records);
  const likelyIncomplete = countLikelyIncompleteTracklists(records);

  useEffect(() => {
    if (!open || running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, running, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="clear-collection-portal">
          <motion.button
            type="button"
            className="clear-collection-backdrop"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={running ? undefined : onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="enrich-tracklists-heading"
            className="clear-collection-modal"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="clear-collection-modal__close"
              aria-label="Close"
              onClick={onClose}
              disabled={running}
            >
              <X className="h-4 w-4" />
            </button>

            <div
              className="clear-collection-modal__icon-wrap clear-collection-modal__icon-wrap--neutral"
              aria-hidden
            >
              <Disc3 className="h-5 w-5 text-[var(--accent)]" />
            </div>

            <h2 id="enrich-tracklists-heading" className="clear-collection-modal__title">
              Enrich all tracklists?
            </h2>

            <p className="clear-collection-modal__lead">
              Fetches the full tracklist from Discogs for every release in your collection that has a
              Discogs link, then saves it to your library. Safe to run more than once — releases that
              already match Discogs are skipped.
            </p>

            <p className="clear-collection-modal__summary tabular-nums">
              <span className="font-medium text-[var(--text)]">{linked}</span>
              <span className="text-[var(--text-muted)]"> Discogs-linked</span>
              {likelyIncomplete > 0 ? (
                <>
                  <span className="text-[var(--text-muted)]"> · </span>
                  <span className="font-medium text-[var(--text-secondary)]">
                    {likelyIncomplete}
                  </span>
                  <span className="text-[var(--text-muted)]"> likely incomplete</span>
                </>
              ) : null}
            </p>

            <p className="clear-collection-modal__lead" style={{ marginTop: '0.75rem' }}>
              Requests are rate-limited (~{Math.ceil(linked * 0.3)}s for {linked} releases). You can
              keep browsing while this runs.
            </p>

            <div className="clear-collection-modal__actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={onClose}
                disabled={running}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={onConfirm}
                disabled={running || linked === 0}
              >
                {running ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Running…
                  </>
                ) : (
                  'Enrich all tracklists'
                )}
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}