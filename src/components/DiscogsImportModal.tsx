import { AnimatePresence, motion } from 'framer-motion';
import { Disc3, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { fetchDiscogsCollectionPage } from '../lib/api';
import { buildImportRecordsWithTracklists } from '../lib/discogsImport';
import type { DiscogsCollectionReleasePayload } from '../lib/discogsImport';
import type { VinylRecord } from '../lib/types';

type Step = 'username' | 'confirm' | 'importing' | 'done';

interface DiscogsImportModalProps {
  open: boolean;
  onClose: () => void;
  existingDiscogsIds: number[];
  onImport: (records: Omit<VinylRecord, 'id' | 'addedAt'>[]) => {
    added: number;
    skipped: number;
  };
}

const USERNAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export function DiscogsImportModal({
  open,
  onClose,
  existingDiscogsIds,
  onImport,
}: DiscogsImportModalProps) {
  const [step, setStep] = useState<Step>('username');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({
    page: 0,
    pages: 0,
    fetched: 0,
    total: 0,
    tracklistsDone: 0,
    tracklistsTotal: 0,
    phase: 'pages' as 'pages' | 'tracklists',
  });
  const [result, setResult] = useState({ added: 0, skipped: 0, vinyl: 0 });

  const reset = useCallback(() => {
    setStep('username');
    setUsername('');
    setError('');
    setProgress({
      page: 0,
      pages: 0,
      fetched: 0,
      total: 0,
      tracklistsDone: 0,
      tracklistsTotal: 0,
      phase: 'pages',
    });
    setResult({ added: 0, skipped: 0, vinyl: 0 });
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && step !== 'importing') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, step]);

  const handleUsernameNext = () => {
    const trimmed = username.trim();
    if (!trimmed) {
      setError('Enter your Discogs username.');
      return;
    }
    if (!USERNAME_RE.test(trimmed)) {
      setError('Username can only contain letters, numbers, underscores, and hyphens.');
      return;
    }
    setError('');
    setStep('confirm');
  };

  const runImport = async () => {
    const trimmed = username.trim();
    setStep('importing');
    setError('');

    const existing = new Set(existingDiscogsIds);
    const rowsToImport: DiscogsCollectionReleasePayload[] = [];
    let page = 1;
    let pages = 1;
    let total = 0;

    try {
      while (page <= pages) {
        const data = await fetchDiscogsCollectionPage(trimmed, page, 100);
        pages = data.pagination.pages || 1;
        total = data.pagination.items ?? total;

        for (const row of data.releases) {
          if (existing.has(row.discogsId)) continue;
          rowsToImport.push(row);
        }

        setProgress({
          page,
          pages,
          fetched: Math.min(page * data.pagination.per_page, total),
          total,
          tracklistsDone: 0,
          tracklistsTotal: rowsToImport.length,
          phase: 'pages',
        });

        page += 1;
        if (page <= pages) {
          await new Promise((r) => setTimeout(r, 350));
        }
      }

      setProgress((p) => ({
        ...p,
        phase: 'tracklists',
        tracklistsTotal: rowsToImport.length,
        tracklistsDone: 0,
      }));

      const payloads = await buildImportRecordsWithTracklists(rowsToImport, (done, trackTotal) => {
        setProgress((p) => ({
          ...p,
          phase: 'tracklists',
          tracklistsDone: done,
          tracklistsTotal: trackTotal,
        }));
      });

      const { added, skipped } = onImport(payloads);

      setResult({
        added,
        skipped,
        vinyl: payloads.length,
      });
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
      setStep('confirm');
    }
  };

  return (
    <AnimatePresence>
      {open && (
      <motion.div
        className="discogs-import-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={step === 'importing' ? undefined : onClose}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="discogs-import-title"
          className="discogs-import-modal"
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 400, damping: 34 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="discogs-import-modal__close"
            onClick={onClose}
            disabled={step === 'importing'}
            aria-label="Close"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>

          <div className="discogs-import-modal__icon-wrap" aria-hidden>
            <Disc3 className="discogs-import-modal__icon" strokeWidth={1.5} />
          </div>

          {step === 'username' && (
            <>
              <h2 id="discogs-import-title" className="discogs-import-modal__title">
                Import from Discogs
              </h2>
              <p className="discogs-import-modal__lead">
                Pull your public Discogs collection into MyVinyl — vinyl releases only, with
                artwork and metadata.
              </p>
              <label htmlFor="discogs-username" className="discogs-import-modal__label">
                Discogs username
              </label>
              <input
                id="discogs-username"
                type="text"
                className="discogs-import-modal__input input-field"
                placeholder="e.g. your_discogs_handle"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUsernameNext();
                }}
                autoComplete="username"
                autoFocus
              />
              {error ? <p className="discogs-import-modal__error">{error}</p> : null}
              <div className="discogs-import-modal__actions">
                <button type="button" className="btn-ghost" onClick={onClose}>
                  Cancel
                </button>
                <button type="button" className="btn-primary" onClick={handleUsernameNext}>
                  Continue
                </button>
              </div>
            </>
          )}

          {step === 'confirm' && (
            <>
              <h2 id="discogs-import-title" className="discogs-import-modal__title">
                Import collection?
              </h2>
              <p className="discogs-import-modal__lead">
                This will import your entire Discogs collection for{' '}
                <strong className="text-[var(--text)]">{username.trim()}</strong> into MyVinyl.
                Records already in your crate will be skipped.
              </p>
              {error ? <p className="discogs-import-modal__error">{error}</p> : null}
              <div className="discogs-import-modal__actions">
                <button type="button" className="btn-ghost" onClick={() => setStep('username')}>
                  Back
                </button>
                <button type="button" className="btn-primary" onClick={() => void runImport()}>
                  Continue
                </button>
              </div>
            </>
          )}

          {step === 'importing' && (
            <>
              <h2 id="discogs-import-title" className="discogs-import-modal__title">
                Importing your crate…
              </h2>
              <p className="discogs-import-modal__lead">
                {progress.phase === 'tracklists' ? (
                  <>
                    Loading tracklists
                    {progress.tracklistsTotal > 0 ? (
                      <>
                        {' '}
                        · <span className="tabular-nums">{progress.tracklistsDone}</span> of{' '}
                        <span className="tabular-nums">{progress.tracklistsTotal}</span> releases
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    Fetching from Discogs
                    {progress.total > 0 ? (
                      <>
                        {' '}
                        · <span className="tabular-nums">{progress.fetched}</span> of{' '}
                        <span className="tabular-nums">{progress.total}</span> releases
                      </>
                    ) : progress.pages > 0 ? (
                      <>
                        {' '}
                        · page <span className="tabular-nums">{progress.page}</span> of{' '}
                        <span className="tabular-nums">{progress.pages}</span>
                      </>
                    ) : null}
                  </>
                )}
              </p>
              <div className="discogs-import-modal__progress" aria-hidden>
                <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" strokeWidth={2} />
              </div>
            </>
          )}

          {step === 'done' && (
            <>
              <h2 id="discogs-import-title" className="discogs-import-modal__title">
                Import complete
              </h2>
              <p className="discogs-import-modal__lead">
                <span className="font-semibold text-[var(--text)] tabular-nums">
                  {result.added}
                </span>{' '}
                {result.added === 1 ? 'record' : 'records'} added
                {result.skipped > 0 ? (
                  <>
                    {' '}
                    · <span className="tabular-nums">{result.skipped}</span> skipped (duplicates
                    or CD-only)
                  </>
                ) : null}
              </p>
              <div className="discogs-import-modal__actions">
                <button type="button" className="btn-primary w-full sm:w-auto" onClick={onClose}>
                  Done
                </button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  );
}