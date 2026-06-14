import { useState, type KeyboardEvent } from 'react';
import type { CompatibilityOptions } from '../../lib/compatibility';
import { formatAddedAtLabel, listRecentlyAdded } from '../../lib/recentlyAdded';
import { openRecordDetail } from '../../lib/recordDetail';
import { trackPositionLabel, type PlaySelection, type ResolvedPlaySelection } from '../../lib/playSession';
import type { Track, VinylRecord } from '../../lib/types';
import { CompatibilityList } from './CompatibilityList';
import { Play } from 'lucide-react';
import { RecordArtwork } from '../RecordArtwork';
import { MixStrip } from './MixStrip';

export type PlayBrowseMode = 'mix' | 'recent';

type PlayBrowsePanelProps = {
  collection: VinylRecord[];
  anchor: ResolvedPlaySelection | null;
  exclude: PlaySelection[];
  matchOptions?: CompatibilityOptions;
  onPlayNow: (record: VinylRecord, track: Track) => void;
};

function RecentlyAddedRow({
  record,
  track,
  addedLabel,
  onPlayNow,
}: {
  record: VinylRecord;
  track: Track;
  addedLabel: string;
  onPlayNow: () => void;
}) {
  const trackIndex = Math.max(0, record.tracks.findIndex((t) => t.id === track.id));

  const openDetail = () => openRecordDetail(record);

  const handleMainKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openDetail();
    }
  };

  return (
    <li className="play-compat__row">
      <div
        role="button"
        tabIndex={0}
        className="play-compat__main"
        onClick={openDetail}
        onKeyDown={handleMainKeyDown}
      >
        <RecordArtwork
          src={record.coverUrl}
          title={record.title}
          size="queue"
          className="play-dj__cover play-dj__cover--queue shrink-0"
        />
        <div className="play-compat__body">
          <div className="play-compat__title-row">
            <p className="play-compat__title">{track.title}</p>
            <span className="play-recent__added" title={addedLabel}>
              {addedLabel}
            </span>
          </div>
          <p className="play-compat__artist">
            <span className="text-[var(--text-muted)]">
              {trackPositionLabel(track, trackIndex)}
            </span>
            <span className="text-[var(--text-muted)]"> · </span>
            {record.artist}
            <span className="text-[var(--text-muted)]"> — {record.title}</span>
          </p>
          <MixStrip track={track} variant="queue" className="play-compat__mix" />
        </div>
      </div>
      <div className="play-compat__actions">
        <button
          type="button"
          className="play-dj__spin"
          onClick={onPlayNow}
          aria-label={`Play now — ${track.title}`}
        >
          <Play className="h-3.5 w-3.5 fill-current" strokeWidth={0} />
        </button>
      </div>
    </li>
  );
}

export function PlayBrowsePanel({
  collection,
  anchor,
  exclude,
  matchOptions,
  onPlayNow,
}: PlayBrowsePanelProps) {
  const [mode, setMode] = useState<PlayBrowseMode>('recent');
  const recentPicks = listRecentlyAdded(collection, exclude);

  return (
    <div className="play-browse">
      <div className="play-browse__head">
        <div
          className="play-browse__toggle"
          role="tablist"
          aria-label="Browse play suggestions"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'recent'}
            className={`play-browse__toggle-btn${mode === 'recent' ? ' play-browse__toggle-btn--active' : ''}`}
            onClick={() => setMode('recent')}
          >
            Recently added
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'mix'}
            className={`play-browse__toggle-btn${mode === 'mix' ? ' play-browse__toggle-btn--active' : ''}`}
            onClick={() => setMode('mix')}
          >
            Mix partners
          </button>
        </div>
      </div>

      {mode === 'mix' ? (
        <CompatibilityList
          embedded
          collection={collection}
          anchor={anchor}
          exclude={exclude}
          matchOptions={matchOptions}
          onPlayNow={onPlayNow}
        />
      ) : (
        <div className="play-compat play-recent">
          <div className="play-compat__head">
            <div className="play-compat__head-copy">
              <div className="play-compat__head-row">
                <h2 className="play-compat__section-title" id="play-recent">
                  Recently added
                </h2>
                {recentPicks.length > 0 ? (
                  <span className="play-compat__count tabular-nums">{recentPicks.length}</span>
                ) : null}
              </div>
              <p className="play-compat__research-hint">
                Newest records in your crate — tap play to load on the deck.
              </p>
            </div>
          </div>

          {recentPicks.length === 0 ? (
            <p className="play-compat__empty text-sm text-[var(--text-muted)]">
              Nothing new in the crate yet. Add vinyl from Discogs to see it here.
            </p>
          ) : (
            <ul className="play-compat__list">
              {recentPicks.map(({ record, track, addedAt }) => (
                <RecentlyAddedRow
                  key={`${record.id}-${track.id}`}
                  record={record}
                  track={track}
                  addedLabel={formatAddedAtLabel(addedAt)}
                  onPlayNow={() => onPlayNow(record, track)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}