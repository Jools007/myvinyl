import { AnimatePresence, motion } from 'framer-motion';
import { Disc3, Loader2, Play, Plus, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ENRICHMENT_ESTIMATE_HINT,
  enrichRecord,
  enrichReleaseContextFromDiscogs,
  resolveDiscogsReleaseDetail,
} from '../lib/api';
import { AboutReleaseSection } from './AboutReleaseSection';
import { resolveDiscogsCoverUrl } from '../lib/discogsCover';
import { CAMELOT_KEYS } from '../lib/camelot';
import {
  canonicalVibeTag,
  MAX_VIBE_TAGS,
  VIBE_TAG_SUGGESTIONS,
  vibesFromEnrichment,
} from '../lib/vibes';
import {
  isCdFormat,
  pickVinylFormatFromDiscogs,
  sanitizeVinylFormat,
  VINYL_FORMATS,
} from '../lib/formats';
import type { DiscoverAddIntent } from '../lib/discoverAdd';
import {
  isPlayableDiscogsTrack,
  releaseFromDiscogsImport,
  tracksFromDiscogsTracklist,
} from '../lib/tracks';
import type { DiscogsReleaseDetail } from '../lib/api';
import type { DiscogsSearchHit, RecordCondition, VinylRecord } from '../lib/types';

const CONDITIONS: RecordCondition[] = ['Mint', 'NM', 'VG+', 'VG', 'G+', 'G', 'P'];

interface DiscoverAddPanelProps {
  hit: DiscogsSearchHit | null;
  /** Full Discogs release from barcode scan (tracklist pre-loaded) */
  prefetchedRelease?: DiscogsReleaseDetail | null;
  open: boolean;
  onClose: () => void;
  onSave?: (
    record: Omit<VinylRecord, 'id' | 'addedAt'>,
    meta: { intent: DiscoverAddIntent; trackIndex: number }
  ) => void;
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
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`add-modal__chip ${active ? 'add-modal__chip--active' : ''}`}
    >
      {children}
    </button>
  );
}

