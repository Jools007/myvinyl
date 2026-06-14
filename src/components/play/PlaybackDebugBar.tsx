import { useCallback, useMemo, useState } from 'react';
import { getPlaybackDiagReport } from '../../lib/playbackDiagnostics';
import type { PreviewStatus } from '../../hooks/useTrackPreview';
import type { PlaybackSource } from '../../lib/api';

type PlaybackDebugBarProps = {
  status: PreviewStatus;
  source: PlaybackSource | null;
  youtubeMode: string | null;
  attachedVideoId?: string | null;
  lastApiVideoId?: string | null;
  lastApiTitle?: string | null;
  playerState?: number | null;
  activelyPlaying?: boolean;
  diagHint?: string | null;
  onTryAlternate?: () => void;
};

export function PlaybackDebugBar({
  status,
  source,
  youtubeMode,
  attachedVideoId,
  lastApiVideoId,
  lastApiTitle,
  playerState,
  activelyPlaying,
  diagHint,
  onTryAlternate,
}: PlaybackDebugBarProps) {
  const [copied, setCopied] = useState(false);

  const videoMismatch = useMemo(
    () =>
      Boolean(
        attachedVideoId &&
          lastApiVideoId &&
          attachedVideoId !== lastApiVideoId
      ),
    [attachedVideoId, lastApiVideoId]
  );

  const copyDebug = useCallback(async () => {
    const report = getPlaybackDiagReport();
    const text = JSON.stringify(report, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt('Copy this playback debug info:', text);
    }
  }, []);

  if (!import.meta.env.DEV) return null;

  return (
    <div className="play-dj__playback-debug" role="status" aria-live="polite">
      <p className="play-dj__playback-debug-line">
        <span className="play-dj__playback-debug-label">Dev playback</span>
        <span>
          {status}
          {source ? ` · ${source}` : ''}
          {youtubeMode ? ` · ${youtubeMode}` : ''}
        </span>
      </p>
      {source === 'youtube' ? (
        <p className="play-dj__playback-debug-line play-dj__playback-debug-detail">
          <span>attached </span>
          <code>{attachedVideoId ?? '—'}</code>
          <span> · api </span>
          <code>{lastApiVideoId ?? '—'}</code>
          {lastApiTitle ? <span> ({lastApiTitle})</span> : null}
          {videoMismatch ? (
            <span className="play-dj__playback-debug-warn"> · mismatch</span>
          ) : null}
          <span>
            {' '}
            · state {playerState ?? '—'}
            {activelyPlaying ? ' · PLAYING' : ''}
          </span>
        </p>
      ) : null}
      {diagHint ? (
        <p className="play-dj__playback-debug-line play-dj__playback-debug-detail">{diagHint}</p>
      ) : null}
      <div className="play-dj__playback-debug-actions">
        <button type="button" className="play-dj__playback-debug-btn" onClick={() => void copyDebug()}>
          {copied ? 'Copied!' : 'Copy debug info'}
        </button>
        {source === 'youtube' && onTryAlternate ? (
          <button type="button" className="play-dj__playback-debug-btn" onClick={onTryAlternate}>
            Try alternate video
          </button>
        ) : null}
      </div>
      <p className="play-dj__playback-debug-help">
        Debug report includes <code>snapshot</code>, <code>summary.hints</code>, and full event log.
        Local dev: use <code>localhost:5174</code> (not 127.0.0.1). One ▶ click for sound.
      </p>
    </div>
  );
}