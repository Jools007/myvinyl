import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef, type RefObject } from 'react';
import {
  DiscogsSearchBar,
  type DiscogsSearchBarHandle,
} from './DiscogsSearchBar';
import type { VinylRecord } from '../lib/types';

interface CollectionDiscogsFloatingProps {
  open: boolean;
  onClose: () => void;
  onAdd: (record: Omit<VinylRecord, 'id' | 'addedAt'>) => void;
  collectionDiscogsIds: number[];
  searchRef?: RefObject<DiscogsSearchBarHandle | null>;
}

export function CollectionDiscogsFloating({
  open,
  onClose,
  onAdd,
  collectionDiscogsIds,
  searchRef,
}: CollectionDiscogsFloatingProps) {
  const localRef = useRef<DiscogsSearchBarHandle>(null);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      (searchRef?.current ?? localRef.current)?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open, searchRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="collection-discogs-floating"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          role="dialog"
          aria-label="Search Discogs to add a record"
        >
          <div className="collection-discogs-floating__backdrop" aria-hidden />
          <div className="collection-discogs-floating__inner mx-auto max-w-7xl px-4 sm:px-6">
            <div className="collection-discogs-floating__bar">
              <DiscogsSearchBar
                ref={searchRef ?? localRef}
                variant="floating"
                inputId="discogs-search-floating"
                onAdd={(record) => {
                  onAdd(record);
                  onClose();
                }}
                collectionDiscogsIds={collectionDiscogsIds}
              />
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost collection-discogs-floating__close h-9 w-9 shrink-0 rounded-full p-0"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}