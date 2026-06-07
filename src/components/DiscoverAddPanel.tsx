import { AnimatePresence, motion } from 'framer-motion';
import { Disc3, Loader2, Pencil, Plus, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  enrichRecord,
  fetchAlbumDescription,
  fetchDiscogsRelease,
  proxyCoverUrl,
  resolveDiscogsReleaseDetail,
} from '../lib/api';
import { CAMELOT_KEYS } from '../lib/camelot';
import { VIBE_TAG_SUGGESTIONS } from '../lib/vibes';
import {
  isCdFormat,
  pickVinylFormatFromDiscogs,
  sanitizeVinylFormat,
  VINYL_FORMATS,
} from '../lib/formats';
import { getPrimaryTrack, patchPrimaryTrack, releaseFromDiscogsImport } from '../lib/tracks';
import type { DiscogsReleaseDetail } from '../lib/api';
import type { DiscogsSearchHit, RecordCondition, VinylRecord } from '../lib/types';

const CONDITIONS: RecordCondition[] = ['Mint', 'NM', 'VG+', 'VG', 'G+', 'G', 'P'];

interface DiscoverAddPanelProps {
  hit: DiscogsSearchHit | null;
  /** Full Discogs release from barcode scan (tracklist pre-loaded) */
  prefetchedRelease?: DiscogsReleaseDetail | null;
  /** When set, modal opens in edit mode with this record pre-filled */
  editingRecord?: VinylRecord | null;
  open: boolean;
  onClose: () => void;
  onSave?: (record: Omit<VinylRecord, 'id' | 'addedAt'>) => void;
  onUpdate?: (id: string, patch: Partial<VinylRecord>) => void;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <legend className="add-modal__section-label">{children}</legend>
  );
}

