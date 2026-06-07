import { AnimatePresence, motion } from 'framer-motion';
import { Printer, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  clampLabelDescription,
  LABEL_DESCRIPTION_MAX,
  labelDescriptionFallback,
} from '../../lib/labelContent';
import { getPrimaryTrack } from '../../lib/tracks';
import type { VinylRecord } from '../../lib/types';
import { VIBE_TAG_SUGGESTIONS } from '../../lib/vibes';
import { CrateLabel } from './CrateLabel';

const MAX_LABEL_VIBES = 3;
const STICKER_IN = '2.125in';

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

    const colBudget = Math.min(window.innerWidth * 0.52, 520);
    const target = Math.min(400, Math.max(260, colBudget - 48));
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
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return layout;
}

interface LabelInspectModalProps {
  record: VinylRecord | null;
  onClose: () => void;
  onSaveDescription: (recordId: string, notes: string) => void;
  onSaveVibes: (recordId: string, vibeTags: string[]) => void;
  onPrint?: () => void;
}

export function LabelInspectModal({
  record,
  onClose,
  onSaveDescription,
  onSaveVibes,
  onPrint,
}: LabelInspectModalProps) {
  const [draft, setDraft] = useState('');
  const [vibeDraft, setVibeDraft] = useState<string[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vibeSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordId = record?.id;
  const stickerLayout = useStickerPreviewLayout();

  useEffect(() => {
    if (!record) return;
    setDraft(record.notes?.trim() ?? '');
    const primary = getPrimaryTrack(record);
    setVibeDraft([...(primary?.vibeTags ?? [])].slice(0, MAX_LABEL_VIBES));
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

  const handleDraftChange = (value: string) => {
    const next = clampLabelDescription(value);
    setDraft(next);
    scheduleDescriptionSave(next);
  };

  const handleDescriptionBlur = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    persistDescription(draft);
  };

  const toggleVibe = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    setVibeDraft((prev) => {
      let next: string[];
      if (prev.includes(trimmed)) {
        next = prev.filter((t) => t !== trimmed);
      } else if (prev.length >= MAX_LABEL_VIBES) {
        next = prev;
      } else {
        next = [...prev, trimmed];
      }
      scheduleVibeSave(next);
      return next;
    });
  };

  const handleVibesBlur = () => {
    if (vibeSaveTimer.current) {
      clearTimeout(vibeSaveTimer.current);
      vibeSaveTimer.current = null;
    }
    persistVibes(vibeDraft);
  };

  if (!record) return null;

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
                  />
                </div>
              </div>
              <p className="label-modal__preview-note">
                Live preview · {STICKER_IN} square
              </p>
            </section>

            <aside className="label-modal__edit" aria-label="Edit sticker">
              <h2 id="label-modal-heading" className="label-modal__edit-title">
                Edit Sticker
              </h2>
              <p className="label-modal__edit-sub">
                {record.artist} · {record.title}
              </p>

              <div className="label-modal__field">
                <label htmlFor="label-desc-input" className="label-modal__field-name">
                  Description
                </label>
                <textarea
                  id="label-desc-input"
                  className="label-modal__textarea"
                  value={draft}
                  onChange={(e) => handleDraftChange(e.target.value)}
                  onBlur={handleDescriptionBlur}
                  placeholder={placeholder}
                  rows={4}
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
                    Print
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