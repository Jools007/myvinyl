import { resolveTrackCamelot } from '../../lib/camelot';
import type { Track } from '../../lib/types';

export function MixStrip({
  track,
  variant,
  tapBpm,
}: {
  track: Track | null;
  variant: 'now' | 'queue';
  tapBpm?: number | null;
}) {
  const { code } = track ? resolveTrackCamelot(track) : {};
  const vibes = (track?.vibeTags ?? []).slice(0, 2);
  const showTap = variant === 'now' && tapBpm != null;

  return (
    <div
      className={`play-dj__mix-strip${variant === 'now' ? ' play-dj__mix-strip--now' : ''}`}
      role="group"
      aria-label="Mix info"
    >
      <div className="play-dj__mix-cell">
        <span className="play-dj__mix-label">BPM</span>
        <span className="play-dj__mix-value tabular-nums">
          {showTap ? (
            <span className="play-dj__mix-tap" title="Live tapped tempo">
              {tapBpm}
            </span>
          ) : track?.bpm != null ? (
            <>
              {track.bpmEstimated ? <span className="text-[var(--text-muted)]">~</span> : null}
              {track.bpm}
            </>
          ) : (
            <span className="text-[var(--text-muted)]">—</span>
          )}
        </span>
      </div>
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