import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { GridView } from '../GridView';
import { MyVinylBrandMark } from '../MyVinylBrandMark';
import { RecordDetailModal } from '../RecordDetailModal';
import { ThemeToggle } from '../ThemeToggle';
import { fetchSharedCrate, type SharedCrate } from '../../lib/shareLinks';
import type { VinylRecord } from '../../lib/types';

interface SharedCratePageProps {
  token: string;
}

export function SharedCratePage({ token }: SharedCratePageProps) {
  const [crate, setCrate] = useState<SharedCrate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<VinylRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchSharedCrate(token).then((result) => {
      if (cancelled) return;
      if (result.error || !result.data) {
        setCrate(null);
        setError(result.error?.message ?? 'This link is invalid or has expired.');
      } else {
        setCrate(result.data);
        document.title = `${result.data.name} | MyVinyl`;
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const countLabel =
    crate == null ? '' : crate.recordCount === 1 ? '1 record' : `${crate.recordCount} records`;

  return (
    <div className="share-page min-h-dvh">
      <header className="share-page__bar">
        <a href="/" className="share-page__brand" aria-label="MyVinyl">
          <MyVinylBrandMark size={28} />
          <span className="share-page__wordmark">MyVinyl</span>
        </a>
        <div className="share-page__bar-actions">
          <span className="share-page__lock">View only</span>
          <ThemeToggle compact />
        </div>
      </header>

      <main className="share-page__main mx-auto max-w-7xl px-3 pb-16 sm:px-6">
        {loading ? (
          <div className="share-page__status">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" aria-label="Loading list" />
          </div>
        ) : error || !crate ? (
          <div className="share-page__status">
            <h1 className="share-page__missing">Link unavailable</h1>
            <p>{error ?? 'This link is invalid or has expired.'}</p>
          </div>
        ) : (
          <>
            <section className="share-page__intro" aria-label="Shared list">
              <div className="share-owner">
                <span className="share-owner__avatar" aria-hidden>
                  {crate.ownerInitial}
                </span>
                <div className="min-w-0">
                  <p className="share-owner__name">{crate.ownerName}</p>
                  <h1 className="share-page__title">{crate.name}</h1>
                  <p className="share-page__count tabular-nums">{countLabel}</p>
                </div>
              </div>
            </section>

            {crate.records.length === 0 ? (
              <div className="share-page__empty">This list is empty.</div>
            ) : (
              <GridView
                records={crate.records}
                showPlay={false}
                onPlay={() => undefined}
                onOpenRecord={setDetail}
              />
            )}
          </>
        )}
      </main>

      <RecordDetailModal
        record={detail}
        readOnly
        viewOnly
        onClose={() => setDetail(null)}
        onUpdate={() => undefined}
        onDelete={() => undefined}
        onPlay={() => undefined}
      />
    </div>
  );
}
