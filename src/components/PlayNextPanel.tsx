import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Disc3, Loader2, Sparkles } from 'lucide-react';
import { useTapBpm } from '../hooks/useTapBpm';
import { useTrackPreview } from '../hooks/useTrackPreview';
import type { CompatibilityOptions } from '../lib/compatibility';

import {
  playSelectionKey,
  trackPositionLabel,
  type PlaySelection,
  type ResolvedPlaySelection,
} from '../lib/playSession';
import { openRecordDetail } from '../lib/recordDetail';
import type { CutRating, Track, VinylRecord } from '../lib/types';
import { PlayBrowsePanel } from './play/PlayBrowsePanel';
import { EditableBpm } from './play/EditableBpm';
import { MixStrip } from './play/MixStrip';
import { ReleaseTrackPickerSheet } from './play/ReleaseTrackPickerSheet';
import { PlaybackDebugBar } from './play/PlaybackDebugBar';
import { PreviewControls } from './play/PreviewControls';
import { RecordArtwork } from './RecordArtwork';
interface PlayNextPanelProps {
  collection: VinylRecord[];
  nowPlaying: ResolvedPlaySelection | null;
  queue: ResolvedPlaySelection[];
  onPlayNow: (record: VinylRecord, track: Track) => void;
  onSaveTapBpm?: (recordId: string, trackId: string, bpm: number) => void;
  onSaveManualBpm?: (recordId: string, trackId: string, bpm: number) => void;
  onSaveCutRating?: (recordId: string, trackId: string, rating: CutRating | undefined) => void;
  onEnrichRelease?: () => void | Promise<void>;
  enrichingRelease?: boolean;
}

function NowPlayingArtwork({
  record,
  spinning,
  spinDurationSec,
  onOpenRelease,
}: {
  record: VinylRecord;
  spinning: boolean;
  spinDurationSec?: number;
  onOpenRelease?: () => void;
}) {
  const openRelease = onOpenRelease ?? (() => openRecordDetail(record));

  return (
    <div className="play-dj__disc-wrap">
    <button
      type="button"
      className={`play-dj__disc play-dj__disc-btn${spinning ? ' play-dj__disc--active' : ''}`}
      onClick={openRelease}
      aria-label={`Browse tracks on ${record.title}`}
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
    </div>
  );
}

