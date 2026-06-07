import { useEffect, useMemo, useRef } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';
import { resolveTrackCamelot } from '../lib/camelot';
import { useTrackPreview } from '../hooks/useTrackPreview';
import { playSelectionKey, trackPositionLabel, type ResolvedPlaySelection } from '../lib/playSession';
import { recommendNext } from '../lib/recommendations';
import type { Track, VinylRecord } from '../lib/types';
import { RecordArtwork } from './RecordArtwork';

export type UpNextRow = {
  record: VinylRecord;
  track: Track;
  reasons: string[];
  queued?: boolean;
};

interface PlayNextPanelProps {
  collection: VinylRecord[];
  nowPlaying: ResolvedPlaySelection | null;
  queue: ResolvedPlaySelection[];
  onSelect: (record: VinylRecord) => void;
  onPlayNow: (record: VinylRecord, track: Track) => void;
}

function formatPreviewTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function NowPlayingArtwork({
  src,
  title,
  spinning,
}: {
  src?: string;
  title: string;
  spinning: boolean;
}) {
  return (
    <div className={`play-dj__disc${spinning ? ' play-dj__disc--active' : ''}`}>
      <div
        className={`play-dj__disc-rotor${spinning ? ' play-dj__disc-rotor--spinning' : ''}`}
      >
        <RecordArtwork
          src={src}
          title={title}
          size="now"
          className="play-dj__cover play-dj__cover--now"
        />
        <span className="play-dj__disc-grooves" aria-hidden />
        <span className="play-dj__disc-sheen" aria-hidden />
      </div>
      <span className="play-dj__disc-spindle" aria-hidden />
    </div>
  );
}

function PreviewControls({
  status,
  source,
  youtubeMuted,
  progress,
  elapsed,
  duration,
  onToggle,
}: {
  status: ReturnType<typeof useTrackPreview>['status'];
  source: ReturnType<typeof useTrackPreview>['source'];
  youtubeMuted: boolean;
  progress: number;
  elapsed: number;
  duration: number;
  onToggle: () => void;
}) {
  const busy = status === 'loading';
  const playing = status === 'playing';
  const unavailable = status === 'unavailable' || status === 'rate_limited';
  const canPlay = !busy && !unavailable;

  let hint = 'Tap to play';
  if (status === 'loading') hint = 'Finding audio…';
  else if (status === 'rate_limited') hint = 'Spotify busy — retry shortly';
  else if (status === 'unavailable') hint = 'No audio found';
  else if (status === 'error') hint = 'Playback failed — tap to retry';
  else if (source === 'spotify') hint = 'Spotify · 30s preview';
  else if (source === 'youtube' && youtubeMuted && playing) hint = 'Tap play for sound';
  else if (source === 'youtube') hint = 'YouTube audio';

  return (
    <div className="play-dj__preview" role="group" aria-label="Track preview playback">
      <button
        type="button"
        className="play-dj__preview-btn"
        onClick={onToggle}
        disabled={!canPlay}
        aria-label={playing ? 'Pause playback' : 'Play track audio'}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
        ) : playing ? (
          <Pause className="h-4 w-4 fill-current" strokeWidth={0} />
        ) : (
          <Play className="h-4 w-4 fill-current" strokeWidth={0} />
        )}
      </button>
      <div className="play-dj__preview-track">
        <div
          className="play-dj__preview-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={Math.round(elapsed)}
          aria-label="Preview progress"
        >
          <div
            className="play-dj__preview-fill"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <div className="play-dj__preview-meta">
          <span className="play-dj__preview-time tabular-nums">
            {formatPreviewTime(elapsed)} / {formatPreviewTime(duration)}
          </span>
          <span className="play-dj__preview-hint">{hint}</span>
        </div>
      </div>
    </div>
  );
}

