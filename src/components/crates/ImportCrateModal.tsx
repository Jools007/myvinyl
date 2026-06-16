import { AnimatePresence, motion } from 'framer-motion';
import { Disc3, Users, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { DiscogsImportModal } from '../DiscogsImportModal';
import type { VinylRecord } from '../../lib/types';

export type ImportCrateTarget = 'personal' | 'guest';

interface ImportCrateModalProps {
  open: boolean;
  onClose: () => void;
  existingDiscogsIds: number[];
  resolveGuestExistingIds: (discogsUsername: string) => Promise<number[]>;
  onImportPersonal: (
    records: Omit<VinylRecord, 'id' | 'addedAt'>[],
    context: { discogsUsername: string }
  ) =>
    | Promise<{ added: number; skipped: number }>
    | { added: number; skipped: number };
  onImportGuest: (
    records: Omit<VinylRecord, 'id' | 'addedAt'>[],
    context: { discogsUsername: string }
  ) => Promise<{ added: number; skipped: number; error?: string }>;
}

export function ImportCrateModal({
  open,
  onClose,
  existingDiscogsIds,
  resolveGuestExistingIds,
  onImportPersonal,
  onImportGuest,
}: ImportCrateModalProps) {
  const [target, setTarget] = useState<ImportCrateTarget | null>(null);

  const reset = useCallback(() => {
    setTarget(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <>
      <AnimatePresence>
        {open && target == null ? (
          <motion.div
            className="discogs-import-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="import-crate-title"
              className="discogs-import-modal import-crate-modal"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="discogs-import-modal__close"
                onClick={handleClose}
                aria-label="Close"
              >
                <X className="h-5 w-5" strokeWidth={2} />
              </button>

              <h2 id="import-crate-title" className="discogs-import-modal__title">
                Import from Discogs
              </h2>
              <p className="discogs-import-modal__lead">
                Pull a public Discogs collection into MyVinyl. Choose whose crate to fill.
              </p>

              <div className="import-crate-modal__choices">
                <button
                  type="button"
                  className="import-crate-modal__choice"
                  onClick={() => setTarget('personal')}
                >
                  <Disc3 className="import-crate-modal__choice-icon" strokeWidth={1.5} />
                  <span className="import-crate-modal__choice-title">My collection</span>
                  <span className="import-crate-modal__choice-hint">
                    Add to your personal crate
                  </span>
                </button>
                <button
                  type="button"
                  className="import-crate-modal__choice"
                  onClick={() => setTarget('guest')}
                >
                  <Users className="import-crate-modal__choice-icon" strokeWidth={1.5} />
                  <span className="import-crate-modal__choice-title">Friend&apos;s collection</span>
                  <span className="import-crate-modal__choice-hint">
                    Separate guest crate for demos (up to 1,000 vinyl)
                  </span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <DiscogsImportModal
        open={open && target === 'personal'}
        onClose={handleClose}
        existingDiscogsIds={existingDiscogsIds}
        onImport={onImportPersonal}
        copyVariant="personal"
      />

      <DiscogsImportModal
        open={open && target === 'guest'}
        onClose={handleClose}
        existingDiscogsIds={[]}
        resolveExistingIds={resolveGuestExistingIds}
        onImport={async (incoming, context) => {
          const result = await onImportGuest(incoming, context);
          if (result.error) throw new Error(result.error);
          return { added: result.added, skipped: result.skipped };
        }}
        copyVariant="guest"
      />
    </>
  );
}