export function PlayNextPanel({
  collection,
  nowPlaying,
  queue,
  onPlayNow,
  onSaveTapBpm,
  onSaveManualBpm,
  onSaveCutRating,
  onEnrichRelease,
  enrichingRelease = false,
}: PlayNextPanelProps) {
  const preview = useTrackPreview();
  const tapBpm = useTapBpm();
  const [releasePickerOpen, setReleasePickerOpen] = useState(false);
  const autoplayPendingRef = useRef<string | null>(null);

  const nowKey = nowPlaying
    ? playSelectionKey({ recordId: nowPlaying.record.id, trackId: nowPlaying.track.id })
    : null;

  useEffect(() => {
    setReleasePickerOpen(false);
  }, [nowPlaying?.record.id, nowPlaying?.track.id]);

  useEffect(() => {
    if (!nowPlaying) {
      preview.reset();
      return;
    }

    const autoplay = autoplayPendingRef.current === nowKey;
    if (autoplay) autoplayPendingRef.current = null;
    void preview.load(nowPlaying.record, nowPlaying.track, autoplay, false);
  }, [nowKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const exclude = useMemo((): PlaySelection[] => {
    const refs: PlaySelection[] = queue.map((q) => ({
      recordId: q.record.id,
      trackId: q.track.id,
    }));
    if (nowPlaying) {
      refs.push({ recordId: nowPlaying.record.id, trackId: nowPlaying.track.id });
    }
    return refs;
  }, [queue, nowPlaying]);

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
  const catalogIsEstimated = nowPlaying?.track.bpmEstimated !== false;
  const catalogIsTapped = nowPlaying?.track.bpmTapped === true;
  const catalogIsManual = nowPlaying?.track.bpmManual === true;
  const showSaveTap =
    tapBpm.bpm != null &&
    Boolean(onSaveTapBpm) &&
    !catalogIsManual &&
    (!catalogIsTapped || tapBpm.bpm !== catalogBpm);

  const handleSaveManualBpm = useCallback(
    (bpm: number) => {
      if (!nowPlaying || !onSaveManualBpm) return;
      onSaveManualBpm(nowPlaying.record.id, nowPlaying.track.id, bpm);
    },
    [nowPlaying, onSaveManualBpm]
  );

  const handleSaveCutRating = useCallback(
    (rating: CutRating | undefined) => {
      if (!nowPlaying || !onSaveCutRating) return;
      onSaveCutRating(nowPlaying.record.id, nowPlaying.track.id, rating);
    },
    [nowPlaying, onSaveCutRating]
  );

  const handleSaveTrackCutRating = useCallback(
    (trackId: string, rating: CutRating | undefined) => {
      if (!nowPlaying || !onSaveCutRating) return;
      onSaveCutRating(nowPlaying.record.id, trackId, rating);
    },
    [nowPlaying, onSaveCutRating]
  );

  const openReleasePicker = useCallback(() => {
    setReleasePickerOpen(true);
  }, []);

  const handleSelectReleaseTrack = useCallback(
    (track: Track) => {
      if (!nowPlaying) return;
      handlePlay(nowPlaying.record, track);
      setReleasePickerOpen(false);
    },
    [handlePlay, nowPlaying]
  );

  const releaseTrackCount = nowPlaying?.record.tracks.length ?? 0;
  const showReleasePicker = releaseTrackCount > 1;

  return (
    <div className="play-dj">
      <header className="play-dj__page-head">
        <h1 className="play-dj__page-title" style={{ fontFamily: 'var(--font-display)' }}>
          Play
        </h1>
        <p className="play-dj__page-sub">
          Compatible picks from your crate — tap BPM on the deck to sharpen matches.
        </p>
      </header>

      <div className="play-dj__deck-wrap">
        {nowPlaying ? (
          <div className="play-dj__now" role="status" aria-label="Now playing">
                <div className="play-dj__now-top">
                  <div className="play-dj__now-stage">
                    <NowPlayingArtwork
                      record={nowPlaying.record}
                      spinning={artworkSpinning}
                      onOpenRelease={
                        showReleasePicker
                          ? openReleasePicker
                          : () => openRecordDetail(nowPlaying.record)
                      }
                    />
                  </div>
                  <div className="play-dj__now-body">
                    <div className="play-dj__now-head">
                      <p className="play-dj__now-label">
                        <span className="play-dj__now-live" aria-hidden />
                        Now playing
                      </p>
                      {onEnrichRelease ? (
                        <button
                          type="button"
                          className="play-dj__enrich-icon"
                          onClick={() => void onEnrichRelease()}
                          disabled={enrichingRelease}
                          aria-label={
                            enrichingRelease
                              ? 'Enriching release'
                              : 'Enrich BPM and key for this release'
                          }
                          title="Enrich BPM & key"
                        >
                          {enrichingRelease ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
                          )}
                        </button>
                      ) : null}
                    </div>
                    <div className="play-dj__now-meta">
                      <p className="play-dj__now-title">{nowPlaying.track.title}</p>
                      {showReleasePicker ? (
                        <button
                          type="button"
                          className="play-dj__release-gate"
                          onClick={openReleasePicker}
                          aria-label={`Choose another track from ${nowPlaying.record.title}`}
                        >
                          <span className="play-dj__release-gate-icon" aria-hidden>
                            <Disc3 className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </span>
                          <span className="play-dj__release-gate-copy min-w-0">
                            <span className="play-dj__release-gate-label">
                              {releaseTrackCount} tracks on this release
                            </span>
                            <span className="play-dj__release-gate-meta">
                              {nowPlaying.record.artist}
                              <span className="text-[var(--text-muted)]"> — </span>
                              {nowPlaying.record.title}
                              {nowPlaying.record.year ? (
                                <span className="text-[var(--text-muted)]">
                                  {' '}
                                  · {nowPlaying.record.year}
                                </span>
                              ) : null}
                            </span>
                          </span>
                          <ChevronRight
                            className="play-dj__release-gate-chevron h-4 w-4 shrink-0"
                            strokeWidth={2}
                          />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="play-dj__release-gate play-dj__release-gate--solo"
                          onClick={() => openRecordDetail(nowPlaying.record)}
                          aria-label={`View ${nowPlaying.record.title}`}
                        >
                          <span className="play-dj__release-gate-copy min-w-0">
                            <span className="play-dj__release-gate-meta">
                              {nowPlaying.record.artist}
                              <span className="text-[var(--text-muted)]"> — </span>
                              {nowPlaying.record.title}
                            </span>
                          </span>
                          <ChevronRight
                            className="play-dj__release-gate-chevron h-4 w-4 shrink-0 opacity-60"
                            strokeWidth={2}
                          />
                        </button>
                      )}
                      <p className="play-dj__now-side tabular-nums">
                        <span className="text-[var(--text-muted)]">
                          {trackPositionLabel(nowPlaying.track, trackIndex)}
                        </span>
                      </p>
                    </div>
                    <PreviewControls
                      status={preview.status}
                      source={preview.source}
                      youtubeMuted={preview.youtubeMuted}
                      progress={preview.progress}
                      elapsed={preview.elapsed}
                      duration={preview.duration}
                      diagHint={preview.diagHint}
                      onToggle={handlePreviewToggle}
                      onSeek={preview.seekTo}
                      onSkip={preview.skipBy}
                    />
                    <PlaybackDebugBar
                      status={preview.status}
                      source={preview.source}
                      youtubeMode={preview.getYoutubeMode()}
                    />
                  </div>
                </div>

                <div className="play-dj__now-mix">
                  <MixStrip
                    track={nowPlaying.track}
                    variant="now"
                    onSaveManualBpm={onSaveManualBpm ? handleSaveManualBpm : undefined}
                    onSaveCutRating={onSaveCutRating ? handleSaveCutRating : undefined}
                  />
                  <div className="play-dj__tap-block" role="group" aria-label="Live BPM tap">
                    <div className="play-dj__tap-row">
                      <button
                        type="button"
                        className={`play-dj__tap-btn${tapBpm.isActive ? ' play-dj__tap-btn--active' : ''}`}
                        onClick={tapBpm.tap}
                        aria-label="Tap tempo on beat"
                      >
                        <span>Tap BPM</span>
                        <span className="play-dj__tap-count tabular-nums">
                          {tapBpm.tapCount > 0 ? tapBpm.tapCount : '·'}
                        </span>
                      </button>
                      <div className="play-dj__tap-readout">
                        {tapBpm.bpm != null ? (
                          <EditableBpm
                            value={tapBpm.bpm}
                            onAdjust={tapBpm.setBpm}
                            size="md"
                            suffix
                            className="play-dj__tap-result"
                            ariaLabel="Tapped BPM"
                          />
                        ) : (
                          <span className="play-dj__tap-hint">
                            {tapBpm.tapCount === 1 ? 'Once more on beat' : 'Tap on the beat'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div
                      className={`play-dj__tap-actions${tapBpm.bpm != null ? '' : ' play-dj__tap-actions--idle'}`}
                    >
                      {tapBpm.bpm != null ? (
                        <>
                          {showSaveTap ? (
                            <button
                              type="button"
                              className="play-dj__tap-save"
                              onClick={handleSaveTapBpm}
                            >
                              {catalogBpm == null || catalogIsEstimated || !catalogIsTapped
                                ? `Save ${tapBpm.bpmLabel ?? tapBpm.bpm}`
                                : `Replace ${catalogBpm}`}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="play-dj__tap-clear"
                            onClick={tapBpm.reset}
                            aria-label="Clear tapped BPM"
                          >
                            Clear
                          </button>
                        </>
                      ) : null}
                    </div>
                    <p className="play-dj__tap-note">
                      {tapBpm.bpm != null ? (
                        <>
                          Matching at {tapBpm.bpmLabel ?? tapBpm.bpm} BPM
                          <span className="text-[var(--text-muted)]"> ±3</span>
                          {showSaveTap ? (
                            <span className="text-[var(--text-muted)]">
                              {' '}
                              · save to lock as catalog BPM
                            </span>
                          ) : catalogIsManual ? (
                            <span className="text-[var(--text-muted)]"> · your BPM locked</span>
                          ) : catalogIsTapped ? (
                            <span className="text-[var(--text-muted)]"> · tapped BPM saved</span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-[var(--text-muted)]">
                          Live tempo refines mix partners · tap the BPM to fine-tune
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
        ) : (
          <div className="play-dj__now play-dj__now--hint">
            <p className="text-sm font-medium text-[var(--text)]">
              Pick a track to start mixing
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
              Tap play on a compatible pick below to start.
            </p>
          </div>
        )}
      </div>

      <div className="play-dj__workspace">
        <PlayBrowsePanel
          collection={collection}
          anchor={nowPlaying}
          exclude={exclude}
          matchOptions={matchOptions}
          onPlayNow={handlePlay}
        />
      </div>

      <ReleaseTrackPickerSheet
        open={releasePickerOpen && Boolean(nowPlaying)}
        record={nowPlaying?.record ?? null}
        activeTrackId={nowPlaying?.track.id ?? null}
        enrichingRelease={enrichingRelease}
        onClose={() => setReleasePickerOpen(false)}
        onSelectTrack={handleSelectReleaseTrack}
        onEnrichRelease={onEnrichRelease}
        onSaveCutRating={onSaveCutRating ? handleSaveTrackCutRating : undefined}
        onOpenReleaseDetail={
          nowPlaying
            ? () => {
                setReleasePickerOpen(false);
                openRecordDetail(nowPlaying.record);
              }
            : undefined
        }
      />
    </div>
  );
}