import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Printer, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { resolveTrackCamelot } from '../../lib/camelot';
import {
  clampLabelDescription,
  LABEL_DESCRIPTION_MAX,
  labelDescriptionFallback,
  resolveLabelDisplayPrefs,
} from '../../lib/labelContent';
import { getPrimaryTrack } from '../../lib/tracks';
import {
  DEFAULT_LABEL_DISPLAY,
  type LabelDisplayPrefs,
  type LabelTitleLayout,
  type VinylRecord,
} from '../../lib/types';
import { VIBE_TAG_SUGGESTIONS } from '../../lib/vibes';
import { CrateLabel } from './CrateLabel';

const MAX_LABEL_VIBES = 3;
const STICKER_IN = '2.125in';

const TITLE_LAYOUT_OPTIONS: { value: LabelTitleLayout; label: string }[] = [
  { value: 'artist-album', label: 'Artist · Album' },
  { value: 'album-artist', label: 'Album · Artist' },
  { value: 'album-only', label: 'Album only' },
];

/** Measure true 2.125″ size in px and pick a scale that fits the modal preview column. */
function useStickerPreviewLayout() {
  const [layout, setLayout] = useState({
    basePx: 204,
    scale: 3,
    displayPx: 612,
  });

  const measure = useCallback(() => {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:-9999px;top:0;width:2.125in;height:2.125in;visibility:hidden;pointer-events:none;';
    document.body.appendChild(probe);
    const basePx = probe.offsetWidth;
    const baseH = probe.offsetHeight;
    document.body.removeChild(probe);
    const base = Math.max(basePx, baseH, 1);

    const isNarrow = window.innerWidth < 720;
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;

    let target: number;
    if (isNarrow) {
      const root = getComputedStyle(document.documentElement);
      const safeTop =
        parseFloat(root.getPropertyValue('--safe-top')) * 16 || 0;
      const previewBudget = vh * 0.34 - safeTop - 20;
      const byWidth = vw - 20;
      const byHeight = Math.max(160, previewBudget);
      target = Math.min(byWidth, byHeight);
    } else {
      target = Math.min(420, Math.max(260, Math.min(vw * 0.52, 520) - 48));
    }
    const scale = target / base;

    setLayout({
      basePx: base,
      scale,
      displayPx: Math.round(base * scale),
    });
  }, []);

  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [measure]);

  return layout;
}

interface LabelInspectModalProps {
  record: VinylRecord | null;
  onClose: () => void;
  onSaveDescription: (recordId: string, notes: string) => void;
  onSaveVibes: (recordId: string, vibeTags: string[]) => void;
  onSaveLabelDisplay: (recordId: string, display: LabelDisplayPrefs) => void;
  onEnrich?: (recordId: string) => Promise<void>;
  enriching?: boolean;
  onPrint?: () => void;
  printCount?: number;
}

