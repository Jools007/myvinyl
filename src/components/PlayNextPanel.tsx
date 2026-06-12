import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Shuffle } from 'lucide-react';
import { useTapBpm } from '../hooks/useTapBpm';
import { useTrackPreview } from '../hooks/useTrackPreview';
import type { CompatibilityOptions } from '../lib/compatibility';
import { pickRandomPracticeAnchor } from '../lib/practiceAnchor';
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
import { PreviewControls } from './play/PreviewControls';
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
  onSaveTapBpm?: (recordId: string, trackId: string, bpm: number) => void;
  onRemoveFromCrate: (index: number) => void;
  onMoveCrateUp: (index: number) => void;
  onMoveCrateDown: (index: number) => void;
  onClearCrate: () => void;
  onLoadCrateToQueue: () => void;
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

export function PlayNextPanel({
  collection,
  nowPlaying,
  queue,
  crateItems,
  crateKeyPath,
  isInCrate,
  onPlayNow,
  onAddToCrate,
  onSaveTapBpm,
  onRemoveFromCrate,
  onMoveCrateUp,
  onMoveCrateDown,
  onClearCrate,
  onLoadCrateToQueue,
}: PlayNextPanelProps) {
  const preview = useTrackPreview();
  const tapBpm = useTapBpm();
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

  const handlePlay = useCallback(
    (record: VinylRecord, track: Track) => {
      tapBpm.reset();
      autoplayPendingRef.current = playSelectionKey({
        recordId: record.id,
        trackId: track.id,
      });
      onPlayNow(record, track);
    },
    [onPlayNow, tapBpm]
  );

  const matchOptions = useMemo((): CompatibilityOptions | undefined => {
    if (tapBpm.bpm == null) return undefined;
    return { anchorBpmOverride: tapBpm.bpm, bpmUncertainty: 3 };
  }, [tapBpm.bpm]);

  const handleShufflePractice = useCallback(() => {
    const pick = pickRandomPracticeAnchor(collection, exclude);
    if (pick) handlePlay(pick.record, pick.track);
  }, [collection, exclude, handlePlay]);

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

  const handleSaveTapBpm = () => {
    if (!nowPlaying || tapBpm.bpm == null || !onSaveTapBpm) return;
    onSaveTapBpm(nowPlaying.record.id, nowPlaying.track.id, tapBpm.bpm);
    tapBpm.reset();
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

  const catalogBpm = nowPlaying?.track.bpm;
  const tapDiffers =
    tapBpm.bpm != null &&
    (catalogBpm == null ||
      nowPlaying?.track.bpmEstimated ||
      Math.abs(tapBpm.bpm - catalogBpm) >= 2);
  const showSaveTap =
    tapBpm.bpm != null && tapDiffers && Boolean(onSaveTapBpm);

  return (
    <div className="play-dj">
      <header className="play-dj__page-head">
        <div className="play-dj__page-head-row">
          <div>
            <h1 className="play-dj__page-title" style={{ fontFamily: 'var(--font-display)' }}>
              Play
            </h1>
            <p className="play-dj__page-sub">
              Compatible picks for tonight&apos;s crate — tap BPM on vinyl to sharpen matches.
            </p>
          </div>
          <button
            type="button"
            className="play-dj__head-shuffle"
            onClick={handleShufflePractice}
            title="Random enriched track from your collection"
          >
            <Shuffle className="h-3.5 w-3.5" strokeWidth={2} />
            <span>Shuffle</span>
          </button>
        </div>
      </header>

      <div className="play-dj__deck-wrap">
        {nowPlaying ? (
          <div className="play-dj__now" role="status" aria-label="Now playing">
                <div className="play-dj__now-top">
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
                      onSeek={preview.seekTo}
                      onSkip={preview.skipBy}
                    />
                  </div>
                </div>

                <div className="play-dj__now-mix">
                  <MixStrip
                    track={nowPlaying.track}
                    variant="now"
                    tapBpm={tapBpm.bpm}
                  />
                  <div className="play-dj__tap-row" role="group" aria-label="Live BPM tap">
                    <button
                      type="button"
                      className={`play-dj__tap-btn${tapBpm.isActive ? ' play-dj__tap-btn--active' : ''}`}
                      onClick={tapBpm.tap}
                      aria-label="Tap tempo on beat"
                    >
                      Tap BPM
                      {tapBpm.tapCount > 0 && tapBpm.tapCount < 4 ? (
                        <span className="play-dj__tap-count tabular-nums">
                          {tapBpm.tapCount}/4
                        </span>
                      ) : null}
                    </button>
                    {tapBpm.bpm != null ? (
                      <span className="play-dj__tap-result tabular-nums">{tapBpm.bpm} BPM</span>
                    ) : (
                      <span className="play-dj__tap-hint">Tap on the beat while spinning</span>
                    )}
                    {showSaveTap ? (
                      <button
                        type="button"
                        className="play-dj__tap-save"
                        onClick={handleSaveTapBpm}
                      >
                        {nowPlaying.track.bpmEstimated || catalogBpm == null
                          ? `Save ${tapBpm.bpm} BPM`
                          : `Replace ~${catalogBpm}`}
                      </button>
                    ) : null}
                    {tapBpm.bpm != null ? (
                      <button
                        type="button"
                        className="play-dj__tap-clear"
                        onClick={tapBpm.reset}
                        aria-label="Clear tapped BPM"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                  {tapBpm.bpm != null ? (
                    <p className="play-dj__tap-note">
                      Matching at {tapBpm.bpm} BPM
                      <span className="text-[var(--text-muted)]"> ±3</span>
                      {showSaveTap ? (
                        <span className="text-[var(--text-muted)]">
                          {' '}
                          · save to replace catalog estimate
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              </div>
        ) : (
          <div className="play-dj__now play-dj__now--hint">
            <p className="text-sm font-medium text-[var(--text)]">
              Pick a track to start mixing
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
              Hit Shuffle above, or tap play on a compatible pick below.
            </p>
          </div>
        )}
      </div>

      <div className="play-dj__workspace">
        <CompatibilityList
          collection={collection}
          anchor={nowPlaying}
          exclude={exclude}
          matchOptions={matchOptions}
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