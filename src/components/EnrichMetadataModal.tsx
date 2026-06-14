import { AnimatePresence, motion } from 'framer-motion';
import { KeyRound, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  countAllTracks,
  countReleasesNeedingMetadata,
  countBpmTappedTracks,
  countReleasesWithTracks,
  countTracksNeedingMetadata,
} from '../lib/fullMetadataEnrichment';
import type { VinylRecord } from '../lib/types';

interface EnrichMetadataModalProps {
  open: boolean;
  records: VinylRecord[];
  running: boolean;
  onClose: () => void;
  onConfirm: (options: { force: boolean }) => void;
}

export function EnrichMetadataModal({
  open,
  records,
  running,
  onClose,
  onConfirm,
}: EnrichMetadataModalProps) {
  const [forceReenrich, setForceReenrich] = useState(false);

  const releasesNeeding = countReleasesNeedingMetadata(records);
  const tracksNeeding = countTracksNeedingMetadata(records);
  const allTracks = countAllTracks(records);
  const allReleases = countReleasesWithTracks(records);
  const tappedTracks = countBpmTappedTracks(records);

  const targetTracks = forceReenrich ? allTracks : tracksNeeding;
  const targetReleases = forceReenrich ? allReleases : releasesNeeding;
  const canRun = targetTracks > 0;

  useEffect(() => {
    if (!open) setForceReenrich(false);
  }, [open]);

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
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="enrich-metadata-heading"
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
            >
              <X className="h-4 w-4" />
            </button>

            <div
              className="clear-collection-modal__icon-wrap clear-collection-modal__icon-wrap--neutral"
              aria-hidden
            >
              <KeyRound className="h-5 w-5 text-[var(--accent)]" />
            </div>

            <h2 id="enrich-metadata-heading" className="clear-collection-modal__title">
              Enrich track metadata?
            </h2>

            <p className="clear-collection-modal__lead">
              Fetches BPM, Camelot key, and vibe tags from the latest enrichment pipeline.
              By default, only tracks missing metadata are processed.
            </p>

            <label className="enrich-modal__option">
              <input
                type="checkbox"
                checked={forceReenrich}
                onChange={(e) => setForceReenrich(e.target.checked)}
                disabled={running}
              />
              <span>
                <strong>Re-enrich all tracks</strong>
                <span className="enrich-modal__option-hint">
                  Re-apply improved methods to releases that are already enriched.
                  {tappedTracks > 0
                    ? ` Saved tap BPM on ${tappedTracks} track${tappedTracks === 1 ? '' : 's'} is kept — only key and vibes refresh.`
                    : ' Saved tap BPM is never overwritten.'}
                </span>
              </span>
            </label>

            <p className="clear-collection-modal__summary tabular-nums">
              <span className="font-medium text-[var(--text)]">{targetTracks}</span>
              <span className="text-[var(--text-muted)]">
                {' '}
                track{targetTracks === 1 ? '' : 's'}
                {forceReenrich ? ' to re-process' : ' need metadata'}
              </span>
              {targetReleases > 0 ? (
                <>
                  <span className="text-[var(--text-muted)]"> · </span>
                  <span className="font-medium text-[var(--text-secondary)]">{targetReleases}</span>
                  <span className="text-[var(--text-muted)]"> releases</span>
                </>
              ) : null}
            </p>

            <p className="clear-collection-modal__lead" style={{ marginTop: '0.75rem' }}>
              Runs in the background while you browse. Import full tracklists first if releases
              only show one track.
            </p>

            <div className="clear-collection-modal__actions">
              <button type="button" className="btn-ghost" onClick={onClose}>
                {running ? 'Close' : 'Cancel'}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => onConfirm({ force: forceReenrich })}
                disabled={running || !canRun}
              >
                {running ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Running…
                  </>
                ) : forceReenrich ? (
                  'Re-enrich all'
                ) : (
                  'Enrich missing'
                )}
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}