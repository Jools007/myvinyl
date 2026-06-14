import { useCallback, useRef, useState } from 'react';
import { Loader2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { useTrackPreview } from '../../hooks/useTrackPreview';

function formatPreviewTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

type PreviewControlsProps = {
  status: ReturnType<typeof useTrackPreview>['status'];
  source: ReturnType<typeof useTrackPreview>['source'];
  youtubeMuted: boolean;
  progress: number;
  elapsed: number;
  duration: number;
  diagHint?: string | null;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  onSkip: (deltaSeconds: number) => void;
};

export function PreviewControls({
  status,
  source,
  youtubeMuted,
  progress,
  elapsed,
  duration,
  diagHint,
  onToggle,
  onSeek,
  onSkip,
}: PreviewControlsProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragRatio, setDragRatio] = useState<number | null>(null);

  const busy = status === 'loading';
  const playing = status === 'playing';
  const unavailable = status === 'unavailable' || status === 'rate_limited';
  const canPlay = !busy && !unavailable;
  const canSeek =
    canPlay &&
    duration > 0 &&
    (status === 'ready' ||
      status === 'playing' ||
      status === 'paused' ||
      status === 'ended');

  const displayProgress = dragRatio ?? progress;

  const ratioFromClientX = useCallback((clientX: number): number => {
    const bar = barRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const seekFromRatio = useCallback(
    (ratio: number) => {
      if (!canSeek) return;
      onSeek(ratio * duration);
    },
    [canSeek, duration, onSeek]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canSeek) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    const ratio = ratioFromClientX(e.clientX);
    setDragRatio(ratio);
    seekFromRatio(ratio);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !canSeek) return;
    const ratio = ratioFromClientX(e.clientX);
    setDragRatio(ratio);
    seekFromRatio(ratio);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    setDragRatio(null);
  };

  let hint = 'Press play';
  if (status === 'loading') hint = 'Finding audio…';
  else if (status === 'rate_limited') hint = 'Spotify busy — retry shortly';
  else if (status === 'unavailable') hint = 'No audio found';
  else if (status === 'error') hint = 'Playback failed — press play to retry';
  else if (status === 'ready') hint = 'Tap play for audio';
  else if (canSeek) hint = 'Drag bar to seek';
  else if (source === 'spotify') hint = 'Spotify · 30s preview';
  else if (source === 'youtube' && youtubeMuted && playing) hint = 'Press play for sound';
  else if (source === 'youtube') hint = 'YouTube audio';
  if (import.meta.env.DEV && diagHint) hint = diagHint;

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

      <button
        type="button"
        className="play-dj__preview-skip"
        onClick={() => onSkip(-10)}
        disabled={!canSeek}
        aria-label="Skip back 10 seconds"
        title="−10s"
      >
        <SkipBack className="h-3.5 w-3.5" strokeWidth={2} />
      </button>

      <div className="play-dj__preview-track">
        <div
          ref={barRef}
          className={`play-dj__preview-bar${canSeek ? ' play-dj__preview-bar--seekable' : ''}${dragging ? ' play-dj__preview-bar--dragging' : ''}`}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(dragRatio != null ? dragRatio * duration : elapsed)}
          aria-label="Seek in track"
          aria-disabled={!canSeek}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="play-dj__preview-rail">
            <div
              className="play-dj__preview-fill"
              style={{ width: `${Math.round(displayProgress * 100)}%` }}
            />
            {canSeek ? (
              <div
                className="play-dj__preview-thumb"
                style={{ left: `${Math.round(displayProgress * 100)}%` }}
                aria-hidden
              />
            ) : null}
          </div>
        </div>
        <div className="play-dj__preview-meta">
          <span className="play-dj__preview-time tabular-nums">
            {formatPreviewTime(dragRatio != null ? dragRatio * duration : elapsed)} /{' '}
            {formatPreviewTime(duration)}
          </span>
          <span className="play-dj__preview-hint">{hint}</span>
        </div>
      </div>

      <button
        type="button"
        className="play-dj__preview-skip"
        onClick={() => onSkip(10)}
        disabled={!canSeek}
        aria-label="Skip forward 10 seconds"
        title="+10s"
      >
        <SkipForward className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}