import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ChevronLeft, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  countRecordsForClearMode,
  RESET_COLLECTION_OPTIONS,
  type ClearCollectionMode,
} from '../lib/collectionClear';
import type { VinylRecord } from '../lib/types';

interface ClearCollectionModalProps {
  open: boolean;
  records: VinylRecord[];
  onClose: () => void;
  onConfirm: (mode: ClearCollectionMode) => void;
}

export function ClearCollectionModal({
  open,
  records,
  onClose,
  onConfirm,
}: ClearCollectionModalProps) {
  const [step, setStep] = useState<'choose' | 'confirm'>('choose');
  const [selected, setSelected] = useState<ClearCollectionMode | null>(null);

  const counts = useMemo(
    () => ({
      manual: countRecordsForClearMode(records, 'manual'),
      imported: countRecordsForClearMode(records, 'imported'),
      all: records.length,
    }),
    [records]
  );

  const reset = useCallback(() => {
    setStep('choose');
    setSelected(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const selectedOption = RESET_COLLECTION_OPTIONS.find((o) => o.mode === selected);
  const confirmCount = selected ? counts[selected] : 0;

  const handleConfirm = () => {
    if (!selected || confirmCount === 0) return;
    onConfirm(selected);
    onClose();
    reset();
  };

  return (
    <AnimatePresence>
      {open && (
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
            aria-labelledby="reset-collection-title"
            className="clear-collection-modal"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="clear-collection-modal__close"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>

            {step === 'choose' ? (
              <>
                <div className="clear-collection-modal__icon-wrap clear-collection-modal__icon-wrap--neutral">
                  <RotateCcw className="h-[1.125rem] w-[1.125rem]" strokeWidth={2} />
                </div>
                <h2 id="reset-collection-title" className="clear-collection-modal__title">
                  Reset collection
                </h2>
                <p className="clear-collection-modal__lead">
                  Choose what to remove from your local crate. Counts reflect how each release was
                  added — manual search and one-off adds vs bulk Discogs import.
                </p>

                <ul className="clear-collection-modal__options">
                  {RESET_COLLECTION_OPTIONS.map((opt) => {
                    const count = counts[opt.mode];
                    const disabled = count === 0;
                    return (
                      <li key={opt.mode}>
                        <button
                          type="button"
                          className="clear-collection-modal__option"
                          disabled={disabled}
                          onClick={() => {
                            setSelected(opt.mode);
                            setStep('confirm');
                          }}
                        >
                          <span className="clear-collection-modal__option-text">
                            <span className="clear-collection-modal__option-title">
                              {opt.title}
                            </span>
                            <span className="clear-collection-modal__option-desc">
                              {opt.description}
                            </span>
                          </span>
                          <span className="clear-collection-modal__option-count tabular-nums">
                            {count}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <p className="clear-collection-modal__summary tabular-nums">
                  <span className="font-medium text-[var(--text-secondary)]">{counts.manual}</span>
                  <span className="text-[var(--text-muted)]"> manual</span>
                  <span className="text-[var(--text-muted)]"> · </span>
                  <span className="font-medium text-[var(--text-secondary)]">{counts.imported}</span>
                  <span className="text-[var(--text-muted)]"> imported</span>
                  <span className="text-[var(--text-muted)]"> · </span>
                  <span className="font-medium text-[var(--text)]">{counts.all}</span>
                  <span className="text-[var(--text-muted)]"> total</span>
                </p>

                <div className="clear-collection-modal__actions">
                  <button type="button" className="btn-ghost" onClick={onClose}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="clear-collection-modal__icon-wrap clear-collection-modal__icon-wrap--danger">
                  <AlertTriangle className="h-5 w-5" strokeWidth={2} />
                </div>
                <h2 id="reset-collection-title" className="clear-collection-modal__title">
                  Confirm reset
                </h2>
                <p className="clear-collection-modal__lead">
                  {selectedOption?.description}
                </p>

                <div className="clear-collection-modal__confirm-box">
                  <p className="clear-collection-modal__confirm-stat">
                    <span className="clear-collection-modal__confirm-num tabular-nums">
                      {confirmCount}
                    </span>
                    <span>
                      {confirmCount === 1 ? 'record' : 'records'} will be permanently removed
                      from MyVinyl on this device.
                    </span>
                  </p>
                </div>

                <div className="clear-collection-modal__actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      setStep('choose');
                      setSelected(null);
                    }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </button>
                  <button
                    type="button"
                    className="clear-collection-modal__danger-btn"
                    disabled={confirmCount === 0}
                    onClick={handleConfirm}
                  >
                    Reset {confirmCount} {confirmCount === 1 ? 'record' : 'records'}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}