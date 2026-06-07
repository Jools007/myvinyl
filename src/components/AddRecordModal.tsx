import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Search, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { enrichRecord, fetchDiscogsRelease, proxyCoverUrl, searchDiscogs } from '../lib/api';
import { CAMELOT_KEYS } from '../lib/camelot';
import { VIBE_TAG_SUGGESTIONS } from '../lib/vibes';
import type { DiscogsReleaseDetail } from '../lib/api';
import { enrichAllTracks, releaseFromDiscogsImport } from '../lib/tracks';
import type { DiscogsSearchHit, RecordCondition, VinylRecord } from '../lib/types';

interface AddRecordModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (record: Omit<VinylRecord, 'id' | 'addedAt'>) => void;
}

const CONDITIONS: RecordCondition[] = ['Mint', 'NM', 'VG+', 'VG', 'G+', 'G', 'P'];

export function AddRecordModal({ open, onClose, onSave }: AddRecordModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DiscogsSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<DiscogsSearchHit | null>(null);
  const [artist, setArtist] = useState('');
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | undefined>();
  const [genres, setGenres] = useState<string[]>([]);
  const [bpm, setBpm] = useState('');
  const [camelotKey, setCamelotKey] = useState('');
  const [condition, setCondition] = useState<RecordCondition>('NM');
  const [notes, setNotes] = useState('');
  const [vibeTags, setVibeTags] = useState<string[]>([]);
  const [customVibe, setCustomVibe] = useState('');
  const [discogsDetail, setDiscogsDetail] = useState<DiscogsReleaseDetail | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    setQuery('');
    setResults([]);
    setSelected(null);
    setArtist('');
    setTitle('');
    setYear('');
    setCoverUrl(undefined);
    setGenres([]);
    setBpm('');
    setCamelotKey('');
    setCondition('NM');
    setNotes('');
    setVibeTags([]);
    setError('');
    setEnriching(false);
    setDiscogsDetail(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const r = await searchDiscogs(query);
        setResults(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Search failed');
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 320);
    return () => clearTimeout(t);
  }, [query]);

  const applyEnrichment = async (hit: DiscogsSearchHit) => {
    setEnriching(true);
    setError('');
    try {
      const release = await fetchDiscogsRelease(hit.id);
      const enriched = await enrichRecord(release.artist, release.title, hit.id);

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
      setVibeTags(
        [...new Set([...enriched.vibeTags])].slice(0, 6)
      );
    } catch (e) {
      setArtist(hit.artist);
      setTitle(hit.title);
      setYear(hit.year ?? '');
      setCoverUrl(proxyCoverUrl(hit.cover) ?? proxyCoverUrl(hit.thumb));
      setGenres([...(hit.genre ?? []), ...(hit.style ?? [])].slice(0, 6));
      setError(e instanceof Error ? e.message : 'Could not fetch full metadata');
    } finally {
      setEnriching(false);
    }
  };

  const handleSelect = async (hit: DiscogsSearchHit) => {
    setSelected(hit);
    await applyEnrichment(hit);
  };

  const toggleVibe = (tag: string) => {
    setVibeTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag].slice(0, 6)
    );
  };

  const handleSave = async () => {
    if (!selected || !artist || !title || saving) return;
    setSaving(true);
    setError('');
    try {
      let payload = releaseFromDiscogsImport(
        {
          discogsId: selected.id,
          artist,
          title,
          year: year || undefined,
          coverUrl,
          genres,
          condition,
          notes: notes || undefined,
          addSource: 'manual',
        },
        discogsDetail ?? { tracklist: [], bpm: undefined, camelotKey: undefined },
        {
          vibeTags,
          bpm: bpm ? parseInt(bpm, 10) : undefined,
          camelotKey: camelotKey || undefined,
        }
      );
      payload = {
        ...payload,
        tracks: await enrichAllTracks(payload.artist, payload.tracks, {
          discogsId: selected.id,
          albumTitle: title.trim(),
          genres,
        }),
      };
      onSave(payload);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save record');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-4 top-[5%] z-[70] mx-auto max-h-[90vh] max-w-xl overflow-y-auto rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-lg)] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-4">
              <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
                Add from Discogs
              </h2>
              <button type="button" onClick={onClose} className="btn-ghost h-9 w-9 rounded-full p-0">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-6 p-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  className="input-field pl-10"
                  placeholder="Search artist, album, or catalog…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
                {loading && (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--accent)]" />
                )}
              </div>

              {error && <p className="text-sm text-amber-600 dark:text-amber-400">{error}</p>}

              {!selected && results.length > 0 && (
                <ul className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-[var(--border)] p-1">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(r)}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
                      >
                        {(r.thumb || r.cover) && (
                          <img
                            src={proxyCoverUrl(r.cover) ?? proxyCoverUrl(r.thumb)}
                            alt=""
                            className="h-11 w-11 shrink-0 rounded-lg object-cover"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{r.title}</p>
                          <p className="truncate text-xs text-[var(--text-muted)]">
                            {r.artist}
                            {r.year ? ` · ${r.year}` : ''}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {selected && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-5"
                >
                  <div className="flex gap-4 rounded-xl bg-[var(--bg-subtle)] p-4">
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt=""
                        className="h-24 w-24 shrink-0 rounded-xl object-cover shadow-md"
                      />
                    ) : (
                      <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-hover)]">
                        {enriching ? (
                          <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
                        ) : null}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-tight">{title || selected.title}</p>
                      <p className="text-sm text-[var(--text-secondary)]">{artist || selected.artist}</p>
                      {enriching ? (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--accent)]">
                          <Sparkles className="h-3 w-3" />
                          Pulling BPM, key & vibes from Spotify & Last.fm…
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-[var(--teal)]">Metadata loaded</p>
                      )}
                      <button
                        type="button"
                        className="mt-2 text-xs text-[var(--accent)]"
                        onClick={() => {
                          setSelected(null);
                          setArtist('');
                          setTitle('');
                          setYear('');
                          setCoverUrl(undefined);
                          setGenres([]);
                          setBpm('');
                          setCamelotKey('');
                          setVibeTags([]);
                        }}
                      >
                        Change selection
                      </button>
                    </div>
                  </div>

                  {genres.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {genres.map((g) => (
                        <span key={g} className="tag-pill">
                          {g}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                        BPM
                      </label>
                      <input
                        type="number"
                        className="input-field"
                        placeholder="128"
                        value={bpm}
                        onChange={(e) => setBpm(e.target.value)}
                        min={40}
                        max={220}
                        disabled={enriching}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                        Camelot Key
                      </label>
                      <select
                        className="input-field"
                        value={camelotKey}
                        onChange={(e) => setCamelotKey(e.target.value)}
                        disabled={enriching}
                      >
                        <option value="">Select…</option>
                        {CAMELOT_KEYS.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                      Condition
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {CONDITIONS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCondition(c)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                            condition === c
                              ? 'bg-[var(--accent)] text-white'
                              : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">
                      Vibe tags
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {VIBE_TAG_SUGGESTIONS.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => toggleVibe(t)}
                          className={`tag-pill cursor-pointer ${
                            vibeTags.includes(t) ? 'tag-pill--accent' : ''
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        className="input-field flex-1"
                        placeholder="Custom tag…"
                        value={customVibe}
                        onChange={(e) => setCustomVibe(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && customVibe.trim()) {
                            toggleVibe(customVibe.trim());
                            setCustomVibe('');
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                      Notes
                    </label>
                    <textarea
                      className="input-field min-h-[80px] resize-none"
                      placeholder="Crate location, pressing notes, mix ideas…"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={enriching}
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    Add to collection
                  </button>
                </motion.div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}