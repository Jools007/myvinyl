import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import type { BackgroundSyncState } from '../lib/recordMigration';

interface BackgroundSyncIndicatorProps {
  status: BackgroundSyncState;
}

export function BackgroundSyncIndicator({ status }: BackgroundSyncIndicatorProps) {
  const visible = status.phase !== 'idle';

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-none fixed bottom-20 right-4 z-50 sm:bottom-6"
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
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}