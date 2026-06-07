import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Music2, RefreshCw, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { ENRICHMENT_ESTIMATE_HINT, enrichRecord } from '../lib/api';
import { CAMELOT_KEYS } from '../lib/camelot';
import { VIBE_TAG_SUGGESTIONS } from '../lib/vibes';
import { getPrimaryTrack, mergeEnrichmentOntoRelease, patchPrimaryTrack } from '../lib/tracks';
import type { RecordCondition, VinylRecord } from '../lib/types';
import { RecordArtwork } from './RecordArtwork';

interface RecordDetailModalProps {
  record: VinylRecord | null;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<VinylRecord>) => void;
  onDelete: (id: string) => void;
  onPlay: (id: string) => void;
}

const CONDITIONS: RecordCondition[] = ['Mint', 'NM', 'VG+', 'VG', 'G+', 'G', 'P'];

export function RecordDetailModal({
  record,
  onClose,
  onUpdate,
  onDelete,
  onPlay,
}: RecordDetailModalProps) {
  const [editing, setEditing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState('');

  if (!record) return null;

  const primary = getPrimaryTrack(record);

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

  const toggleVibe = (tag: string) => {
    const tags = primary?.vibeTags ?? [];
    const next = tags.includes(tag)
      ? tags.filter((t) => t !== tag)
      : [...tags, tag].slice(0, 6);
    onUpdate(record.id, { tracks: patchPrimaryTrack(record, { vibeTags: next }).tracks });
  };

  return (
    <AnimatePresence>
      {record && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-[70] max-h-[92vh] overflow-y-auto rounded-t-3xl border-t border-[var(--border)] bg-[var(--bg-elevated)] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <div className="p-6">
              <div className="mb-6 flex items-start justify-between">
                <div className="flex gap-4">
                  <RecordArtwork src={record.coverUrl} title={record.title} size="lg" className="!h-28 !w-28 shrink-0" />
                  <div>
                    <h2 className="text-xl font-semibold leading-tight">{record.title}</h2>
                    <p className="text-[var(--text-secondary)]">{record.artist}</p>
                    {record.year && (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">{record.year}</p>
                    )}
                  </div>
                </div>
                <button type="button" onClick={onClose} className="btn-ghost h-9 w-9 rounded-full p-0">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mb-6 flex gap-2">
                <button
                  type="button"
                  className="btn-primary flex-1"
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
                  className="btn-ghost"
                  onClick={refreshMetadata}
                  disabled={refreshing}
                  title="Refresh BPM, key & vibes from APIs"
                >
                  {refreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setEditing(!editing)}>
                  {editing ? 'Done' : 'Edit'}
                </button>
              </div>
              {refreshNote ? (
                <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">{refreshNote}</p>
              ) : null}

              {editing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--text-muted)]">BPM</label>
                      <input
                        type="number"
                        className="input-field mt-1"
                        value={primary?.bpm ?? ''}
                        onChange={(e) =>
                          onUpdate(record.id, {
                            tracks: patchPrimaryTrack(record, {
                              bpm: e.target.value ? parseInt(e.target.value, 10) : undefined,
                            }).tracks,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-muted)]">Camelot</label>
                      <select
                        className="input-field mt-1"
                        value={primary?.camelotKey ?? ''}
                        onChange={(e) =>
                          onUpdate(record.id, {
                            tracks: patchPrimaryTrack(record, {
                              camelotKey: e.target.value || undefined,
                            }).tracks,
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
                  <div>
                    <label className="text-xs text-[var(--text-muted)]">Condition</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {CONDITIONS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => onUpdate(record.id, { condition: c })}
                          className={`rounded-lg px-2.5 py-1 text-xs ${
                            record.condition === c
                              ? 'bg-[var(--accent)] text-white'
                              : 'bg-[var(--bg-subtle)]'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)]">Vibes</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {VIBE_TAG_SUGGESTIONS.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => toggleVibe(t)}
                          className={`tag-pill ${(primary?.vibeTags ?? []).includes(t) ? 'tag-pill--accent' : ''}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    className="input-field min-h-[72px]"
                    placeholder="Notes"
                    value={record.notes ?? ''}
                    onChange={(e) => onUpdate(record.id, { notes: e.target.value })}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {primary?.camelotKey && (
                      <span className="tag-pill tag-pill--violet">{primary.camelotKey}</span>
                    )}
                    {primary?.bpm != null && (
                      <span className="tag-pill">{primary.bpm} BPM</span>
                    )}
                    <span className="tag-pill">{record.condition}</span>
                  </div>
                  {record.genres.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs uppercase tracking-widest text-[var(--text-muted)]">
                        Genres
                      </p>
                      <p className="text-sm">{record.genres.join(' · ')}</p>
                    </div>
                  )}
                  {(primary?.vibeTags?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {(primary?.vibeTags ?? []).map((t) => (
                        <span key={t} className="tag-pill tag-pill--accent">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {record.notes && (
                    <p className="rounded-xl bg-[var(--bg-subtle)] p-4 text-sm leading-relaxed text-[var(--text-secondary)]">
                      {record.notes}
                    </p>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  onDelete(record.id);
                  onClose();
                }}
                className="mt-8 flex w-full items-center justify-center gap-2 py-2 text-sm text-red-500/80 transition-colors hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
                Remove from collection
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}