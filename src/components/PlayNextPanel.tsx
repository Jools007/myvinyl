import { useEffect, useMemo, useRef } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';
import { useTrackPreview } from '../hooks/useTrackPreview';
import {
  playSelectionKey,
  trackPositionLabel,
  type PlaySelection,
  type ResolvedPlaySelection,
} from '../lib/playSession';
import { openRecordDetail } from '../lib/recordDetail';
import type { KeyPathStep } from '../lib/sessionCrate';
import type { Track, VinylRecord } from '../lib/types';
import { CompatibilityList } from './play/CompatibilityList';
import { MixStrip } from './play/MixStrip';
import { SessionCratePanel } from './play/SessionCratePanel';
import { RecordArtwork } from './RecordArtwork';

interface PlayNextPanelProps {
  collection: VinylRecord[];
  nowPlaying: ResolvedPlaySelection | null;
  queue: ResolvedPlaySelection[];
  crateItems: ResolvedPlaySelection[];
  crateKeyPath: KeyPathStep[];
  isInCrate: (recordId: string, trackId: string) => boolean;
  onPlayNow: (record: VinylRecord, track: Track) => void;
  onAddToCrate: (record: VinylRecord, track: Track) => void;
  onRemoveFromCrate: (index: number) => void;
  onMoveCrateUp: (index: number) => void;
  onMoveCrateDown: (index: number) => void;
  onClearCrate: () => void;
  onLoadCrateToQueue: () => void;
}

function formatPreviewTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function NowPlayingArtwork({
  record,
  spinning,
  spinDurationSec,
}: {
  record: VinylRecord;
  spinning: boolean;
  spinDurationSec?: number;
}) {
  return (
    <button
      type="button"
      className={`play-dj__disc play-dj__disc-btn${spinning ? ' play-dj__disc--active' : ''}`}
      onClick={() => openRecordDetail(record)}
      aria-label={`View ${record.title} by ${record.artist}`}
    >
      <div
        className={`play-dj__disc-rotor${spinning ? ' play-dj__disc-rotor--spinning' : ''}`}
        style={
          spinning && spinDurationSec != null
            ? { animationDuration: `${spinDurationSec}s` }
            : undefined
        }
      >
        <RecordArtwork
          src={record.coverUrl}
          title={record.title}
          size="now"
          className="play-dj__cover play-dj__cover--now"
        />
        <span className="play-dj__disc-grooves" aria-hidden />
        <span className="play-dj__disc-sheen" aria-hidden />
      </div>
      <span className="play-dj__disc-spindle" aria-hidden />
    </button>
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

export function PlayNextPanel({
  collection,
  nowPlaying,
  queue,
  crateItems,
  crateKeyPath,
  isInCrate,
  onPlayNow,
  onAddToCrate,
  onRemoveFromCrate,
  onMoveCrateUp,
  onMoveCrateDown,
  onClearCrate,
  onLoadCrateToQueue,
}: PlayNextPanelProps) {
  const preview = useTrackPreview();
  const autoplayPendingRef = useRef<string | null>(null);

  const exclude = useMemo((): PlaySelection[] => {
    const refs: PlaySelection[] = [
      ...queue.map((q) => ({ recordId: q.record.id, trackId: q.track.id })),
      ...crateItems.map((c) => ({ recordId: c.record.id, trackId: c.track.id })),
    ];
    if (nowPlaying) {
      refs.push({ recordId: nowPlaying.record.id, trackId: nowPlaying.track.id });
    }
    return refs;
  }, [queue, crateItems, nowPlaying]);

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

  const handlePlay = (record: VinylRecord, track: Track) => {
    autoplayPendingRef.current = playSelectionKey({
      recordId: record.id,
      trackId: track.id,
    });
    onPlayNow(record, track);
  };

  const handlePreviewToggle = () => {
    if (!nowPlaying) return;
    const ref = { recordId: nowPlaying.record.id, trackId: nowPlaying.track.id };
    if (preview.status === 'loading') return;

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
    preview.toggle();
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
          Build tonight&apos;s crate from compatible picks — reorder, load the queue, and spin.
        </p>
      </header>

      <div className="play-dj__sticky-wrap">
        {nowPlaying ? (
          <div className="play-dj__now" role="status" aria-label="Now playing">
            <div className="play-dj__now-stage">
              <NowPlayingArtwork record={nowPlaying.record} spinning={artworkSpinning} />
            </div>
            <div className="play-dj__now-body">
              <p className="play-dj__now-label">
                <span className="play-dj__now-live" aria-hidden />
                Now playing
              </p>
              <button
                type="button"
                className="play-dj__now-meta play-dj__now-meta-btn"
                onClick={() => openRecordDetail(nowPlaying.record)}
                aria-label={`View ${nowPlaying.record.title} by ${nowPlaying.record.artist}`}
              >
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
              </button>
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
          <div className="play-dj__now play-dj__now--hint">
            <p className="text-sm font-medium text-[var(--text)]">
              Pick a track to start mixing
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
              Tap play on a compatible pick below — or open a release and use Play Now on a track.
            </p>
          </div>
        )}
      </div>

      <div className="play-dj__grid">
        <CompatibilityList
          collection={collection}
          anchor={nowPlaying}
          exclude={exclude}
          isInCrate={isInCrate}
          onPlayNow={handlePlay}
          onAddToCrate={onAddToCrate}
        />
        <SessionCratePanel
          items={crateItems}
          keyPath={crateKeyPath}
          onRemove={onRemoveFromCrate}
          onMoveUp={onMoveCrateUp}
          onMoveDown={onMoveCrateDown}
          onClear={onClearCrate}
          onLoadQueue={onLoadCrateToQueue}
          onPlayNow={(index) => {
            const item = crateItems[index];
            if (item) handlePlay(item.record, item.track);
          }}
        />
      </div>
    </div>
  );
}