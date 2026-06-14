import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Music2, RefreshCw, Trash2, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { ENRICHMENT_ESTIMATE_HINT, enrichRecord } from '../lib/api';
import { CAMELOT_KEYS } from '../lib/camelot';
import { normalizeVinylFormatForChip, VINYL_FORMATS } from '../lib/formats';
import { canonicalVibeTag, MAX_VIBE_TAGS, VIBE_TAG_SUGGESTIONS } from '../lib/vibes';
import { getPrimaryTrack, mergeEnrichmentOntoRelease, patchPrimaryTrack } from '../lib/tracks';
import type { RecordCondition, VinylRecord } from '../lib/types';
import { AboutReleaseSection } from './AboutReleaseSection';
import { RecordArtwork } from './RecordArtwork';

interface RecordDetailModalProps {
  record: VinylRecord | null;
  initialEditing?: boolean;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<VinylRecord>) => void;
  onDelete: (id: string) => void;
  onPlay: (id: string) => void;
}

const CONDITIONS: RecordCondition[] = ['Mint', 'NM', 'VG+', 'VG', 'G+', 'G', 'P'];

type EditDraft = {
  bpm?: number;
  camelotKey?: string;
  condition: RecordCondition;
  format?: string;
  vibeTags: string[];
  notes?: string;
};

function FormChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`add-modal__chip ${active ? 'add-modal__chip--active' : ''}`}
    >
      {children}
    </button>
  );
}

function buildEditDraft(record: VinylRecord): EditDraft {
  const primary = getPrimaryTrack(record);
  const format = normalizeVinylFormatForChip(record.format);
  return {
    bpm: primary?.bpm,
    camelotKey: primary?.camelotKey,
    condition: record.condition,
    format: format || undefined,
    vibeTags: primary?.vibeTags ?? [],
    notes: record.notes,
  };
}

