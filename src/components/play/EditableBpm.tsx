import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { formatBpmInputValue, parseBpmInput } from '../../lib/bpmInput';
import { formatBpmValue } from '../../lib/formatMix';
import { shouldShowBpmEstimatePrefix } from '../../lib/tracks';
import type { Track } from '../../lib/types';

type EditableBpmProps = {
  value: number | null | undefined;
  track?: Pick<Track, 'bpmEstimated' | 'bpmManual' | 'bpmTapped'>;
  placeholder?: string;
  /** Live adjustment (tap readout) — does not persist. */
  onAdjust?: (bpm: number) => void;
  /** Persist to catalog (manual entry). */
  onCommit?: (bpm: number) => void;
  className?: string;
  size?: 'sm' | 'md';
  suffix?: boolean;
  ariaLabel?: string;
};

export function EditableBpm({
  value,
  track,
  placeholder = '—',
  onAdjust,
  onCommit,
  className = '',
  size = 'md',
  suffix = false,
  ariaLabel = 'BPM',
}: EditableBpmProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);

  const canEdit = Boolean(onAdjust || onCommit);
  const showEstimate = track ? shouldShowBpmEstimatePrefix(track) : false;

  const openEditor = useCallback(() => {
    if (!canEdit) return;
    setDraft(value != null ? formatBpmInputValue(value) : '');
    setInvalid(false);
    setEditing(true);
  }, [canEdit, value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const cancel = useCallback(() => {
    setEditing(false);
    setInvalid(false);
  }, []);

  const commitDraft = useCallback(() => {
    const parsed = parseBpmInput(draft);
    if (parsed == null) {
      if (draft.trim() === '') {
        cancel();
        return;
      }
      setInvalid(true);
      return;
    }

    setEditing(false);
    setInvalid(false);

    if (onCommit) {
      onCommit(parsed);
      return;
    }
    onAdjust?.(parsed);
  }, [cancel, draft, onAdjust, onCommit]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitDraft();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  };

  if (editing) {
    return (
      <span className={`editable-bpm editable-bpm--editing editable-bpm--${size}${className ? ` ${className}` : ''}`}>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          spellCheck={false}
          className={`editable-bpm__input${invalid ? ' editable-bpm__input--invalid' : ''}`}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onBlur={commitDraft}
          onKeyDown={handleKeyDown}
          aria-label={`${ariaLabel} — one decimal place`}
          aria-invalid={invalid}
        />
        {suffix ? <span className="editable-bpm__suffix">BPM</span> : null}
      </span>
    );
  }

  if (value == null) {
    if (!canEdit) {
      return (
        <span className={`editable-bpm editable-bpm--empty editable-bpm--${size}${className ? ` ${className}` : ''}`}>
          {placeholder}
        </span>
      );
    }
    return (
      <button
        type="button"
        className={`editable-bpm editable-bpm--ghost editable-bpm--${size}${className ? ` ${className}` : ''}`}
        onClick={openEditor}
        aria-label={`Set ${ariaLabel}`}
      >
        <span className="editable-bpm__ghost-label">Set BPM</span>
      </button>
    );
  }

  const label = formatBpmValue(value);

  return (
    <button
      type="button"
      className={`editable-bpm editable-bpm--display editable-bpm--${size}${canEdit ? ' editable-bpm--editable' : ''}${className ? ` ${className}` : ''}`}
      onClick={openEditor}
      disabled={!canEdit}
      aria-label={canEdit ? `Edit ${ariaLabel}, currently ${label}` : `${ariaLabel} ${label}`}
    >
      {showEstimate ? <span className="editable-bpm__estimate">~</span> : null}
      <span className="editable-bpm__value tabular-nums">{label}</span>
      {suffix ? <span className="editable-bpm__suffix">BPM</span> : null}
    </button>
  );
}