function Chip({
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

export function DiscoverAddPanel({
  hit,
  prefetchedRelease = null,
  editingRecord = null,
  open,
  onClose,
  onSave,
  onUpdate,
}: DiscoverAddPanelProps) {
  const isEditMode = Boolean(editingRecord);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState('');
  const [artist, setArtist] = useState('');
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | undefined>();
  const [genres, setGenres] = useState<string[]>([]);
  const [format, setFormat] = useState('');
  const [bpm, setBpm] = useState('');
  const [camelotKey, setCamelotKey] = useState('');
  const [condition, setCondition] = useState<RecordCondition>('NM');
  const [albumBlurb, setAlbumBlurb] = useState('');
  const [personalNotes, setPersonalNotes] = useState('');
  const [vibeTags, setVibeTags] = useState<string[]>([]);
  const [customVibe, setCustomVibe] = useState('');
  const [discogsDetail, setDiscogsDetail] = useState<DiscogsReleaseDetail | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    setEnriching(false);
    setError('');
    setArtist('');
    setTitle('');
    setYear('');
    setCoverUrl(undefined);
    setGenres([]);
    setFormat('');
    setBpm('');
    setCamelotKey('');
    setCondition('NM');
    setAlbumBlurb('');
    setPersonalNotes('');
    setVibeTags([]);
    setCustomVibe('');
    setDiscogsDetail(null);
    setSaving(false);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }

    if (editingRecord) {
      const primary = getPrimaryTrack(editingRecord);
      setEnriching(false);
      setError('');
      setArtist(editingRecord.artist);
      setTitle(editingRecord.title);
      setYear(editingRecord.year ?? '');
      setCoverUrl(editingRecord.coverUrl);
      setGenres([...editingRecord.genres]);
      setFormat(editingRecord.format ?? '');
      setBpm(primary?.bpm != null ? String(primary.bpm) : '');
      setCamelotKey(primary?.camelotKey ?? '');
      setCondition(editingRecord.condition);
      setPersonalNotes(editingRecord.notes ?? '');
      setVibeTags([...(primary?.vibeTags ?? [])]);
      setCustomVibe('');
      setDiscogsDetail(null);
      setSaving(false);

      let cancelled = false;
      const discogsId = editingRecord.discogsId;

      if (!discogsId) {
        setAlbumBlurb('');
        return () => {
          cancelled = true;
        };
      }

      (async () => {
        setEnriching(true);
        try {
          const release = await fetchDiscogsRelease(discogsId);
          if (cancelled) return;
          setDiscogsDetail(release);
          const blurb = await fetchAlbumDescription(
            release.artist,
            release.title,
            release.notes
          );
          if (!cancelled) setAlbumBlurb(blurb);
        } catch {
          if (!cancelled) setAlbumBlurb('');
        } finally {
          if (!cancelled) setEnriching(false);
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    if (!hit) return;

    setFormat(pickVinylFormatFromDiscogs(hit.format));
    setArtist(hit.artist);
    setTitle(hit.title);
    setYear(hit.year ?? '');
    setCoverUrl(proxyCoverUrl(hit.cover) ?? proxyCoverUrl(hit.thumb));
    setGenres([...new Set([...(hit.genre ?? []), ...(hit.style ?? [])])].slice(0, 8));

    let cancelled = false;

    if (prefetchedRelease?.tracklist?.length) {
      setDiscogsDetail(prefetchedRelease);
    }

    (async () => {
      setEnriching(true);
      setError('');
      try {
        const release = await resolveDiscogsReleaseDetail(hit.id, prefetchedRelease);
        const enriched = await enrichRecord(release.artist, release.title, hit.id);
        if (cancelled) return;

        setDiscogsDetail(release);
        setArtist(release.artist);
        setTitle(release.title);
        setYear(release.year ?? hit.year ?? '');
        setCoverUrl(
          proxyCoverUrl(release.coverUrl) ??
            proxyCoverUrl(hit.cover) ??
            proxyCoverUrl(hit.thumb)
        );
        setGenres(
          [...new Set([...(release.genres || []), ...(enriched.genres || [])])].slice(0, 8)
        );
        setBpm(String(release.bpm ?? enriched.bpm ?? ''));
        setCamelotKey(release.camelotKey ?? enriched.camelotKey ?? '');
        setVibeTags([...new Set(enriched.vibeTags)].slice(0, 6));

        const blurb = await fetchAlbumDescription(
          release.artist,
          release.title,
          release.notes
        );
        if (!cancelled) setAlbumBlurb(blurb);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load full metadata');
        }
      } finally {
        if (!cancelled) setEnriching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, hit, prefetchedRelease, editingRecord, reset]);

  const toggleVibe = (tag: string) => {
    setVibeTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag].slice(0, 6)
    );
  };

  const canSave = Boolean(
    (hit || editingRecord) &&
      artist.trim() &&
      title.trim() &&
      !saving &&
      (isEditMode ? onUpdate : onSave)
  );

  const handleSave = async () => {
    if (!canSave) return;

    if (isEditMode && editingRecord && onUpdate) {
      setSaving(true);
      setError('');
      try {
        const musical = {
          bpm: bpm ? parseInt(bpm, 10) : undefined,
          camelotKey: camelotKey || undefined,
          vibeTags,
        };
        const primaryPatch = patchPrimaryTrack(editingRecord, musical);
        onUpdate(editingRecord.id, {
          artist: artist.trim(),
          title: title.trim(),
          year: year || undefined,
          format: sanitizeVinylFormat(format),
          coverUrl,
          genres,
          condition,
          notes: personalNotes.trim() || undefined,
          tracks: primaryPatch.tracks ?? editingRecord.tracks,
        });
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save changes');
        setSaving(false);
      }
      return;
    }

    if (!hit) return;
    if (hit.format?.length && hit.format.every(isCdFormat)) {
      setError('MyVinyl is vinyl only — CD releases cannot be added.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const releaseDetail = await resolveDiscogsReleaseDetail(
        hit.id,
        discogsDetail ?? prefetchedRelease
      );
      setDiscogsDetail(releaseDetail);

      const payload = releaseFromDiscogsImport(
        {
          discogsId: hit.id,
          artist: artist.trim(),
          title: title.trim(),
          year: year || undefined,
          format: sanitizeVinylFormat(format),
          coverUrl,
          genres,
          condition,
          notes: personalNotes.trim() || undefined,
          addSource: 'manual',
        },
        releaseDetail,
        {
          vibeTags,
          bpm: bpm ? parseInt(bpm, 10) : undefined,
          camelotKey: camelotKey || undefined,
        }
      );

      onSave?.(payload);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save record');
      setSaving(false);
    }
  };

  const displayTitle = title || editingRecord?.title || hit?.title || '';
  const displayArtist = artist || editingRecord?.artist || hit?.artist || '';

  const modal = (
    <AnimatePresence>
      {open && (hit || editingRecord) && (
        <motion.div
          className="add-modal-backdrop fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-labelledby="add-modal-title"
            aria-modal="true"
            className="add-modal"
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.99, y: 6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="add-modal__header">
              <div>
                <p className="add-modal__eyebrow">
                  {isEditMode ? 'Collection' : 'New record'}
                </p>
                <h2 id="add-modal-title" className="add-modal__title">
                  {isEditMode ? 'Edit record' : 'Add to collection'}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost h-9 w-9 shrink-0 rounded-full p-0"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {enriching && (
              <p className="add-modal__status">
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                {isEditMode
                  ? 'Refreshing release details…'
                  : 'Loading release details, BPM, key & vibes…'}
              </p>
            )}

            <div className="add-modal__body">
              <aside className="add-modal__aside">
                <div className="add-modal__story">
                  <div className="add-modal__hero">
                    <div className="add-modal__cover-wrap">
                      <div className="add-modal__cover">
                        {coverUrl ? (
                          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            {enriching ? (
                              <Loader2 className="h-9 w-9 animate-spin text-[var(--accent)]" />
                            ) : (
                              <Disc3
                                className="h-11 w-11 text-[var(--text-muted)]"
                                strokeWidth={1}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="add-modal__meta">
                      <h3 className="add-modal__album-title">{displayTitle}</h3>
                      <p className="add-modal__album-artist">
                        {displayArtist}
                        {year ? (
                          <span className="add-modal__album-year"> · {year}</span>
                        ) : null}
                      </p>
                      {genres.length > 0 && (
                        <div className="add-modal__genres">
                          {genres.slice(0, 6).map((g) => (
                            <span key={g} className="tag-pill">
                              {g}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="add-modal__about">
                    <h4 className="add-modal__about-heading">About this release</h4>
                    {albumBlurb ? (
                      <p className="add-modal__about-text" title={albumBlurb}>
                        {albumBlurb}
                      </p>
                    ) : enriching ? (
                      <p className="add-modal__about-placeholder">Loading description…</p>
                    ) : (
                      <p className="add-modal__about-placeholder">
                        No description available for this release.
                      </p>
                    )}
                  </div>
                </div>
              </aside>

              <form
                id="discover-add-form"
                className="add-modal__form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSave();
                }}
              >
                <div className="add-modal__fields">
                  {error && (
                    <p className="add-modal__error" role="alert">
                      {error}
                    </p>
                  )}

                  <p className="add-modal__form-intro">Crate details</p>

                  <div className="add-modal__form-grid">
                    <fieldset className="add-modal__fieldset add-modal__fieldset--pair">
                      <SectionLabel>Format</SectionLabel>
                      <div className="add-modal__chips">
                        {VINYL_FORMATS.map((f) => (
                          <Chip key={f} active={format === f} onClick={() => setFormat(f)}>
                            {f}
                          </Chip>
                        ))}
                      </div>
                    </fieldset>

                    <fieldset className="add-modal__fieldset add-modal__fieldset--pair">
                      <SectionLabel>Condition</SectionLabel>
                      <div className="add-modal__chips">
                        {CONDITIONS.map((c) => (
                          <Chip key={c} active={condition === c} onClick={() => setCondition(c)}>
                            {c}
                          </Chip>
                        ))}
                      </div>
                    </fieldset>

                    <fieldset className="add-modal__fieldset add-modal__fieldset--mix">
                      <SectionLabel>Mix data</SectionLabel>
                      <div className="add-modal__mix-row">
                        <div className="add-modal__field-narrow">
                          <label className="add-modal__field-label">BPM</label>
                          <input
                            type="number"
                            className="input-field add-modal__input-compact text-center tabular-nums"
                            placeholder="—"
                            value={bpm}
                            onChange={(e) => setBpm(e.target.value)}
                            min={40}
                            max={220}
                            disabled={enriching}
                          />
                        </div>
                        <div className="add-modal__field-key">
                          <label className="add-modal__field-label">Key</label>
                          <select
                            className="input-field add-modal__input-compact"
                            value={camelotKey}
                            onChange={(e) => setCamelotKey(e.target.value)}
                            disabled={enriching}
                          >
                            <option value="">—</option>
                            {CAMELOT_KEYS.map((k) => (
                              <option key={k} value={k}>
                                {k}
                              </option>
                            ))}
                          </select>
                        </div>
                        {enriching && (
                          <span className="add-modal__enrich-hint">
                            <Sparkles className="h-3 w-3 text-[var(--violet)]" />
                            Auto-filling
                          </span>
                        )}
                      </div>
                    </fieldset>

                    <fieldset className="add-modal__fieldset add-modal__fieldset--vibes">
                      <SectionLabel>Vibes</SectionLabel>
                      <div className="add-modal__chips add-modal__chips--vibes">
                        {VIBE_TAG_SUGGESTIONS.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => toggleVibe(t)}
                            className={`tag-pill cursor-pointer text-[10px] ${
                              vibeTags.includes(t) ? 'tag-pill--accent' : ''
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                      <input
                        className="input-field add-modal__vibe-input"
                        placeholder="Custom vibe…"
                        value={customVibe}
                        onChange={(e) => setCustomVibe(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && customVibe.trim()) {
                            e.preventDefault();
                            toggleVibe(customVibe.trim());
                            setCustomVibe('');
                          }
                        }}
                      />
                    </fieldset>

                    <fieldset className="add-modal__fieldset add-modal__fieldset--notes">
                      <SectionLabel>Your notes</SectionLabel>
                      <textarea
                        className="input-field add-modal__notes"
                        placeholder="Crate slot, pressing details, mix ideas…"
                        value={personalNotes}
                        onChange={(e) => setPersonalNotes(e.target.value)}
                        rows={3}
                      />
                    </fieldset>
                  </div>
                </div>
              </form>
            </div>

            <footer className="add-modal__footer">
              <button type="button" onClick={onClose} className="btn-ghost add-modal__cancel">
                Cancel
              </button>
              <button
                type="submit"
                form="discover-add-form"
                disabled={!canSave}
                className="btn-primary add-modal__submit"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {isEditMode ? 'Saving…' : 'Adding…'}
                  </>
                ) : isEditMode ? (
                  <>
                    <Pencil className="h-3.5 w-3.5" strokeWidth={2.25} />
                    Save changes
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
                    Add to collection
                  </>
                )}
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(modal, document.body);
}