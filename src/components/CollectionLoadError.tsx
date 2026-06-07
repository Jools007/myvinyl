import { motion } from 'framer-motion';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';

type CollectionLoadErrorProps = {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
};

export function CollectionLoadError({
  message,
  onRetry,
  retrying = false,
}: CollectionLoadErrorProps) {
  return (
    <div className="collection-load-error" role="alert" aria-live="assertive">
      <motion.div
        className="collection-load-error__card"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="collection-load-error__icon-wrap" aria-hidden>
          <AlertCircle className="collection-load-error__icon" strokeWidth={1.75} />
        </div>

        <h1 className="collection-load-error__title" style={{ fontFamily: 'var(--font-display)' }}>
          Couldn&apos;t load your collection
        </h1>
        <p className="collection-load-error__message">{message}</p>

        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="btn-primary collection-load-error__retry"
        >
          {retrying ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Retrying…
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" strokeWidth={2.25} />
              Try again
            </>
          )}
        </button>
      </motion.div>
    </div>
  );
}