function MixStrip({
  track,
  variant,
}: {
  track: Track | null;
  variant: 'now' | 'queue';
}) {
  const { code } = track ? resolveTrackCamelot(track) : {};
  const vibes = (track?.vibeTags ?? []).slice(0, 2);

  return (
    <div
      className={`play-dj__mix-strip${variant === 'now' ? ' play-dj__mix-strip--now' : ''}`}
      role="group"
      aria-label="Mix info"
    >
      <div className="play-dj__mix-cell">
        <span className="play-dj__mix-label">BPM</span>
        <span className="play-dj__mix-value tabular-nums">
          {track?.bpm != null ? (
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
          {code ?? <span className="text-[var(--text-muted)] font-normal">—</span>}
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

function PlayRow({
  row,
  rank,
  trackIndex,
  onSelect,
  onPlayNow,
}: {
  row: UpNextRow;
  rank: number;
  trackIndex: number;
  onSelect: () => void;
  onPlayNow: () => void;
}) {
  const { record, track, reasons } = row;
  const harmonic = reasons.find((r) => r.startsWith('Harmonic match'));
  const queued = row.queued;
  const pos = trackPositionLabel(track, trackIndex);

  return (
    <li className={`play-dj__row${queued ? ' play-dj__row--queued' : ''}`}>
      <button type="button" className="play-dj__row-main" onClick={onSelect}>
        <span className="play-dj__rank tabular-nums">{rank}</span>
        <RecordArtwork
          src={record.coverUrl}
          title={record.title}
          size="queue"
          className="play-dj__cover play-dj__cover--queue shrink-0"
        />
        <div className="play-dj__row-body">
          <div className="play-dj__row-head">
            <p className="play-dj__row-title">{track.title}</p>
            <p className="play-dj__row-artist">
              <span className="text-[var(--text-muted)]">{pos}</span>
              <span className="text-[var(--text-muted)]"> · </span>
              {record.artist}
              <span className="text-[var(--text-muted)]"> — {record.title}</span>
              {record.year ? (
                <span className="text-[var(--text-muted)]"> · {record.year}</span>
              ) : null}
            </p>
          </div>
          {queued ? (
            <p className="play-dj__harmonic">In your queue</p>
          ) : harmonic ? (
            <p className="play-dj__harmonic">{harmonic}</p>
          ) : null}
          <MixStrip track={track} variant="queue" />
        </div>
      </button>
      <button
        type="button"
        className="play-dj__spin"
        onClick={(e) => {
          e.stopPropagation();
          onPlayNow();
        }}
        aria-label={`Play now — ${track.title}`}
      >
        <Play className="h-3.5 w-3.5 fill-current" strokeWidth={0} />
      </button>
    </li>
  );
}

export function PlayNextPanel({
  collection,
  nowPlaying,
  queue,
  onSelect,
  onPlayNow,
}: PlayNextPanelProps) {
  const preview = useTrackPreview();
  const autoplayPendingRef = useRef<string | null>(null);

  const exclude = useMemo(() => {
    const refs = queue.map((q) => ({ recordId: q.record.id, trackId: q.track.id }));
    if (nowPlaying) {
      refs.push({ recordId: nowPlaying.record.id, trackId: nowPlaying.track.id });
    }
    return refs;
  }, [queue, nowPlaying]);

  const suggestions = useMemo(
    () => recommendNext(collection, nowPlaying, 6, exclude),
    [collection, nowPlaying, exclude]
  );

  const upNext = useMemo((): UpNextRow[] => {
    const queued: UpNextRow[] = queue.map((item) => ({
      record: item.record,
      track: item.track,
      reasons: ['In your queue'],
      queued: true,
    }));
    const suggested: UpNextRow[] = suggestions.map((s) => ({
      record: s.record,
      track: s.track,
      reasons: s.reasons,
    }));
    return [...queued, ...suggested];
  }, [queue, suggestions]);

  const nowKey = nowPlaying
    ? playSelectionKey({ recordId: nowPlaying.record.id, trackId: nowPlaying.track.id })
    : null;

  useEffect(() => {
    if (!nowPlaying) {
      preview.reset();
      return;
    }

    const autoplay = autoplayPendingRef.current === nowKey;
    if (autoplay) autoplayPendingRef.current = null;
    void preview.load(nowPlaying.record, nowPlaying.track, autoplay, false);
  }, [nowKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpNextPlay = (record: VinylRecord, track: Track) => {
    autoplayPendingRef.current = playSelectionKey({
      recordId: record.id,
      trackId: track.id,
    });
    onPlayNow(record, track);
  };

  const handlePreviewToggle = () => {
    if (!nowPlaying) return;
    const ref = { recordId: nowPlaying.record.id, trackId: nowPlaying.track.id };
    const needsLoad =
      !preview.matchesSelection(ref) ||
      preview.status === 'idle' ||
      preview.status === 'unavailable' ||
      preview.status === 'error' ||
      preview.status === 'rate_limited';
    if (needsLoad) {
      void preview.load(nowPlaying.record, nowPlaying.track, true, true);
      return;
    }
    void preview.toggle();
  };

  const artworkSpinning = preview.status === 'playing';

  if (!collection.length) {
    return (
      <div className="play-dj play-dj--empty rounded-xl border border-dashed border-[var(--border)] px-6 py-14 text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          Add records to your collection, then play a track to see what mixes well next.
        </p>
      </div>
    );
  }

  const trackIndex =
    nowPlaying?.record.tracks.findIndex((t) => t.id === nowPlaying.track.id) ?? 0;

  return (
    <div className="play-dj">
      <header className="play-dj__page-head">
        <h1 className="play-dj__page-title" style={{ fontFamily: 'var(--font-display)' }}>
          Play
        </h1>
        <p className="play-dj__page-sub">
          Mix by BPM, Camelot key, and vibe — pick the next track from your crate.
        </p>
      </header>

      <div className="play-dj__sticky-wrap">
        {nowPlaying ? (
          <div className="play-dj__now" role="status" aria-label="Now playing">
            <div className="play-dj__now-stage">
              <NowPlayingArtwork
                src={nowPlaying.record.coverUrl}
                title={nowPlaying.record.title}
                spinning={artworkSpinning}
              />
            </div>
            <div className="play-dj__now-body">
              <p className="play-dj__now-label">
                <span className="play-dj__now-live" aria-hidden />
                Now playing
              </p>
              <div className="play-dj__now-meta">
                <p className="play-dj__now-title">{nowPlaying.track.title}</p>
                <p className="play-dj__now-artist">
                  <span className="text-[var(--text-muted)]">
                    {trackPositionLabel(nowPlaying.track, trackIndex)}
                  </span>
                  <span className="text-[var(--text-muted)]"> · </span>
                  {nowPlaying.record.artist}
                  <span className="text-[var(--text-muted)]">
                    {' '}
                    — {nowPlaying.record.title}
                  </span>
                  {nowPlaying.record.year ? (
                    <span className="text-[var(--text-muted)]">
                      {' '}
                      · {nowPlaying.record.year}
                    </span>
                  ) : null}
                </p>
              </div>
              <PreviewControls
                status={preview.status}
                source={preview.source}
                youtubeMuted={preview.youtubeMuted}
                progress={preview.progress}
                elapsed={preview.elapsed}
                duration={preview.duration}
                onToggle={handlePreviewToggle}
              />
              <MixStrip track={nowPlaying.track} variant="now" />
            </div>
          </div>
        ) : (
          <p className="play-dj__now play-dj__now--hint text-sm leading-relaxed text-[var(--text-secondary)]">
            Expand a release in your collection and use Play Now on a track to start mixing.
          </p>
        )}
      </div>

      <section className="play-dj__queue" aria-labelledby="play-up-next">
        <h2 id="play-up-next" className="play-dj__queue-title">
          Up next
          {upNext.length > 0 ? (
            <span className="play-dj__queue-count">{upNext.length}</span>
          ) : null}
        </h2>

        {upNext.length > 0 ? (
          <ul className="play-dj__list">
            {upNext.map((row, i) => (
              <PlayRow
                key={`${row.record.id}-${row.track.id}-${row.queued ? 'q' : 's'}`}
                row={row}
                rank={i + 1}
                trackIndex={Math.max(
                  0,
                  row.record.tracks.findIndex((t) => t.id === row.track.id)
                )}
                onSelect={() => onSelect(row.record)}
                onPlayNow={() => handleUpNextPlay(row.record, row.track)}
              />
            ))}
          </ul>
        ) : (
          <p className="play-dj__empty-queue text-sm text-[var(--text-muted)]">
            {nowPlaying
              ? 'No matches yet — add tracks to your queue or enrich more records.'
              : 'Play a track to see mix suggestions.'}
          </p>
        )}
      </section>
    </div>
  );
}