export function RecordDetailModal({
  record,
  initialEditing: _initialEditing = false,
  onClose,
  onUpdate,
  onDelete,
  onPlay,
}: RecordDetailModalProps) {
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState('');

  useEffect(() => {
    setRefreshNote('');
    if (!record) {
      setEditDraft(null);
      return;
    }
    setEditDraft(buildEditDraft(record));
  }, [record]);

  if (!record || !editDraft) return null;

  const saveEditing = () => {
    onUpdate(record.id, {
      condition: editDraft.condition,
      format: editDraft.format,
      notes: editDraft.notes,
      tracks: patchPrimaryTrack(record, {
        bpm: editDraft.bpm,
        camelotKey: editDraft.camelotKey,
        vibeTags: editDraft.vibeTags,
        ...(editDraft.bpm != null
          ? { bpmEstimated: false, bpmManual: true, bpmTapped: false }
          : {}),
      }).tracks,
    });
    onClose();
  };

  const toggleDraftVibe = (tag: string) => {
    const canonical = canonicalVibeTag(tag);
    if (!canonical) return;
    const tags = editDraft.vibeTags;
    const next = tags.includes(canonical)
      ? tags.filter((t) => t !== canonical)
      : [...tags, canonical].slice(0, MAX_VIBE_TAGS);
    setEditDraft({ ...editDraft, vibeTags: next });
  };

  const refreshMetadata = async () => {
    setRefreshing(true);
    setRefreshNote('');
    try {
      const data = await enrichRecord(
        record.artist,
        record.title,
        record.discogsId,
        record.title,
        record.genres
      );
      onUpdate(record.id, mergeEnrichmentOntoRelease(record, data));
      if (data.source === 'client' && (data.bpmEstimated || data.keyEstimated)) {
        setRefreshNote(ENRICHMENT_ESTIMATE_HINT);
      }
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <AnimatePresence>
      {record && (
        <>
          <motion.div
            className="record-detail-modal__backdrop fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-detail-modal-title"
            className="record-detail-modal fixed inset-x-0 bottom-0 z-[210] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <header className="record-detail-modal__header">
              <div className="record-detail-modal__hero">
                <div className="record-detail-modal__art relative shrink-0 overflow-hidden rounded-xl">
                  <RecordArtwork
                    src={record.coverUrl}
                    title={record.title}
                    fill
                    className="rounded-xl"
                  />
                </div>
                <div className="record-detail-modal__meta min-w-0">
                  <h2
                    id="record-detail-modal-title"
                    className="record-detail-modal__title"
                  >
                    {record.title}
                  </h2>
                  <p className="record-detail-modal__artist">{record.artist}</p>
                  {record.year ? (
                    <p className="record-detail-modal__year">{record.year}</p>
                  ) : null}
                </div>
              </div>

              <div className="record-detail-modal__toolbar">
                <button
                  type="button"
                  className="btn-primary record-detail-modal__play-btn"
                  onClick={() => {
                    onPlay(record.id);
                    onClose();
                  }}
                >
                  <Music2 className="h-4 w-4" />
                  Mark as played
                </button>
                <button
                  type="button"
                  className="btn-ghost record-detail-modal__icon-btn"
                  onClick={refreshMetadata}
                  disabled={refreshing}
                  title="Refresh BPM, key & vibes from APIs"
                  aria-label="Refresh metadata"
                >
                  {refreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-ghost record-detail-modal__icon-btn"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div className="record-detail-modal__body">
              {refreshNote ? (
                <p className="record-detail-modal__hint">{refreshNote}</p>
              ) : null}

              <div className="record-detail-modal__content">
                {record.genres.length > 0 ? (
                  <div className="record-detail-modal__genres">
                    {record.genres.map((genre) => (
                      <span key={genre} className="tag-pill">
                        {genre}
                      </span>
                    ))}
                  </div>
                ) : null}

                <AboutReleaseSection source={record} />

                <div className="record-detail-modal__crate">
                  <h3 className="record-detail-modal__section-title">Crate details</h3>

                  <div className="record-detail-modal__form">
                    <div className="record-detail-modal__field">
                      <label className="record-detail-modal__label">Format</label>
                      <div className="add-modal__chips">
                        {VINYL_FORMATS.map((f) => (
                          <FormChip
                            key={f}
                            active={editDraft.format === f}
                            onClick={() => setEditDraft({ ...editDraft, format: f })}
                          >
                            {f}
                          </FormChip>
                        ))}
                      </div>
                    </div>

                    <div className="record-detail-modal__mix-row">
                      <div className="record-detail-modal__field record-detail-modal__field--bpm">
                        <label className="record-detail-modal__label">BPM</label>
                        <input
                          type="number"
                          className="input-field add-modal__input-compact text-center tabular-nums"
                          value={editDraft.bpm ?? ''}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              bpm: e.target.value ? parseInt(e.target.value, 10) : undefined,
                            })
                          }
                        />
                      </div>
                      <div className="record-detail-modal__field record-detail-modal__field--key">
                        <label className="record-detail-modal__label">Key</label>
                        <select
                          className="input-field add-modal__input-compact"
                          value={editDraft.camelotKey ?? ''}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              camelotKey: e.target.value || undefined,
                            })
                          }
                        >
                          <option value="">—</option>
                          {CAMELOT_KEYS.map((k) => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="record-detail-modal__field">
                      <label className="record-detail-modal__label">Condition</label>
                      <div className="add-modal__chips">
                        {CONDITIONS.map((c) => (
                          <FormChip
                            key={c}
                            active={editDraft.condition === c}
                            onClick={() => setEditDraft({ ...editDraft, condition: c })}
                          >
                            {c}
                          </FormChip>
                        ))}
                      </div>
                    </div>

                    <div className="record-detail-modal__field">
                      <label className="record-detail-modal__label">Vibes</label>
                      <div className="add-modal__chips add-modal__chips--vibes">
                        {VIBE_TAG_SUGGESTIONS.map((t) => (
                          <FormChip
                            key={t}
                            active={editDraft.vibeTags.includes(t)}
                            onClick={() => toggleDraftVibe(t)}
                          >
                            {t}
                          </FormChip>
                        ))}
                      </div>
                    </div>

                    <div className="record-detail-modal__field">
                      <label className="record-detail-modal__label">Your notes</label>
                      <textarea
                        className="input-field record-detail-modal__notes-input resize-none"
                        placeholder="Crate slot, pressing notes…"
                        value={editDraft.notes ?? ''}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, notes: e.target.value })
                        }
                        rows={3}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onDelete(record.id);
                        onClose();
                      }}
                      className="record-detail-modal__delete"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove from collection
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <footer className="record-detail-modal__footer">
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost record-detail-modal__cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEditing}
                className="btn-primary record-detail-modal__save"
              >
                Save changes
              </button>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}