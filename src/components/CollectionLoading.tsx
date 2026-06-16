import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MyVinylBrandMark } from './MyVinylBrandMark';

interface CollectionLoadingProps {
  /** Shown after a few seconds when a guest crate load may be stuck. */
  onSwitchToPersonal?: () => void;
  switchLabel?: string;
}

export function CollectionLoading({
  onSwitchToPersonal,
  switchLabel = 'Open My Crate instead',
}: CollectionLoadingProps) {
  const [showEscape, setShowEscape] = useState(false);

  useEffect(() => {
    if (!onSwitchToPersonal) return;
    const timer = window.setTimeout(() => setShowEscape(true), 6000);
    return () => window.clearTimeout(timer);
  }, [onSwitchToPersonal]);

  return (
    <div className="collection-loading" role="status" aria-live="polite" aria-busy="true">
      <motion.div
        className="collection-loading__card"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="collection-loading__mark-wrap">
          <MyVinylBrandMark className="collection-loading__mark" size={44} />
          <span className="collection-loading__ring" aria-hidden />
        </div>
        <Loader2 className="h-[1.375rem] w-[1.375rem] animate-spin text-[var(--accent)]" aria-hidden />
        <p className="collection-loading__title">Loading your collection...</p>
        <p className="collection-loading__subtitle">Syncing your crate from the cloud</p>
        {showEscape && onSwitchToPersonal ? (
          <button type="button" className="btn-ghost collection-loading__escape" onClick={onSwitchToPersonal}>
            {switchLabel}
          </button>
        ) : null}
      </motion.div>
    </div>
  );
}