import { ListPlus, Play } from 'lucide-react';
import {
  recommendTieredCompatibility,
  TIER_HINTS,
  TIER_LABELS,
  type CompatibilityPick,
  type CompatibilityTier,
  type TieredCompatibility,
} from '../../lib/compatibility';
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
  isInCrate: (recordId: string, trackId: string) => boolean;
  onPlayNow: (record: VinylRecord, track: Track) => void;
  onAddToCrate: (record: VinylRecord, track: Track) => void;
};

function CompatibilityRow({
  pick,
  inCrate,
  onPlayNow,
  onAddToCrate,
}: {
  pick: CompatibilityPick;
  inCrate: boolean;
  onPlayNow: () => void;
  onAddToCrate: () => void;
}) {
  const { record, track, reason } = pick;
  const trackIndex = Math.max(0, record.tracks.findIndex((t) => t.id === track.id));

  return (
    <li className={`play-compat__row${inCrate ? ' play-compat__row--in-crate' : ''}`}>
      <button
        type="button"
        className="play-compat__main"
        onClick={() => openRecordDetail(record)}
      >
        <RecordArtwork
          src={record.coverUrl}
          title={record.title}
          size="queue"
          className="play-dj__cover play-dj__cover--queue shrink-0"
        />
        <div className="play-compat__body">
          <p className="play-compat__title">{track.title}</p>
          <p className="play-compat__artist">
            <span className="text-[var(--text-muted)]">
              {trackPositionLabel(track, trackIndex)}
            </span>
            <span className="text-[var(--text-muted)]"> · </span>
            {record.artist}
            <span className="text-[var(--text-muted)]"> — {record.title}</span>
          </p>
          <p className="play-compat__reason">{reason}</p>
          <MixStrip track={track} variant="queue" />
        </div>
      </button>
      <div className="play-compat__actions">
        <button
          type="button"
          className="play-compat__icon-btn"
          onClick={onAddToCrate}
          disabled={inCrate}
          aria-label={inCrate ? 'Already in crate' : 'Add to tonight\'s crate'}
          title={inCrate ? 'In crate' : 'Add to crate'}
        >
          <ListPlus className="h-3.5 w-3.5" />
        </button>
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
  isInCrate,
  onPlayNow,
  onAddToCrate,
}: {
  tier: CompatibilityTier;
  picks: CompatibilityPick[];
  isInCrate: (recordId: string, trackId: string) => boolean;
  onPlayNow: (record: VinylRecord, track: Track) => void;
  onAddToCrate: (record: VinylRecord, track: Track) => void;
}) {
  if (picks.length === 0) return null;

  return (
    <section className={`play-compat__tier play-compat__tier--${tier}`} aria-labelledby={`tier-${tier}`}>
      <div className="play-compat__tier-head">
        <h3 id={`tier-${tier}`} className="play-compat__tier-title">
          {TIER_LABELS[tier]}
        </h3>
        <p className="play-compat__tier-hint">{TIER_HINTS[tier]}</p>
      </div>
      <ul className="play-compat__list">
        {picks.map((pick) => (
          <CompatibilityRow
            key={`${pick.record.id}-${pick.track.id}`}
            pick={pick}
            inCrate={isInCrate(pick.record.id, pick.track.id)}
            onPlayNow={() => onPlayNow(pick.record, pick.track)}
            onAddToCrate={() => onAddToCrate(pick.record, pick.track)}
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
  isInCrate,
  onPlayNow,
  onAddToCrate,
}: CompatibilityListProps) {
  const tiered: TieredCompatibility = recommendTieredCompatibility(
    collection,
    anchor,
    exclude,
    5
  );

  const total =
    tiered.perfect.length + tiered.smooth.length + tiered.stretch.length;

  return (
    <div className="play-compat">
      <div className="play-compat__head">
        <h2 className="play-compat__title" id="play-compatible">
          {anchor ? 'Mix partners' : 'Start from your crate'}
        </h2>
        {total > 0 ? (
          <span className="play-compat__count tabular-nums">{total}</span>
        ) : null}
      </div>

      {total === 0 ? (
        <p className="play-compat__empty text-sm text-[var(--text-muted)]">
          {anchor
            ? 'No harmonic matches in range — try a wider BPM or enrich more tracks.'
            : 'Play a track to see tiered compatibility from your library.'}
        </p>
      ) : (
        TIER_ORDER.map((tier) => (
          <TierSection
            key={tier}
            tier={tier}
            picks={tiered[tier]}
            isInCrate={isInCrate}
            onPlayNow={onPlayNow}
            onAddToCrate={onAddToCrate}
          />
        ))
      )}
    </div>
  );
}