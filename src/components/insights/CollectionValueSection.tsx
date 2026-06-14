import { Gem, Loader2, RefreshCw, Sparkles, TrendingUp } from 'lucide-react';
import { formatCurrency } from '../../lib/collectionValuation';
import type { ValuationState } from '../../hooks/useCollectionValuation';
import { RecordArtwork } from '../RecordArtwork';
import { ChartValueBar } from './InsightChartJs';

type CollectionValueSectionProps = {
  state: ValuationState;
  linkedCount: number;
  onRefresh: () => void;
  onSelectRecord?: (recordId: string, label: string) => void;
};

function ProgressRing({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const dash = `${pct}, 100`;
  return (
    <div className="insights-value__progress-ring" aria-hidden>
      <svg viewBox="0 0 36 36" className="insights-value__progress-svg">
        <path
          className="insights-value__progress-track"
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
        />
        <path
          className="insights-value__progress-fill"
          strokeDasharray={dash}
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
        />
      </svg>
      <span className="insights-value__progress-pct tabular-nums">{pct}%</span>
    </div>
  );
}

export function CollectionValueSection({
  state,
  linkedCount,
  onRefresh,
  onSelectRecord,
}: CollectionValueSectionProps) {
  const isLoading = state.status === 'loading';

  return (
    <section className="insights-value" aria-labelledby="insights-value-title">
      <div className="insights-value__glow" aria-hidden />
      <header className="insights-value__head">
        <div className="insights-value__badge">
          <Gem className="h-3.5 w-3.5" aria-hidden />
          Premium
        </div>
        <div className="insights-value__head-copy">
          <h2 id="insights-value-title" className="insights-value__title">
            Collection value
          </h2>
          <p className="insights-value__lead">
            Discogs marketplace estimates for your linked releases — priced to your copy&apos;s
            condition grade.
          </p>
        </div>
        <button
          type="button"
          className="insights-value__refresh"
          onClick={onRefresh}
          disabled={isLoading || linkedCount === 0}
          aria-busy={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden />
          )}
          Refresh
        </button>
      </header>

      {state.status === 'unavailable' ? (
        <div className="insights-value__empty">
          <Sparkles className="insights-value__empty-icon" strokeWidth={1.25} aria-hidden />
          <p className="insights-value__empty-title">Valuation unavailable</p>
          <p className="insights-value__empty-copy">{state.message}</p>
        </div>
      ) : null}

      {state.status === 'error' ? (
        <div className="insights-value__empty insights-value__empty--error">
          <p className="insights-value__empty-title">Couldn&apos;t load prices</p>
          <p className="insights-value__empty-copy">{state.message}</p>
          <button type="button" className="btn-ghost" onClick={onRefresh}>
            Try again
          </button>
        </div>
      ) : null}

      {state.status === 'loading' ? (
        <div className="insights-value__loading">
          <ProgressRing done={state.progress.done} total={state.progress.total} />
          <div className="insights-value__loading-copy">
            <p className="insights-value__loading-title">Fetching Discogs prices</p>
            <p className="insights-value__loading-sub tabular-nums">
              {state.progress.done} / {state.progress.total} releases
            </p>
            {state.progress.current ? (
              <p className="insights-value__loading-current">{state.progress.current}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {state.status === 'ready' ? (
        <>
          <div className="insights-value__hero">
            <div className="insights-value__total-card">
              <span className="insights-value__total-kicker">
                <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                Estimated total
              </span>
              <p className="insights-value__total-amount tabular-nums">
                {formatCurrency(state.data.totalValue, state.data.currency)}
              </p>
              <p className="insights-value__total-meta">
                {state.data.valuedCount} of {state.data.linkedCount} linked releases priced
                {state.data.skippedCount > 0
                  ? ` · ${state.data.skippedCount} without marketplace data`
                  : ''}
              </p>
            </div>
            <div className="insights-value__stat-grid">
              <article className="insights-value__stat">
                <span className="insights-value__stat-label">Avg per priced copy</span>
                <span className="insights-value__stat-value tabular-nums">
                  {formatCurrency(
                    state.data.totalValue / Math.max(1, state.data.valuedCount),
                    state.data.currency
                  )}
                </span>
              </article>
              <article className="insights-value__stat">
                <span className="insights-value__stat-label">Top record</span>
                <span className="insights-value__stat-value tabular-nums">
                  {state.data.topRecords[0]
                    ? formatCurrency(
                        state.data.topRecords[0].estimate.value,
                        state.data.currency,
                        true
                      )
                    : '—'}
                </span>
                {state.data.topRecords[0] ? (
                  <span className="insights-value__stat-hint">
                    {state.data.topRecords[0].artist}
                  </span>
                ) : null}
              </article>
              <article className="insights-value__stat">
                <span className="insights-value__stat-label">Coverage</span>
                <span className="insights-value__stat-value tabular-nums">
                  {Math.round((state.data.valuedCount / Math.max(1, state.data.linkedCount)) * 100)}%
                </span>
                <span className="insights-value__stat-hint">Discogs-linked</span>
              </article>
            </div>
          </div>

          <div className="insights-value__body">
            <div className="insights-value__top">
              <header className="insights-value__panel-head">
                <h3 className="insights-value__panel-title">Top 10 most valuable</h3>
                <p className="insights-value__panel-sub">Condition-adjusted marketplace median</p>
              </header>
              <ol className="insights-value__top-list" role="list">
                {state.data.topRecords.map((row, index) => (
                  <li key={row.recordId}>
                    <button
                      type="button"
                      className="insights-value__top-row"
                      onClick={() =>
                        onSelectRecord?.(row.recordId, `${row.artist} — ${row.title}`)
                      }
                      disabled={!onSelectRecord}
                    >
                      <span className="insights-value__top-rank tabular-nums">{index + 1}</span>
                      <RecordArtwork
                        src={row.coverUrl}
                        title={row.title}
                        size="sm"
                        className="insights-value__top-art"
                      />
                      <div className="insights-value__top-copy">
                        <p className="insights-value__top-title">{row.title}</p>
                        <p className="insights-value__top-artist">{row.artist}</p>
                        <p className="insights-value__top-meta">
                          {row.year ?? '—'} · {row.condition} · {row.primaryGenre}
                        </p>
                      </div>
                      <span className="insights-value__top-price tabular-nums">
                        {formatCurrency(row.estimate.value, row.estimate.currency)}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>

            <div className="insights-value__charts">
              <div className="insights-value__chart-cell">
                <ChartValueBar
                  title="Value by decade"
                  subtitle="Sum of condition estimates per era"
                  items={state.data.byDecade}
                  currency={state.data.currency}
                  horizontal
                  accentIndex={2}
                />
              </div>
              <div className="insights-value__chart-cell">
                <ChartValueBar
                  title="Value by genre"
                  subtitle="Primary genre tag per release"
                  items={state.data.byGenre}
                  currency={state.data.currency}
                  accentIndex={5}
                />
              </div>
            </div>
          </div>

          <p className="insights-value__footnote">
            Estimates from Discogs marketplace price suggestions. Not a formal appraisal — actual
            sale prices vary by pressing, sleeve, and demand.
          </p>
        </>
      ) : null}
    </section>
  );
}