export function LabelInspectModal({
  record,
  onClose,
  onSaveDescription,
  onSaveVibes,
  onSaveLabelDisplay,
  onEnrich,
  enriching = false,
  onPrint,
  printCount = 0,
}: LabelInspectModalProps) {
  const [draft, setDraft] = useState('');
  const [vibeDraft, setVibeDraft] = useState<string[]>([]);
  const [displayDraft, setDisplayDraft] = useState<Required<LabelDisplayPrefs>>(
    DEFAULT_LABEL_DISPLAY
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vibeSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  const vibeDraftRef = useRef(vibeDraft);
  const displayDraftRef = useRef(displayDraft);
  const recordId = record?.id;
  const stickerLayout = useStickerPreviewLayout();

  draftRef.current = draft;
  vibeDraftRef.current = vibeDraft;
  displayDraftRef.current = displayDraft;

  useEffect(() => {
    if (!record) return;
    setDraft(record.notes?.trim() ?? '');
    const primary = getPrimaryTrack(record);
    setVibeDraft([...(primary?.vibeTags ?? [])].slice(0, MAX_LABEL_VIBES));
    setDisplayDraft(resolveLabelDisplayPrefs(record));
  }, [recordId, record]);

  const persistDescription = useCallback(
    (text: string) => {
      if (!recordId) return;
      onSaveDescription(recordId, text.trim());
    },
    [onSaveDescription, recordId]
  );

  const persistVibes = useCallback(
    (tags: string[]) => {
      if (!recordId) return;
      onSaveVibes(recordId, tags);
    },
    [onSaveVibes, recordId]
  );

  const scheduleDescriptionSave = useCallback(
    (text: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persistDescription(text), 450);
    },
    [persistDescription]
  );

  const scheduleVibeSave = useCallback(
    (tags: string[]) => {
      if (vibeSaveTimer.current) clearTimeout(vibeSaveTimer.current);
      vibeSaveTimer.current = setTimeout(() => persistVibes(tags), 450);
    },
    [persistVibes]
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (vibeSaveTimer.current) clearTimeout(vibeSaveTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!record) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [record, onClose]);

  useEffect(() => {
    if (!record) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [record]);

  const handleDraftChange = useCallback(
    (value: string) => {
      const next = clampLabelDescription(value);
      setDraft(next);
      scheduleDescriptionSave(next);
    },
    [scheduleDescriptionSave]
  );

  const handleDescriptionBlur = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    persistDescription(draftRef.current);
  }, [persistDescription]);

  const toggleVibe = useCallback(
    (tag: string) => {
      const trimmed = tag.trim();
      if (!trimmed) return;

      const prev = vibeDraftRef.current;
      let next: string[];
      if (prev.includes(trimmed)) {
        next = prev.filter((t) => t !== trimmed);
      } else if (prev.length >= MAX_LABEL_VIBES) {
        return;
      } else {
        next = [...prev, trimmed];
      }

      setVibeDraft(next);
      scheduleVibeSave(next);
    },
    [scheduleVibeSave]
  );

  const handleVibesBlur = useCallback(() => {
    if (vibeSaveTimer.current) {
      clearTimeout(vibeSaveTimer.current);
      vibeSaveTimer.current = null;
    }
    persistVibes(vibeDraftRef.current);
  }, [persistVibes]);

  const persistDisplay = useCallback(
    (display: Required<LabelDisplayPrefs>) => {
      if (!recordId) return;
      onSaveLabelDisplay(recordId, display);
    },
    [onSaveLabelDisplay, recordId]
  );

  const setTitleLayout = useCallback(
    (titleLayout: LabelTitleLayout) => {
      const prev = displayDraftRef.current;
      if (prev.titleLayout === titleLayout) return;
      const next = { ...prev, titleLayout };
      setDisplayDraft(next);
      persistDisplay(next);
    },
    [persistDisplay]
  );

  const toggleDisplayFlag = useCallback(
    (key: 'showBpm' | 'showKey' | 'showVibes') => {
      const prev = displayDraftRef.current;
      const next = { ...prev, [key]: !prev[key] };
      setDisplayDraft(next);
      persistDisplay(next);
    },
    [persistDisplay]
  );

  const handleEnrich = useCallback(async () => {
    if (!recordId || !onEnrich || enriching) return;
    await onEnrich(recordId);
  }, [enriching, onEnrich, recordId]);

  if (!record) return null;

  const primaryTrack = getPrimaryTrack(record);
  const { code: camelotCode } = resolveTrackCamelot(primaryTrack);
  const hasBpm = primaryTrack?.bpm != null;
  const hasKey = Boolean(camelotCode);
  const needsEnrich = !hasBpm || !hasKey;
  const bpmLabel = hasBpm
    ? `${primaryTrack?.bpmEstimated ? '~' : ''}${primaryTrack?.bpm}`
    : '—';
  const keyLabel = camelotCode ?? '—';

  const fallback = labelDescriptionFallback(record);
  const placeholder = fallback
    ? `Leave empty to use: ${fallback}`
    : 'Short crate note — opener, vocal 12", crowd pleaser…';

  const { basePx, scale, displayPx } = stickerLayout;

  return createPortal(
    <AnimatePresence>
      <div className="label-modal-portal">
        <motion.button
          type="button"
          className="label-modal__backdrop"
          aria-label="Close"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />
        <motion.div
          key={record.id}
          role="dialog"
          aria-modal="true"
          aria-labelledby="label-modal-heading"
          className="label-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            type="button"
            className="label-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>

          <div className="label-modal__columns">
            <section className="label-modal__preview" aria-label="Label preview">
              <div
                className="label-modal__sticker-slot"
                style={{ width: displayPx, height: displayPx }}
              >
                <div
                  className="label-modal__sticker-inner"
                  style={{
                    width: basePx,
                    height: basePx,
                    transform: `scale(${scale})`,
                  }}
                >
                  <CrateLabel
                    record={record}
                    size="preview"
                    className="crate-label--inspect"
                    descriptionOverride={draft}
                    vibesOverride={vibeDraft}
                    displayOverride={displayDraft}
                  />
                </div>
              </div>
              <p className="label-modal__preview-note">
                {STICKER_IN} · live preview
              </p>
            </section>

            <aside className="label-modal__edit" aria-label="Edit sticker">
              <header className="label-modal__edit-head">
                <h2 id="label-modal-heading" className="label-modal__edit-title">
                  Edit sticker
                </h2>
                <p className="label-modal__edit-sub">
                  {record.artist} · {record.title}
                </p>
              </header>

              <section className="label-modal__mix-panel" aria-label="Mix data">
                <div className="label-modal__mix-stats">
                  <div className="label-modal__mix-stat">
                    <span className="label-modal__mix-label">BPM</span>
                    <span
                      className={`label-modal__mix-value tabular-nums${
                        !hasBpm ? ' label-modal__mix-value--missing' : ''
                      }`}
                    >
                      {bpmLabel}
                    </span>
                  </div>
                  <div className="label-modal__mix-stat">
                    <span className="label-modal__mix-label">Key</span>
                    <span
                      className={`label-modal__mix-value label-modal__mix-value--key tabular-nums${
                        !hasKey ? ' label-modal__mix-value--missing' : ''
                      }`}
                    >
                      {keyLabel}
                    </span>
                  </div>
                </div>
                {needsEnrich || enriching ? (
                  <button
                    type="button"
                    className="label-modal__enrich-btn"
                    onClick={() => void handleEnrich()}
                    disabled={enriching || !onEnrich}
                  >
                    {enriching ? (
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                    ) : (
                      <Sparkles className="h-4 w-4" strokeWidth={2} />
                    )}
                    {enriching ? 'Enriching…' : 'Enrich data'}
                  </button>
                ) : null}
              </section>

              <fieldset className="label-modal__field label-modal__field--layout">
                <legend className="label-modal__field-name">Title format</legend>
                <div className="label-modal__segmented" role="group" aria-label="Title format">
                  {TITLE_LAYOUT_OPTIONS.map((opt) => {
                    const active = displayDraft.titleLayout === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className={`label-modal__segment${active ? ' label-modal__segment--on' : ''}`}
                        aria-pressed={active}
                        onClick={() => setTitleLayout(opt.value)}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="label-modal__field label-modal__field--toggles">
                <legend className="label-modal__field-name">Show on sticker</legend>
                <div className="label-modal__toggles">
                  {(
                    [
                      { key: 'showBpm' as const, label: 'BPM' },
                      { key: 'showKey' as const, label: 'Key' },
                      { key: 'showVibes' as const, label: 'Vibes' },
                    ] as const
                  ).map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      className={`label-modal__toggle${displayDraft[key] ? ' label-modal__toggle--on' : ''}`}
                      aria-pressed={displayDraft[key]}
                      onClick={() => toggleDisplayFlag(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="label-modal__field">
                <label htmlFor="label-desc-input" className="label-modal__field-name">
                  Custom notes
                </label>
                <textarea
                  id="label-desc-input"
                  className="label-modal__textarea"
                  value={draft}
                  onChange={(e) => handleDraftChange(e.target.value)}
                  onBlur={handleDescriptionBlur}
                  placeholder={placeholder}
                  rows={2}
                  maxLength={LABEL_DESCRIPTION_MAX}
                />
                <div className="label-modal__field-foot">
                  <span className="label-modal__hint">
                    {draft.trim()
                      ? 'Updates on the label as you type'
                      : fallback
                        ? `Empty shows: ${fallback}`
                        : 'Two lines max on print'}
                  </span>
                  <span
                    className={`label-modal__count tabular-nums${
                      draft.length >= LABEL_DESCRIPTION_MAX - 10
                        ? ' label-modal__count--warn'
                        : ''
                    }`}
                  >
                    {draft.length}/{LABEL_DESCRIPTION_MAX}
                  </span>
                </div>
              </div>

              <fieldset className="label-modal__field label-modal__field--vibes">
                <legend className="label-modal__field-name">
                  Vibes
                  <span className="label-modal__field-note">
                    Select up to {MAX_LABEL_VIBES}
                  </span>
                </legend>
                <div className="label-modal__chips" onBlur={handleVibesBlur}>
                  {VIBE_TAG_SUGGESTIONS.map((t) => {
                    const active = vibeDraft.includes(t);
                    const disabled = !active && vibeDraft.length >= MAX_LABEL_VIBES;
                    return (
                      <button
                        key={t}
                        type="button"
                        className={`label-modal__chip${active ? ' label-modal__chip--on' : ''}`}
                        disabled={disabled}
                        aria-pressed={active}
                        onClick={() => toggleVibe(t)}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="label-modal__actions">
                <button type="button" className="btn-ghost" onClick={onClose}>
                  Close
                </button>
                {onPrint ? (
                  <button type="button" className="btn-primary" onClick={onPrint}>
                    <Printer className="h-4 w-4" />
                    Print {printCount > 0 ? printCount : ''} label
                    {printCount === 1 ? '' : 's'}
                  </button>
                ) : null}
              </div>
            </aside>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}