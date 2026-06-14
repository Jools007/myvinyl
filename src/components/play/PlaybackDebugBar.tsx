import { useCallback, useState } from 'react';
import { getPlaybackDiagReport } from '../../lib/playbackDiagnostics';
import type { PreviewStatus } from '../../hooks/useTrackPreview';
import type { PlaybackSource } from '../../lib/api';

type PlaybackDebugBarProps = {
  status: PreviewStatus;
  source: PlaybackSource | null;
  youtubeMode: string | null;
  onTryAlternate?: () => void;
};

export function PlaybackDebugBar({
  status,
  source,
  youtubeMode,
  onTryAlternate,
}: PlaybackDebugBarProps) {
  const [copied, setCopied] = useState(false);

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
        On Play tab: hit ▶ on a row, then press the preview play button. YouTube starts muted — press
        play again for sound.
      </p>
    </div>
  );
}