import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CollectionCrate } from '../../lib/collectionContext';

interface RemoveGuestCrateModalProps {
  open: boolean;
  crate: CollectionCrate | null;
  onClose: () => void;
  onConfirm: () => boolean | Promise<boolean>;
}

export function RemoveGuestCrateModal({
  open,
  crate,
  onClose,
  onConfirm,
}: RemoveGuestCrateModalProps) {
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!open) {
      setRemoving(false);
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !removing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, removing]);

  const recordCount = crate?.recordCount ?? 0;

  const handleConfirm = async () => {
    if (removing) return;
    setRemoving(true);
    try {
      const ok = await onConfirm();
      if (ok) onClose();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && crate ? (
        <div className="clear-collection-portal">
          <motion.button
            type="button"
            className="clear-collection-backdrop"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={removing ? undefined : onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-guest-crate-title"
            className="clear-collection-modal"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="clear-collection-modal__close"
              onClick={onClose}
              disabled={removing}
              aria-label="Close"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>

            <div className="clear-collection-modal__icon-wrap clear-collection-modal__icon-wrap--danger">
              <AlertTriangle className="h-6 w-6" strokeWidth={2} aria-hidden />
            </div>
            <h2 id="remove-guest-crate-title" className="clear-collection-modal__title">
              Remove {crate.name}?
            </h2>
            <p className="clear-collection-modal__lead">
              This permanently deletes the guest crate and all{' '}
              <span className="tabular-nums">{recordCount.toLocaleString()}</span> imported records.
              Your personal crate is not affected.
            </p>

            <div className="clear-collection-modal__actions">
              <button type="button" className="btn-ghost" onClick={onClose} disabled={removing}>
                Cancel
              </button>
              <button
                type="button"
                className="clear-collection-modal__danger-btn"
                onClick={() => void handleConfirm()}
                disabled={removing}
              >
                {removing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Removing…
                  </>
                ) : (
                  'Remove guest crate'
                )}
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}