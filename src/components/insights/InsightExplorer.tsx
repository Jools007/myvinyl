import {
  Filter,
  ListMusic,
  Play,
  Shuffle,
  Sparkles,
  X,
} from 'lucide-react';
import {
  describeLens,
  filterRecordsByLens,
  getMixPicks,
  lensPreviewRecords,
  lensToFilterPatch,
  type InsightLens,
  type JourneyStep,
  type MixPick,
} from '../../lib/insightInteractions';
import { resolveTrackCamelot } from '../../lib/camelot';
import { getPrimaryTrack } from '../../lib/tracks';
import type { InsightFilterAction } from '../../lib/collectionInsights';
import type { Track, VinylRecord } from '../../lib/types';

type InsightExplorerProps = {
  lens: InsightLens;
  records: VinylRecord[];
  journey?: JourneyStep[] | null;
  onClose: () => void;
  onFilter?: (patch: InsightFilterAction) => void;
  onOpenCollection?: () => void;
  onPlay?: (record: VinylRecord, track: Track) => void;
  onQueue?: (record: VinylRecord, track: Track) => void;
  onQueueJourney?: (steps: JourneyStep[]) => void;
  onSelectCamelot?: (code: string) => void;
  onSpinAgain?: () => void;
};

function ReleaseChip({
  record,
  onPlay,
  onQueue,
}: {
  record: VinylRecord;
  onPlay?: (record: VinylRecord, track: Track) => void;
  onQueue?: (record: VinylRecord, track: Track) => void;
}) {
  const track = getPrimaryTrack(record);
  if (!track) return null;
  const key = resolveTrackCamelot(track).code;

  return (
    <div className="insights-explorer__chip">
      {record.coverUrl ? (
        <img src={record.coverUrl} alt="" className="insights-explorer__chip-art" loading="lazy" />
      ) : (
        <div className="insights-explorer__chip-art insights-explorer__chip-art--empty" aria-hidden />
      )}
      <div className="insights-explorer__chip-copy">
        <p className="insights-explorer__chip-title">{record.artist}</p>
        <p className="insights-explorer__chip-sub">{record.title}</p>
        <p className="insights-explorer__chip-meta tabular-nums">
          {track.bpm != null ? `${track.bpm} BPM` : '—'}
          {key ? ` · ${key}` : ''}
        </p>
      </div>
      <div className="insights-explorer__chip-actions">
        {onPlay ? (
          <button
            type="button"
            className="insights-explorer__icon-btn insights-explorer__icon-btn--play"
            aria-label={`Play ${record.title}`}
            onClick={() => onPlay(record, track)}
          >
            <Play className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {onQueue ? (
          <button
            type="button"
            className="insights-explorer__icon-btn"
            aria-label={`Queue ${record.title}`}
            onClick={() => onQueue(record, track)}
          >
            <ListMusic className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MixPartnerRow({
  pick,
  onPlay,
  onQueue,
}: {
  pick: MixPick;
  onPlay?: (record: VinylRecord, track: Track) => void;
  onQueue?: (record: VinylRecord, track: Track) => void;
}) {
  return (
    <div className="insights-explorer__mix-row">
      <div className="insights-explorer__mix-copy">
        <p className="insights-explorer__mix-title">
          {pick.record.artist} — {pick.track.title}
        </p>
        <p className="insights-explorer__mix-reason">{pick.reason}</p>
      </div>
      <div className="insights-explorer__chip-actions">
        {onPlay ? (
          <button
            type="button"
            className="insights-explorer__icon-btn insights-explorer__icon-btn--play"
            onClick={() => onPlay(pick.record, pick.track)}
            aria-label="Play mix partner"
          >
            <Play className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {onQueue ? (
          <button
            type="button"
            className="insights-explorer__icon-btn"
            onClick={() => onQueue(pick.record, pick.track)}
            aria-label="Queue mix partner"
          >
            <ListMusic className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function InsightExplorer({
  lens,
  records,
  journey,
  onClose,
  onFilter,
  onOpenCollection,
  onPlay,
  onQueue,
  onQueueJourney,
  onSelectCamelot,
  onSpinAgain,
}: InsightExplorerProps) {
  const matched = filterRecordsByLens(records, lens);
  const preview = lensPreviewRecords(records, lens, 5);
  const { title, subtitle } = describeLens(lens, matched.length);
  const filterPatch = lensToFilterPatch(lens);

  const mixPicks =
    lens.kind === 'camelot' ? getMixPicks(records, lens.code, 4) : [];

  const showJourney = lens.kind === 'journey' && journey && journey.length > 0;

  const handleFilter = () => {
    if (filterPatch && onFilter) {
      onFilter(filterPatch);
      onOpenCollection?.();
    } else if (lens.kind === 'release' || lens.kind === 'roulette') {
      const record = records.find((r) => r.id === lens.recordId);
      if (record && onFilter) {
        onFilter({ query: record.artist });
        onOpenCollection?.();
      }
    }
  };

  return (
    <aside className="insights-explorer" aria-label="Selection detail">
      <div className="insights-explorer__head">
        <div className="insights-explorer__head-copy">
          <p className="insights-explorer__kicker">
            <Sparkles className="h-3 w-3" aria-hidden />
            {matched.length} in selection
          </p>
          <h2 className="insights-explorer__title">{title}</h2>
          <p className="insights-explorer__subtitle">{subtitle}</p>
        </div>
        <button type="button" className="insights-explorer__close" onClick={onClose} aria-label="Close detail">
          <X className="h-4 w-4" />
        </button>
      </div>

      {showJourney ? (
        <ol className="insights-explorer__journey" role="list">
          {journey!.map((step, index) => (
            <li key={`${step.record.id}-${index}`} className="insights-explorer__journey-step">
              <span className="insights-explorer__journey-role">{step.role}</span>
              <div className="insights-explorer__journey-copy">
                <p className="insights-explorer__journey-title">
                  {step.record.artist} — {step.track.title}
                </p>
                <p className="insights-explorer__journey-reason">{step.reason}</p>
              </div>
              <div className="insights-explorer__chip-actions">
                {onPlay && index === 0 ? (
                  <button
                    type="button"
                    className="insights-explorer__icon-btn insights-explorer__icon-btn--play"
                    onClick={() => onPlay(step.record, step.track)}
                    aria-label="Play journey opener"
                  >
                    <Play className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : preview.length > 0 ? (
        <div className="insights-explorer__chips" role="list">
          {preview.map((record) => (
            <ReleaseChip
              key={record.id}
              record={record}
              onPlay={onPlay}
              onQueue={onQueue}
            />
          ))}
        </div>
      ) : null}

      {mixPicks.length > 0 ? (
        <div className="insights-explorer__mix">
          <p className="insights-explorer__mix-head">Mix-out partners</p>
          {mixPicks.map((pick) => (
            <MixPartnerRow
              key={`${pick.record.id}-${pick.track.id}`}
              pick={pick}
              onPlay={onPlay}
              onQueue={onQueue}
            />
          ))}
          {onSelectCamelot ? (
            <p className="insights-explorer__mix-hint">
              Or try{' '}
              {mixPicks.slice(0, 2).map((p, i) => {
                const code = resolveTrackCamelot(p.track).code;
                return code ? (
                  <button
                    key={code}
                    type="button"
                    className="insights-inline-link"
                    onClick={() => onSelectCamelot(code!)}
                  >
                    {code}
                    {i < 1 ? ', ' : ''}
                  </button>
                ) : null;
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="insights-explorer__actions">
        {(filterPatch || lens.kind === 'release' || lens.kind === 'roulette') && onFilter ? (
          <button type="button" className="insights-explorer__action insights-explorer__action--primary" onClick={handleFilter}>
            <Filter className="h-3.5 w-3.5" aria-hidden />
            Filter collection
            <span className="insights-explorer__action-count tabular-nums">{matched.length}</span>
          </button>
        ) : null}
        {showJourney && onQueueJourney ? (
          <button
            type="button"
            className="insights-explorer__action insights-explorer__action--primary"
            onClick={() => onQueueJourney(journey!)}
          >
            <ListMusic className="h-3.5 w-3.5" aria-hidden />
            Queue full journey
          </button>
        ) : null}
        {lens.kind === 'roulette' && onPlay ? (
          <button
            type="button"
            className="insights-explorer__action insights-explorer__action--playful"
            onClick={() => {
              const record = records.find((r) => r.id === lens.recordId);
              const track = record ? getPrimaryTrack(record) : null;
              if (record && track) onPlay(record, track);
            }}
          >
            <Play className="h-3.5 w-3.5" aria-hidden />
            Spin it now
          </button>
        ) : null}
        {lens.kind !== 'journey' && preview[0] && onPlay && lens.kind !== 'roulette' ? (
          <button
            type="button"
            className="insights-explorer__action"
            onClick={() => {
              const track = getPrimaryTrack(preview[0]);
              if (track) onPlay(preview[0], track);
            }}
          >
            <Play className="h-3.5 w-3.5" aria-hidden />
            Play top pick
          </button>
        ) : null}
        {lens.kind === 'roulette' && onSpinAgain ? (
          <button type="button" className="insights-explorer__action" onClick={onSpinAgain}>
            <Shuffle className="h-3.5 w-3.5" aria-hidden />
            Spin again
          </button>
        ) : null}
      </div>
    </aside>
  );
}