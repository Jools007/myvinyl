import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import {
  analyzeCrossCrateOverlap,
  estimateRemainingGuestEnrichment,
  type CrossCrateOverlapAnalysis,
} from '../lib/crossCrateEnrichment';
import { TRACKLIST_ENRICH_BATCH_SIZE } from '../lib/fullTracklistEnrichment';
import type { VinylRecord } from '../lib/types';

interface EnrichGuestCrateModalProps {
  open: boolean;
  running: boolean;
  guestRecords: VinylRecord[];
  personalRecords: VinylRecord[];
  personalLoading?: boolean;
  crateName: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function EnrichGuestCrateModal({
  open,
  running,
  guestRecords,
  personalRecords,
  personalLoading = false,
  crateName,
  onClose,
  onConfirm,
}: EnrichGuestCrateModalProps) {
  const analysis: CrossCrateOverlapAnalysis | null = useMemo(() => {
    if (!open || personalLoading) return null;
    return analyzeCrossCrateOverlap(guestRecords, personalRecords);
  }, [open, personalLoading, guestRecords, personalRecords]);

  const remaining = useMemo(
    () => estimateRemainingGuestEnrichment(guestRecords),
    [guestRecords]
  );

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
            aria-labelledby="enrich-guest-crate-heading"
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
              <Sparkles className="h-5 w-5 text-[var(--accent)]" />
            </div>

            <h2 id="enrich-guest-crate-heading" className="clear-collection-modal__title">
              Smart enrich {crateName}
            </h2>

            <p className="clear-collection-modal__lead">
              Matches releases you both own by Discogs ID, copies your tracklists and BPM/key/vibe
              data first, then automatically fetches the rest in safe batches — no manual repeats.
            </p>

            {personalLoading ? (
              <p className="clear-collection-modal__lead tabular-nums">
                <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" aria-hidden />
                Checking overlap with your personal crate…
              </p>
            ) : analysis ? (
              <ul className="clear-collection-modal__summary enrich-guest-modal__stats">
                <li>
                  <span className="font-medium text-[var(--text)] tabular-nums">
                    {analysis.overlapReleases}
                  </span>
                  <span className="text-[var(--text-muted)]"> releases in common</span>
                </li>
                <li>
                  <span className="font-medium text-[var(--text)] tabular-nums">
                    {analysis.tracklistsCopyable}
                  </span>
                  <span className="text-[var(--text-muted)]"> tracklists copy instantly from yours</span>
                </li>
                <li>
                  <span className="font-medium text-[var(--text)] tabular-nums">
                    {analysis.metadataCopyable}
                  </span>
                  <span className="text-[var(--text-muted)]"> releases get BPM/key/vibes from yours</span>
                </li>
                <li>
                  <span className="font-medium text-[var(--text-secondary)] tabular-nums">
                    {remaining.tracklistsRemaining}
                  </span>
                  <span className="text-[var(--text-muted)]"> tracklists still need Discogs</span>
                  <span className="text-[var(--text-muted)]"> · </span>
                  <span className="font-medium text-[var(--text-secondary)] tabular-nums">
                    {remaining.metadataReleasesRemaining}
                  </span>
                  <span className="text-[var(--text-muted)]"> need BPM/key lookup</span>
                </li>
              </ul>
            ) : null}

            <p className="clear-collection-modal__lead" style={{ marginTop: '0.75rem' }}>
              Runs in the background in batches of {TRACKLIST_ENRICH_BATCH_SIZE}. You can close this
              and browse the app — progress appears bottom-right. Your personal ratings and tap-BPMs
              stay on your crate only.
            </p>

            <div className="clear-collection-modal__actions">
              <button type="button" className="btn-ghost" onClick={onClose}>
                {running ? 'Run in background' : 'Cancel'}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={onConfirm}
                disabled={running || personalLoading || guestRecords.length === 0}
              >
                {running ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Enriching…
                  </>
                ) : (
                  'Start smart enrich'
                )}
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}