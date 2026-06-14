import { useMemo, type KeyboardEvent } from 'react';
import { Play } from 'lucide-react';
import {
  recommendTieredCompatibility,
  TIER_HINTS,
  TIER_LABELS,
  type CompatibilityOptions,
  type CompatibilityPick,
  type CompatibilityTier,
  type TieredCompatibility,
} from '../../lib/compatibility';
import { RESEARCH_MATCH_HINTS } from '../../lib/matchProbability';
import { openRecordDetail } from '../../lib/recordDetail';
import { trackPositionLabel, type PlaySelection, type ResolvedPlaySelection } from '../../lib/playSession';
import type { Track, VinylRecord } from '../../lib/types';
import { RecordArtwork } from '../RecordArtwork';
import { MixStrip } from './MixStrip';

const TIER_ORDER: CompatibilityTier[] = ['perfect', 'smooth', 'stretch'];

type CompatibilityListProps = {
  collection: VinylRecord[];
  anchor: ResolvedPlaySelection | null;
  exclude: PlaySelection[];
  matchOptions?: CompatibilityOptions;
  onPlayNow: (record: VinylRecord, track: Track) => void;
  /** When true, omit outer browse chrome (used inside PlayBrowsePanel). */
  embedded?: boolean;
};

function CompatibilityRow({
  pick,
  onPlayNow,
}: {
  pick: CompatibilityPick;
  onPlayNow: () => void;
}) {
  const { record, track, reason, probability, tier } = pick;
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
            <span
              className={`play-compat__prob play-compat__prob--${tier}`}
              title="Blend probability"
            >
              {probability}%
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
          <p className="play-compat__reason">{reason}</p>
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

function TierSection({
  tier,
  picks,
  onPlayNow,
  showHint,
}: {
  tier: CompatibilityTier;
  picks: CompatibilityPick[];
  onPlayNow: (record: VinylRecord, track: Track) => void;
  showHint?: boolean;
}) {
  if (picks.length === 0) return null;

  return (
    <section className={`play-compat__tier play-compat__tier--${tier}`} aria-labelledby={`tier-${tier}`}>
      <div className="play-compat__tier-head">
        <h3 id={`tier-${tier}`} className="play-compat__tier-title">
          {TIER_LABELS[tier]}
          <span className="play-compat__tier-count tabular-nums">{picks.length}</span>
        </h3>
        {showHint ? (
          <p className="play-compat__tier-hint">{TIER_HINTS[tier]}</p>
        ) : null}
      </div>
      <ul className="play-compat__list">
        {picks.map((pick) => (
          <CompatibilityRow
            key={`${pick.record.id}-${pick.track.id}`}
            pick={pick}
            onPlayNow={() => onPlayNow(pick.record, pick.track)}
          />
        ))}
      </ul>
    </section>
  );
}

export function CompatibilityList({
  collection,
  anchor,
  exclude,
  matchOptions,
  onPlayNow,
  embedded = false,
}: CompatibilityListProps) {
  const tiered: TieredCompatibility = useMemo(
    () => recommendTieredCompatibility(collection, anchor, exclude, 5, matchOptions),
    [collection, anchor, exclude, matchOptions]
  );

  const total =
    tiered.perfect.length + tiered.smooth.length + tiered.stretch.length;

  return (
    <div className={`play-compat${embedded ? ' play-compat--embedded' : ''}`}>
      <div className={`play-compat__head${embedded ? ' play-compat__head--embedded' : ''}`}>
        <div className="play-compat__head-copy">
          <div className="play-compat__head-row">
            <h2 className="play-compat__section-title" id="play-compatible">
              {anchor ? 'Mix partners' : 'Start from your crate'}
            </h2>
            {total > 0 ? (
              <span className="play-compat__count tabular-nums">{total}</span>
            ) : null}
          </div>
          {anchor ? (
            <p className="play-compat__research-hint" title={RESEARCH_MATCH_HINTS.join(' ')}>
              {RESEARCH_MATCH_HINTS[0]}
            </p>
          ) : null}
        </div>
      </div>

      {total === 0 ? (
        <p className="play-compat__empty text-sm text-[var(--text-muted)]">
          {anchor
            ? 'No viable blends in range — tap BPM on the deck or enrich more tracks.'
            : 'Play a track from your collection to start practicing blends.'}
        </p>
      ) : (
        TIER_ORDER.map((tier, index) => (
          <TierSection
            key={tier}
            tier={tier}
            picks={tiered[tier]}
            showHint={index === 0 && tiered[tier].length > 0}
            onPlayNow={onPlayNow}
          />
        ))
      )}
    </div>
  );
}