export type PlayViewMode = 'queue' | 'mix';

export type PlayModeToggleProps = {
  mode: PlayViewMode;
  onChange: (mode: PlayViewMode) => void;
};

export function PlayModeToggle({ mode, onChange }: PlayModeToggleProps) {
  return (
    <div
      className="play-dj__mode-toggle"
      role="tablist"
      aria-label="Play view"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'queue'}
        className={`play-dj__mode-btn${mode === 'queue' ? ' play-dj__mode-btn--active' : ''}`}
        onClick={() => onChange('queue')}
      >
        Queue
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'mix'}
        className={`play-dj__mode-btn${mode === 'mix' ? ' play-dj__mode-btn--active' : ''}`}
        onClick={() => onChange('mix')}
      >
        Mix
      </button>
    </div>
  );
}