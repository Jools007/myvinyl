import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import type { BackgroundSyncState } from '../lib/recordMigration';

interface BackgroundSyncIndicatorProps {
  status: BackgroundSyncState;
  onCancel?: () => void;
}

export function BackgroundSyncIndicator({ status, onCancel }: BackgroundSyncIndicatorProps) {
  const visible = status.phase !== 'idle';

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
          className={`fixed bottom-6 right-4 z-40 ${onCancel ? 'pointer-events-auto' : 'pointer-events-none'}`}
          role="status"
          aria-live="polite"
        >
          <div className="glass-panel flex items-center gap-2 rounded-full px-3 py-2 shadow-lg">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--violet)]" />
            <span className="text-[11px] font-medium text-[var(--text-secondary)]">
              {status.message}
              {status.total != null && status.total > 0 && status.completed != null ? (
                <span className="ml-1 tabular-nums text-[var(--text-muted)]">
                  {status.completed}/{status.total}
                </span>
              ) : null}
            </span>
            {onCancel ? (
              <button
                type="button"
                className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                onClick={onCancel}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}