export function DiscoverAddPanel({
  hit,
  prefetchedRelease = null,
  open,
  onClose,
  onSave,
}: DiscoverAddPanelProps) {
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState('');
  const [enrichHint, setEnrichHint] = useState('');
  const [artist, setArtist] = useState('');
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | undefined>();
  const [genres, setGenres] = useState<string[]>([]);
  const [format, setFormat] = useState('');
  const [bpm, setBpm] = useState('');
  const [camelotKey, setCamelotKey] = useState('');
  const [condition, setCondition] = useState<RecordCondition>('NM');
  const [personalNotes, setPersonalNotes] = useState('');
  const [vibeTags, setVibeTags] = useState<string[]>([]);
  const [customVibe, setCustomVibe] = useState('');
  const [discogsDetail, setDiscogsDetail] = useState<DiscogsReleaseDetail | null>(null);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveIntent, setSaveIntent] = useState<DiscoverAddIntent>('spin');
  const vibesTouchedRef = useRef(false);

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
    setPersonalNotes('');
    setVibeTags([]);
    setCustomVibe('');
    setDiscogsDetail(null);
    setSelectedTrackIndex(0);
    setSaving(false);
    setSaveIntent('spin');
    vibesTouchedRef.current = false;
  }, []);

  const platterTracks = useMemo(() => {
    const list = discogsDetail?.tracklist ?? prefetchedRelease?.tracklist ?? [];
    return list.filter(isPlayableDiscogsTrack);
  }, [discogsDetail, prefetchedRelease]);

  useEffect(() => {
    if (selectedTrackIndex >= platterTracks.length) {
      setSelectedTrackIndex(0);
    }
  }, [platterTracks.length, selectedTrackIndex]);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }

    if (!hit) return;

    setFormat(pickVinylFormatFromDiscogs(hit.format));
    setArtist(hit.artist);
    setTitle(hit.title);
    setYear(hit.year ?? '');
    setCoverUrl(
      resolveDiscogsCoverUrl(hit.cover) ?? resolveDiscogsCoverUrl(hit.thumb)
    );
    setGenres([...new Set([...(hit.genre ?? []), ...(hit.style ?? [])])].slice(0, 8));

    let cancelled = false;

    setSelectedTrackIndex(0);
    vibesTouchedRef.current = false;

    if (prefetchedRelease?.tracklist?.length) {
      setDiscogsDetail(prefetchedRelease);
    }

    (async () => {
      setEnriching(true);
      setError('');
      setEnrichHint('');
      try {
        const release = await resolveDiscogsReleaseDetail(hit.id, prefetchedRelease);
        if (cancelled) return;

        setDiscogsDetail(release);
        setArtist(release.artist);
        setTitle(release.title);
        setYear(release.year ?? hit.year ?? '');
        setCoverUrl(
          resolveDiscogsCoverUrl(release.coverUrl) ??
            resolveDiscogsCoverUrl(hit.cover) ??
            resolveDiscogsCoverUrl(hit.thumb)
        );
        setGenres([...new Set(release.genres ?? [])].slice(0, 8));
        setBpm(String(release.bpm ?? ''));
        setCamelotKey(release.camelotKey ?? '');

        const enriched = await enrichRecord(
          release.artist,
          release.title,
          hit.id,
          release.title,
          release.genres,
          { release: enrichReleaseContextFromDiscogs(release) }
        );
        if (cancelled) return;

        setGenres(
          [...new Set([...(release.genres || []), ...(enriched.genres || [])])].slice(0, 8)
        );
        setBpm(String(release.bpm ?? enriched.bpm ?? ''));
        setCamelotKey(release.camelotKey ?? enriched.camelotKey ?? '');
        if (!vibesTouchedRef.current) {
          const autoVibes = vibesFromEnrichment(enriched.vibeTags);
          if (autoVibes.length > 0) {
            setVibeTags(autoVibes);
          }
        }
        if (enriched.source === 'client' && (enriched.bpmEstimated || enriched.keyEstimated)) {
          setEnrichHint(ENRICHMENT_ESTIMATE_HINT);
        }

      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load release from Discogs');
        }
      } finally {
        if (!cancelled) setEnriching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, hit, prefetchedRelease, reset]);

  const toggleVibe = (tag: string) => {
    const canonical = canonicalVibeTag(tag);
    if (!canonical) return;
    vibesTouchedRef.current = true;
    setVibeTags((prev) =>
      prev.includes(canonical)
        ? prev.filter((t) => t !== canonical)
        : [...prev, canonical].slice(0, MAX_VIBE_TAGS)
    );
  };

  const canSave = Boolean(hit && artist.trim() && title.trim() && !saving && onSave);

  const handleSave = async (intent: DiscoverAddIntent) => {
    if (!canSave) return;

    if (!hit) return;
    if (hit.format?.length && hit.format.every(isCdFormat)) {
      setError('MyVinyl is vinyl only — CD releases cannot be added.');
      return;
    }

    setSaveIntent(intent);
    setSaving(true);
    setError('');

    try {
      const releaseDetail = await resolveDiscogsReleaseDetail(
        hit.id,
        discogsDetail ?? prefetchedRelease
      );
      setDiscogsDetail(releaseDetail);

      const trackCount = tracksFromDiscogsTracklist(
        releaseDetail.tracklist,
        title.trim()
      ).length;
      const trackIndex = Math.min(
        Math.max(selectedTrackIndex, 0),
        Math.max(trackCount - 1, 0)
      );

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
          trackIndex,
        }
      );

      onSave?.(payload, { intent, trackIndex });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save record');
      setSaving(false);
    }
  };

  const displayTitle = title || hit?.title || '';
  const displayArtist = artist || hit?.artist || '';

  const modal = (
    <AnimatePresence>
      {open && hit && (
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
                <p className="add-modal__eyebrow">Spin setup</p>
                <h2 id="add-modal-title" className="add-modal__title">
                  Add to collection
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
                Loading release details, BPM, key & vibes…
              </p>
            )}

            <div className="add-modal__body">
              <aside className="add-modal__aside">
                <div className="add-modal__story">
                  <div className="add-modal__hero">
                    <div className="add-modal__cover-wrap">
                      <div className="add-modal__cover">
                        {coverUrl ? (
                          <img
                            src={coverUrl}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                          />
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

                  <AboutReleaseSection
                    source={{
                      id: String(hit?.id ?? 'draft'),
                      artist: displayArtist,
                      title: displayTitle,
                      genres,
                    }}
                  />
                </div>
              </aside>

              <form
                id="discover-add-form"
                className="add-modal__form"
                onSubmit={(e) => e.preventDefault()}
              >
                <div className="add-modal__fields">
                  {error && (
                    <p className="add-modal__error" role="alert">
                      {error}
                    </p>
                  )}
                  {enrichHint && !error ? (
                    <p className="text-xs text-amber-600 dark:text-amber-400">{enrichHint}</p>
                  ) : null}

                  <p className="add-modal__form-intro">
                    Tag quickly — tap BPM on the deck while you spin.
                  </p>

                  {platterTracks.length > 1 ? (
                    <fieldset className="add-modal__fieldset add-modal__fieldset--tracks">
                      <SectionLabel>On the platter</SectionLabel>
                      <p className="add-modal__track-hint">Which cut are you spinning?</p>
                      <ul className="add-modal__track-list" role="listbox" aria-label="Track on platter">
                        {platterTracks.map((item, index) => {
                          const active = selectedTrackIndex === index;
                          const position =
                            item.position?.trim() || String(index + 1).padStart(2, '0');
                          return (
                            <li key={`${position}-${item.title}-${index}`}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={active}
                                className={`add-modal__track-row${active ? ' add-modal__track-row--active' : ''}`}
                                onClick={() => setSelectedTrackIndex(index)}
                                disabled={saving}
                              >
                                <span className="add-modal__track-pos font-mono tabular-nums">
                                  {position}
                                </span>
                                <span className="add-modal__track-title">{item.title}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </fieldset>
                  ) : null}

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
                      <SectionLabel>Mix data (optional)</SectionLabel>
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
                      <p className="add-modal__track-hint">
                        Genre & mood — pick up to {MAX_VIBE_TAGS}.
                      </p>
                      <div className="add-modal__chips add-modal__chips--vibes">
                        {VIBE_TAG_SUGGESTIONS.map((t) => {
                          const active = vibeTags.includes(t);
                          const atLimit = !active && vibeTags.length >= MAX_VIBE_TAGS;
                          return (
                            <Chip
                              key={t}
                              active={active}
                              disabled={saving || atLimit}
                              onClick={() => toggleVibe(t)}
                            >
                              {t}
                            </Chip>
                          );
                        })}
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
              <div className="add-modal__footer-actions">
                <button
                  type="button"
                  disabled={!canSave}
                  className="btn-ghost add-modal__save-later"
                  onClick={() => void handleSave('save')}
                >
                  {saving && saveIntent === 'save' ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
                      Save for later
                    </>
                  )}
                </button>
                <button
                  type="button"
                  disabled={!canSave}
                  className="btn-primary add-modal__submit add-modal__submit--spin"
                  onClick={() => void handleSave('spin')}
                >
                  {saving && saveIntent === 'spin' ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading deck…
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" strokeWidth={2.25} fill="currentColor" />
                      Load on deck
                    </>
                  )}
                </button>
              </div>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(modal, document.body);
}