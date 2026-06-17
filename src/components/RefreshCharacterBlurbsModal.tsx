import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  countRecordsNeedingCharacterBlurbs,
} from '../lib/characterBlurbs';
import type { VinylRecord } from '../lib/types';

interface RefreshCharacterBlurbsModalProps {
  open: boolean;
  records: VinylRecord[];
  running: boolean;
  onClose: () => void;
  onConfirm: (options: { force: boolean }) => void;
}

export function RefreshCharacterBlurbsModal({
  open,
  records,
  running,
  onClose,
  onConfirm,
}: RefreshCharacterBlurbsModalProps) {
  const [forceRefresh, setForceRefresh] = useState(false);

  const needing = countRecordsNeedingCharacterBlurbs(records);
  const targetCount = forceRefresh ? records.length : needing;
  const canRun = targetCount > 0;

  useEffect(() => {
    if (!open) setForceRefresh(false);
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
            aria-labelledby="refresh-character-blurbs-heading"
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

            <h2 id="refresh-character-blurbs-heading" className="clear-collection-modal__title">
              Refresh musical descriptions?
            </h2>

            <p className="clear-collection-modal__lead">
              Fetches how each record sounds — genre tags, Wikipedia, and Last.fm — not sleeve or
              pressing notes. Descriptions are saved on each record (~2.5s apart to respect API
              limits).
            </p>

            <label className="enrich-modal__option">
              <input
                type="checkbox"
                checked={forceRefresh}
                onChange={(e) => setForceRefresh(e.target.checked)}
                disabled={running}
              />
              <span>
                <strong>Replace all descriptions</strong>
                <span className="enrich-modal__option-hint">
                  Re-fetch even when a character blurb is already stored — use this to overwrite
                  old pressing-note copy.
                </span>
              </span>
            </label>

            <p className="clear-collection-modal__summary tabular-nums">
              {forceRefresh
                ? `${records.length} record${records.length === 1 ? '' : 's'} in crate`
                : `${needing} record${needing === 1 ? '' : 's'} missing descriptions`}
              {targetCount > 0 ? (
                <>
                  {' '}
                  · est. {Math.ceil((targetCount * 2.5) / 60)} min
                </>
              ) : null}
            </p>

            <div className="clear-collection-modal__actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={running}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!canRun || running}
                onClick={() => onConfirm({ force: forceRefresh })}
              >
                {running ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Working…
                  </>
                ) : (
                  'Start refresh'
                )}
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}