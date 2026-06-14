import { resolveTrackCamelot } from '../../lib/camelot';
import type { CutRating, Track } from '../../lib/types';
import { CutRatingControl } from './CutRatingControl';
import { EditableBpm } from './EditableBpm';

export function MixStrip({
  track,
  variant,
  className,
  onSaveManualBpm,
  onSaveCutRating,
}: {
  track: Track | null;
  variant: 'now' | 'queue';
  className?: string;
  /** Now playing only — persists as manual BPM (premium over tap/enrich). */
  onSaveManualBpm?: (bpm: number) => void;
  /** Now playing only — tap cycles G → VG → VG+ → blank */
  onSaveCutRating?: (rating: CutRating | undefined) => void;
}) {
  const { code } = track ? resolveTrackCamelot(track) : {};
  const vibes = (track?.vibeTags ?? []).slice(0, 2);
  const canEditBpm = variant === 'now' && Boolean(onSaveManualBpm);
  const canEditRating = variant === 'now' && Boolean(onSaveCutRating);
  const showRating = canEditRating || track?.cutRating != null;

  return (
    <div
      className={`play-dj__mix-strip${variant === 'now' ? ' play-dj__mix-strip--now' : ''}${className ? ` ${className}` : ''}`}
      role="group"
      aria-label="Mix info"
    >
      <div className="play-dj__mix-cell">
        <span className="play-dj__mix-label">BPM</span>
        <EditableBpm
          value={track?.bpm}
          track={track ?? undefined}
          onCommit={canEditBpm ? onSaveManualBpm : undefined}
          size="sm"
          className="play-dj__mix-value"
          ariaLabel="Catalog BPM"
        />
      </div>
      {showRating ? (
        <div className="play-dj__mix-cell play-dj__mix-cell--rating">
          <span className="play-dj__mix-label">Rating</span>
          <CutRatingControl
            rating={track?.cutRating}
            size="sm"
            readonly={!canEditRating}
            onChange={canEditRating ? onSaveCutRating : undefined}
            className="play-dj__mix-value"
          />
        </div>
      ) : null}
      <div className="play-dj__mix-cell">
        <span className="play-dj__mix-label">Key</span>
        <span className="play-dj__mix-value play-dj__mix-value--key font-mono font-semibold">
          {code ? (
            <>
              {track?.keyEstimated ? <span className="text-[var(--text-muted)]">~</span> : null}
              {code}
            </>
          ) : (
            <span className="text-[var(--text-muted)] font-normal">—</span>
          )}
        </span>
      </div>
      <div className="play-dj__mix-cell play-dj__mix-cell--vibes">
        <span className="play-dj__mix-label">Vibe</span>
        <span className="play-dj__mix-value">
          {vibes.length > 0 ? (
            <span className="play-dj__vibe-row">
              {vibes.map((t) => (
                <span key={t} className="play-dj__vibe">
                  {t}
                </span>
              ))}
            </span>
          ) : (
            <span className="text-[var(--text-muted)]">—</span>
          )}
        </span>
      </div>
    </div>
  );
}