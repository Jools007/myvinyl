import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';

import { isCdFormat, sanitizeVinylFormat } from '../lib/formats';
import { isScannerSessionActive } from '../lib/scannerSession';
import {
  runCharacterBlurbRefresh,
  idleCharacterBlurbRefresh,
  type CharacterBlurbRefreshOptions,
  type CharacterBlurbRefreshProgress,
  type CharacterBlurbRefreshResult,
} from '../lib/characterBlurbs';
import {
  runFullMetadataEnrichment,
  idleMetadataEnrichment,
  type FullMetadataEnrichmentOptions,
  type FullMetadataEnrichmentProgress,
  type FullMetadataEnrichmentResult,
} from '../lib/fullMetadataEnrichment';
import {
  runFullTracklistEnrichment,
  idleTracklistEnrichment,
  BATCH_PAUSE_MS,
  countIncompleteTracklistTargets,
  formatEnrichmentSummary,
  TRACKLIST_ENRICH_BATCH_SIZE,
  TRACKLIST_ENRICH_LARGE_THRESHOLD,
  type FullTracklistEnrichmentProgress,
  type FullTracklistEnrichmentResult,
} from '../lib/fullTracklistEnrichment';
import {
  mergePreservingTrackEnrichment,
  needsBackgroundMigration,
  runBackgroundMigrations,
  type BackgroundSyncState,
} from '../lib/recordMigration';
import {
  enrichReleaseTracksSequential,
  isReleaseFullyEnriched,
  migrateRecord,
  replaceTrackOnRelease,
} from '../lib/tracks';
import {
  countRecordsForClearMode,
  recordsAfterClear,
  type ClearCollectionMode,
} from '../lib/collectionClear';
import { bulkImportCollectionRecords } from '../lib/discogsImport';
import { GUEST_CRATE_MAX_RECORDS } from '../lib/collectionContext';
import { registerCharacterBlurbPersister } from '../lib/albumDescription';
import {
  applyCrossCrateTransferToCollection,
  type CrossCrateTransferStats,
} from '../lib/crossCrateEnrichment';
import {
  addRecord as addRecordToSupabase,
  addRecordsBatch,
  deleteRecord as deleteRecordFromSupabase,
  fetchRecords,
  isPersistedRecordId,
  updateRecord as updateRecordInSupabase,
} from '../lib/records';
import { generateId, loadSettings, saveSettings } from '../lib/storage';
import type { AppSettings, VinylRecord } from '../lib/types';

const idleSync: BackgroundSyncState = { phase: 'idle', message: '' };
const PERSIST_DEBOUNCE_MS = 400;

function friendlyCollectionError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('not authenticated') || lower.includes('jwt')) {
    return 'Your session may have expired. Try again, or sign out and sign back in.';
  }
  if (
    lower.includes('insufficient_resources') ||
    lower.includes('err_insufficient_resources')
  ) {
    return 'The browser was overwhelmed loading your collection. Close this tab, reopen MyVinyl, and try again.';
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('failed to fetch')) {
    return 'We could not reach the server. Check your internet connection and try again.';
  }
  return message || 'Something went wrong while loading your collection. Please try again.';
}

export type LiveEnrichState = {
  recordId: string;
  trackId: string | null;
} | null;

export type UpdateRecordOptions = {
  /** Write through to Supabase immediately (user-owned fields like manual BPM). */
  persistImmediately?: boolean;
};

export type UseCollectionScope = {
  /** Active crate id — when omitted, legacy fetch (all user records). */
  collectionId?: string | null;
  personalCollectionId?: string | null;
  /** When true, new adds/imports are blocked (guest demo view). */
  readOnly?: boolean;
  /** When true, defer fetch until crate context is ready (avoids duplicate/wrong-scope loads). */
  suspended?: boolean;
  /**
   * Skip tracklist JSON on fetch — ONLY for large guest demo crates.
   * Personal crates must always load full tracklists (BPM, ratings, vibes live there).
   */
  summaryOnly?: boolean;
};

export function useCollection(scope?: UseCollectionScope) {
  const collectionId = scope?.collectionId ?? null;
  const personalCollectionId = scope?.personalCollectionId ?? null;
  const readOnly = scope?.readOnly ?? false;
  const suspended = scope?.suspended ?? false;
  const summaryOnly = scope?.summaryOnly ?? false;

  const { user, loading: authLoading } = useAuth();
  const [records, setRecords] = useState<VinylRecord[]>([]);
  const recordsRef = useRef(records);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [hydrated, setHydrated] = useState(false);
  const [isFetchingCollection, setIsFetchingCollection] = useState(false);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const fetchGenerationRef = useRef(0);
  const [backgroundSync, setBackgroundSync] = useState<BackgroundSyncState>(idleSync);
  const [tracklistEnrichment, setTracklistEnrichment] =
    useState<FullTracklistEnrichmentProgress>(idleTracklistEnrichment);
  const [metadataEnrichment, setMetadataEnrichment] =
    useState<FullMetadataEnrichmentProgress>(idleMetadataEnrichment);
  const [characterBlurbRefresh, setCharacterBlurbRefresh] =
    useState<CharacterBlurbRefreshProgress>(idleCharacterBlurbRefresh);
  const [liveEnrich, setLiveEnrich] = useState<LiveEnrichState>(null);
  const backgroundStarted = useRef(false);
  const enrichRunRef = useRef(0);
  const tracklistEnrichmentRunRef = useRef(0);
  const metadataEnrichmentRunRef = useRef(0);
  const characterBlurbRunRef = useRef(0);
  const persistTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  /** While set, background migrations must not overwrite this release (live per-track enrich). */
  const enrichActiveRecordIdRef = useRef<string | null>(null);
  /** Blocks visibility sync / refresh while guest smart enrich or long batch jobs run. */
  const bulkEnrichmentActiveRef = useRef(false);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  useEffect(() => {
    return () => {
      for (const timer of persistTimersRef.current.values()) {
        clearTimeout(timer);
      }
      persistTimersRef.current.clear();
    };
  }, []);

  const loadCollection = useCallback(async () => {
    if (!user) return;

    const generation = ++fetchGenerationRef.current;
    setIsFetchingCollection(true);
    setCollectionError(null);
    setHydrated(false);

    const result = await fetchRecords(
      collectionId
        ? {
            collectionId,
            personalCollectionId: personalCollectionId ?? undefined,
            summaryOnly,
            shouldContinue: () => generation === fetchGenerationRef.current,
          }
        : { summaryOnly, shouldContinue: () => generation === fetchGenerationRef.current }
    );
    if (generation !== fetchGenerationRef.current) return;

    if (result.error) {
      if (result.error.message === 'Fetch cancelled') return;
      setCollectionError(friendlyCollectionError(result.error.message));
      setIsFetchingCollection(false);
      return;
    }

    const remote = (result.data ?? []).map((record) => migrateRecord(record));
    setRecords((prev) => {
      const merged = mergePreservingTrackEnrichment(prev, remote);
      recordsRef.current = merged;
      return merged;
    });
    setCollectionError(null);
    setHydrated(true);
    setIsFetchingCollection(false);
  }, [user?.id, collectionId, personalCollectionId, summaryOnly]);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      fetchGenerationRef.current += 1;
      setRecords([]);
      setHydrated(true);
      setCollectionError(null);
      setIsFetchingCollection(false);
      return;
    }

    if (suspended) {
      setHydrated(false);
      setIsFetchingCollection(true);
      setCollectionError(null);
      return;
    }

    void loadCollection();

    return () => {
      fetchGenerationRef.current += 1;
    };
  }, [user?.id, authLoading, loadCollection, suspended]);

  const persistRecordNow = useCallback((record: VinylRecord) => {
    if (!isPersistedRecordId(record.id)) return;
    persistQueueRef.current = persistQueueRef.current
      .then(() => updateRecordInSupabase(record))
      .then(() => undefined)
      .catch(() => undefined);
  }, []);

  const persistRecordImmediately = useCallback((record: VinylRecord) => {
    const pending = persistTimersRef.current.get(record.id);
    if (pending) {
      clearTimeout(pending);
      persistTimersRef.current.delete(record.id);
    }
    persistRecordNow(record);
  }, [persistRecordNow]);

  useEffect(() => {
    if (readOnly) {
      registerCharacterBlurbPersister(null);
      return;
    }

    registerCharacterBlurbPersister((source, blurb) => {
      const existing = recordsRef.current.find((record) => record.id === source.id);
      if (!existing || existing.characterBlurb?.trim()) return;

      const next = migrateRecord({ ...existing, characterBlurb: blurb });
      recordsRef.current = recordsRef.current.map((record) =>
        record.id === next.id ? next : record
      );
      setRecords((prev) => prev.map((record) => (record.id === next.id ? next : record)));
      persistRecordNow(next);
    });

    return () => registerCharacterBlurbPersister(null);
  }, [readOnly, persistRecordNow]);

  const replaceSavedRecord = useCallback(
    (localId: string, saved: VinylRecord) => {
      setRecords((prev) =>
        prev.map((record) => {
          if (record.id !== localId) return record;
          const merged = migrateRecord({
            ...saved,
            ...record,
            id: saved.id,
            addedAt: saved.addedAt,
            tracks: record.tracks,
          });
          persistRecordNow(merged);
          return merged;
        })
      );
    },
    [persistRecordNow]
  );

  const persistNewRecord = useCallback(
    (entry: VinylRecord) => {
      void addRecordToSupabase(entry, {
        collectionId: entry.collectionId ?? collectionId ?? undefined,
      }).then((result) => {
        if (result.data) replaceSavedRecord(entry.id, result.data);
      });
    },
    [collectionId, replaceSavedRecord]
  );

  const schedulePersistRecord = useCallback(
    (recordId: string) => {
      const existing = persistTimersRef.current.get(recordId);
      if (existing) clearTimeout(existing);

      persistTimersRef.current.set(
        recordId,
        setTimeout(() => {
          persistTimersRef.current.delete(recordId);
          const record = recordsRef.current.find((row) => row.id === recordId);
          if (record) persistRecordNow(record);
        }, PERSIST_DEBOUNCE_MS)
      );
    },
    [persistRecordNow]
  );

  useEffect(() => {
    if (!hydrated) return;
    if (readOnly) return;
    if (backgroundStarted.current || !needsBackgroundMigration()) return;
    backgroundStarted.current = true;

    let cancelled = false;
    const initial = recordsRef.current;

    void runBackgroundMigrations(initial, {
      onRecordsChange: (next, changedRecordId) => {
        if (!cancelled) {
          setRecords((prev) => {
            const liveId = enrichActiveRecordIdRef.current;
            if (!liveId) return mergePreservingTrackEnrichment(prev, next);
            return next.map((n) => {
              if (n.id === liveId) {
                return prev.find((r) => r.id === liveId) ?? n;
              }
              const p = prev.find((r) => r.id === n.id);
              return p ? mergePreservingTrackEnrichment([p], [n])[0] : migrateRecord(n);
            });
          });
          if (changedRecordId) {
            schedulePersistRecord(changedRecordId);
          }
        }
      },
      onStatus: (status) => {
        if (!cancelled) setBackgroundSync(status);
      },
      isCancelled: () => cancelled,
    });

    return () => {
      cancelled = true;
      setBackgroundSync(idleSync);
    };
  }, [hydrated, readOnly, schedulePersistRecord]);

  const addRecord = useCallback(
    (record: Omit<VinylRecord, 'id' | 'addedAt'>, targetCollectionId?: string) => {
      if (readOnly && !targetCollectionId) return null;
      if (isCdFormat(record.format)) return null;
      const scopedCollectionId = targetCollectionId ?? collectionId ?? undefined;
      const entry = migrateRecord({
        ...record,
        format: sanitizeVinylFormat(record.format),
        addSource: record.addSource ?? 'manual',
        collectionId: scopedCollectionId,
        id: generateId(),
        addedAt: new Date().toISOString(),
      });
      setRecords((prev) => {
        const next = [entry, ...prev];
        recordsRef.current = next;
        return next;
      });
      persistNewRecord(entry);
      return entry;
    },
    [collectionId, persistNewRecord, readOnly]
  );

  const importDiscogsCollection = useCallback(
    async (incoming: Omit<VinylRecord, 'id' | 'addedAt'>[], options?: { collectionId?: string }) => {
      const targetCollectionId = options?.collectionId ?? collectionId ?? undefined;
      if (!targetCollectionId) {
        return { added: 0, skipped: incoming.length, capped: 0 };
      }

      const fetched = await fetchRecords({
        collectionId: targetCollectionId,
        personalCollectionId: personalCollectionId ?? undefined,
      });
      const prev = (fetched.data ?? []).map((record) => migrateRecord(record));

      const headroom = Math.max(0, GUEST_CRATE_MAX_RECORDS - prev.length);
      const vinylIncoming = incoming.filter((row) => !isCdFormat(row.format));
      const cappedIncoming =
        vinylIncoming.length > headroom ? vinylIncoming.slice(0, headroom) : vinylIncoming;
      const capped = Math.max(0, vinylIncoming.length - cappedIncoming.length);

      const stamped = cappedIncoming.map((row) => ({
        ...row,
        collectionId: targetCollectionId,
        addSource: row.addSource ?? ('discogs-import' as const),
      }));

      const next = bulkImportCollectionRecords(prev, stamped, generateId);
      const addedEntries = next.records
        .slice(0, next.added)
        .map((entry) => ({ ...entry, collectionId: targetCollectionId }));

      const batch = await addRecordsBatch(addedEntries, {
        collectionId: targetCollectionId,
      });

      const actuallyAdded = batch.data?.length ?? 0;
      const persistFailed = batch.failed;

      if (batch.error && actuallyAdded === 0) {
        throw new Error(batch.error.message);
      }

      if (targetCollectionId === collectionId) {
        const refreshed = await fetchRecords({
          collectionId: targetCollectionId,
          personalCollectionId: personalCollectionId ?? undefined,
        });
        const merged = (refreshed.data ?? []).map((record) => migrateRecord(record));
        setRecords(merged);
        recordsRef.current = merged;
      }

      return {
        added: actuallyAdded,
        skipped: next.skipped + capped + persistFailed,
        capped,
        partial: Boolean(batch.error && actuallyAdded > 0),
        error: batch.error?.message,
      };
    },
    [collectionId, personalCollectionId, persistNewRecord]
  );

  const updateRecord = useCallback(
    (
      id: string,
      patch: Partial<VinylRecord> | ((record: VinylRecord) => Partial<VinylRecord>),
      options?: UpdateRecordOptions
    ) => {
      if (readOnly) return;
      flushSync(() => {
        setRecords((prev) => {
          const next = prev.map((record) => {
            if (record.id !== id) return record;
            const nextPatch = typeof patch === 'function' ? patch(record) : patch;
            const updated = migrateRecord({ ...record, ...nextPatch });
            if (options?.persistImmediately) {
              persistRecordImmediately(updated);
            } else {
              schedulePersistRecord(updated.id);
            }
            return updated;
          });
          recordsRef.current = next;
          return next;
        });
      });
    },
    [persistRecordImmediately, readOnly, schedulePersistRecord]
  );

  const applyEnrichedTrack = useCallback(
    (recordId: string, enrichedTrack: VinylRecord['tracks'][0]) => {
      flushSync(() => {
        setRecords((prev) => {
          const next = prev.map((record) => {
            if (record.id !== recordId) return record;
            return migrateRecord(replaceTrackOnRelease(record, enrichedTrack));
          });
          recordsRef.current = next;
          return next;
        });
      });
      schedulePersistRecord(recordId);
    },
    [schedulePersistRecord]
  );

  /**
   * Enrich track-by-track; each API response immediately updates React state + Supabase.
   */
  const enrichReleaseInCollection = useCallback(
    async (
      recordId: string,
      options?: { force?: boolean }
    ): Promise<VinylRecord | null> => {
      const force = options?.force ?? false;
      const runId = ++enrichRunRef.current;
      let snapshot = recordsRef.current.find((r) => r.id === recordId);
      if (!snapshot) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        snapshot = recordsRef.current.find((r) => r.id === recordId);
      }
      if (!snapshot) return null;

      if (!force && isReleaseFullyEnriched(snapshot)) {
        return snapshot;
      }

      if (enrichActiveRecordIdRef.current === recordId) {
        return snapshot;
      }

      setLiveEnrich({ recordId, trackId: null });
      enrichActiveRecordIdRef.current = recordId;

      try {
        await enrichReleaseTracksSequential(
          snapshot,
          {
            discogsId: snapshot.discogsId,
            albumTitle: snapshot.title,
            genres: snapshot.genres,
            force,
          },
          {
            onTrackStart: (track) => {
              if (enrichRunRef.current === runId) {
                setLiveEnrich({ recordId, trackId: track.id });
              }
            },
            getTrack: (trackId) =>
              recordsRef.current
                .find((r) => r.id === recordId)
                ?.tracks.find((t) => t.id === trackId),
            onTrackEnriched: (enriched) => {
              if (enrichRunRef.current !== runId) return;
              applyEnrichedTrack(recordId, enriched);
            },
          }
        );

        if (enrichRunRef.current !== runId) return null;
        return recordsRef.current.find((r) => r.id === recordId) ?? null;
      } finally {
        if (enrichRunRef.current === runId) {
          enrichActiveRecordIdRef.current = null;
          setLiveEnrich(null);
        }
      }
    },
    [applyEnrichedTrack]
  );

  const removeRecord = useCallback(
    (id: string): boolean => {
      if (readOnly) return false;
      setRecords((prev) => prev.filter((record) => record.id !== id));
      if (isPersistedRecordId(id)) {
        void deleteRecordFromSupabase(id);
      }
      return true;
    },
    [readOnly]
  );

  const clearCollection = useCallback((mode: ClearCollectionMode) => {
    if (readOnly) return 0;
    let removed = 0;
    let removedIds: string[] = [];

    setRecords((prev) => {
      removed = countRecordsForClearMode(prev, mode);
      const next = recordsAfterClear(prev, mode);
      const nextIds = new Set(next.map((record) => record.id));
      removedIds = prev
        .filter((record) => !nextIds.has(record.id))
        .map((record) => record.id);
      return next;
    });

    for (const id of removedIds) {
      if (isPersistedRecordId(id)) void deleteRecordFromSupabase(id);
    }

    return removed;
  }, [readOnly]);

  const markPlayed = useCallback(
    (id: string) => {
      updateRecord(id, { lastPlayedAt: new Date().toISOString() });
    },
    [updateRecord]
  );

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const isRefreshingRef = useRef(false);

  const refreshRecords = useCallback(async () => {
    if (bulkEnrichmentActiveRef.current) return;
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    try {
      const result = await fetchRecords(
        collectionId
          ? {
              collectionId,
              personalCollectionId: personalCollectionId ?? undefined,
              summaryOnly,
            }
          : { summaryOnly }
      );
      if (result.error) {
        if (result.error.message === 'Fetch cancelled') return;
        setCollectionError(friendlyCollectionError(result.error.message));
        return;
      }
      const remote = (result.data ?? []).map((record) => migrateRecord(record));
      setRecords((prev) => {
        const merged = mergePreservingTrackEnrichment(prev, remote);
        recordsRef.current = merged;
        return merged;
      });
      setCollectionError(null);
      setHydrated(true);
    } finally {
      isRefreshingRef.current = false;
    }
  }, [collectionId, personalCollectionId, summaryOnly]);

  useEffect(() => {
    if (!hydrated || !user || suspended) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSyncAt = 0;
    const MIN_SYNC_INTERVAL_MS = 15_000;

    const syncFromServer = () => {
      if (bulkEnrichmentActiveRef.current) return;
      if (isScannerSessionActive()) return;
      if (enrichActiveRecordIdRef.current) return;
      if (metadataEnrichment.phase === 'running') return;
      if (tracklistEnrichment.phase === 'running') return;
      if (isRefreshingRef.current) return;
      if (Date.now() - lastSyncAt < MIN_SYNC_INTERVAL_MS) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        lastSyncAt = Date.now();
        void refreshRecords();
      }, 1200);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') syncFromServer();
    };

    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [hydrated, user?.id, metadataEnrichment.phase, tracklistEnrichment.phase, refreshRecords, suspended]);

  const retryCollectionLoad = useCallback(() => {
    void loadCollection();
  }, [loadCollection]);

  const runFullTracklistEnrichmentJob = useCallback(async (): Promise<FullTracklistEnrichmentResult | null> => {
    const ownsBulkLock = !bulkEnrichmentActiveRef.current;
    if (ownsBulkLock) bulkEnrichmentActiveRef.current = true;
    const runId = ++tracklistEnrichmentRunRef.current;
    const linked = recordsRef.current.filter((r) => r.discogsId != null).length;
    const useAutoBatches = linked > TRACKLIST_ENRICH_LARGE_THRESHOLD;

    try {
    const callbacks = {
      onRecordsChange: (next: VinylRecord[]) => {
        if (tracklistEnrichmentRunRef.current !== runId) return;
        setRecords((prev) => {
          const merged = mergePreservingTrackEnrichment(prev, next);
          recordsRef.current = merged;
          return merged;
        });
      },
      onProgress: (progress: FullTracklistEnrichmentProgress) => {
        if (tracklistEnrichmentRunRef.current !== runId) return;
        setTracklistEnrichment(progress);
      },
      onPersist: (record: VinylRecord) => {
        persistRecordNow(record);
      },
      isCancelled: () => tracklistEnrichmentRunRef.current !== runId,
    };

    const aggregate: FullTracklistEnrichmentResult = {
      total: linked,
      processed: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    };

    while (tracklistEnrichmentRunRef.current === runId) {
      const result = await runFullTracklistEnrichment(recordsRef.current, callbacks, {
        maxPerRun: useAutoBatches ? TRACKLIST_ENRICH_BATCH_SIZE : undefined,
        incompleteOnly: useAutoBatches,
        progressOffset: aggregate.processed,
        progressTotal: linked,
      });

      if (!result || tracklistEnrichmentRunRef.current !== runId) return null;

      aggregate.processed += result.processed;
      aggregate.updated += result.updated;
      aggregate.skipped += result.skipped;
      aggregate.failed += result.failed;

      if (!useAutoBatches || result.processed === 0) break;

      const remaining = countIncompleteTracklistTargets(recordsRef.current);
      if (remaining === 0) break;

      setTracklistEnrichment({
        phase: 'running',
        message: `Batch complete — ${remaining} releases left. Continuing…`,
        completed: aggregate.processed,
        total: linked,
        updated: aggregate.updated,
        skipped: aggregate.skipped,
        failed: aggregate.failed,
      });
      await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));
    }

    if (tracklistEnrichmentRunRef.current === runId) {
      setTracklistEnrichment({
        phase: 'done',
        message: formatEnrichmentSummary(aggregate),
        completed: aggregate.processed,
        total: linked,
        updated: aggregate.updated,
        skipped: aggregate.skipped,
        failed: aggregate.failed,
      });
      window.setTimeout(() => {
        if (tracklistEnrichmentRunRef.current === runId) {
          setTracklistEnrichment(idleTracklistEnrichment);
        }
      }, 4000);
    }

    return tracklistEnrichmentRunRef.current === runId ? aggregate : null;
    } finally {
      if (ownsBulkLock) bulkEnrichmentActiveRef.current = false;
    }
  }, [persistRecordNow]);

  const runFullMetadataEnrichmentJob = useCallback(async (
    options: FullMetadataEnrichmentOptions = {}
  ): Promise<FullMetadataEnrichmentResult | null> => {
    const runId = ++metadataEnrichmentRunRef.current;

    const result = await runFullMetadataEnrichment(recordsRef.current, {
      onRecordsChange: (next) => {
        if (metadataEnrichmentRunRef.current !== runId) return;
        const migrated = next.map((r) => migrateRecord(r));
        flushSync(() => {
          recordsRef.current = migrated;
          setRecords(migrated);
        });
      },
      onProgress: (progress) => {
        if (metadataEnrichmentRunRef.current !== runId) return;
        setMetadataEnrichment(progress);
      },
      onPersist: (record) => {
        persistRecordNow(record);
      },
      isCancelled: () => metadataEnrichmentRunRef.current !== runId,
      getRecord: (id) => recordsRef.current.find((r) => r.id === id),
    }, options);

    if (metadataEnrichmentRunRef.current === runId) {
      window.setTimeout(() => {
        if (metadataEnrichmentRunRef.current === runId) {
          setMetadataEnrichment(idleMetadataEnrichment);
        }
      }, 4000);
    }

    return metadataEnrichmentRunRef.current === runId ? result : null;
  }, [persistRecordNow]);

  const cancelMetadataEnrichmentJob = useCallback(() => {
    metadataEnrichmentRunRef.current += 1;
    setMetadataEnrichment(idleMetadataEnrichment);
  }, []);

  const runCharacterBlurbRefreshJob = useCallback(async (
    options: CharacterBlurbRefreshOptions = {}
  ): Promise<CharacterBlurbRefreshResult | null> => {
    const runId = ++characterBlurbRunRef.current;

    const result = await runCharacterBlurbRefresh(recordsRef.current, {
      onRecordsChange: (next) => {
        if (characterBlurbRunRef.current !== runId) return;
        const migrated = next.map((r) => migrateRecord(r));
        flushSync(() => {
          recordsRef.current = migrated;
          setRecords(migrated);
        });
      },
      onProgress: (progress) => {
        if (characterBlurbRunRef.current !== runId) return;
        setCharacterBlurbRefresh(progress);
      },
      onPersist: (record) => {
        persistRecordNow(record);
      },
      isCancelled: () => characterBlurbRunRef.current !== runId,
      getRecord: (id) => recordsRef.current.find((r) => r.id === id),
    }, options);

    if (characterBlurbRunRef.current === runId) {
      window.setTimeout(() => {
        if (characterBlurbRunRef.current === runId) {
          setCharacterBlurbRefresh(idleCharacterBlurbRefresh);
        }
      }, 4000);
    }

    return characterBlurbRunRef.current === runId ? result : null;
  }, [persistRecordNow]);

  const cancelCharacterBlurbRefreshJob = useCallback(() => {
    characterBlurbRunRef.current += 1;
    setCharacterBlurbRefresh(idleCharacterBlurbRefresh);
  }, []);

  const runCrossCrateTransferFromPersonal = useCallback(
    async (personalRecords: VinylRecord[]): Promise<CrossCrateTransferStats> => {
      const { records: next, stats, changedRecords } = applyCrossCrateTransferToCollection(
        recordsRef.current,
        personalRecords,
        generateId
      );

      setRecords(next);
      recordsRef.current = next;

      const targetCollectionId = collectionId ?? undefined;
      for (let i = 0; i < changedRecords.length; i += 12) {
        const chunk = changedRecords.slice(i, i + 12);
        await Promise.all(
          chunk.map((record) =>
            updateRecordInSupabase(record, {
              collectionId: record.collectionId ?? targetCollectionId,
            })
          )
        );
      }

      return stats;
    },
    [collectionId]
  );

  const runGuestSmartEnrichment = useCallback(
    async (personalRecords: VinylRecord[]): Promise<CrossCrateTransferStats> => {
      bulkEnrichmentActiveRef.current = true;
      try {
        const transferStats = await runCrossCrateTransferFromPersonal(personalRecords);
        await runFullTracklistEnrichmentJob();
        await runFullMetadataEnrichmentJob();
        return transferStats;
      } finally {
        bulkEnrichmentActiveRef.current = false;
      }
    },
    [
      runCrossCrateTransferFromPersonal,
      runFullTracklistEnrichmentJob,
      runFullMetadataEnrichmentJob,
    ]
  );

  const collectionLoading = Boolean(user) && !authLoading && isFetchingCollection;
  const isFullTracklistEnrichmentRunning = tracklistEnrichment.phase === 'running';
  const isFullMetadataEnrichmentRunning = metadataEnrichment.phase === 'running';
  const isCharacterBlurbRefreshRunning = characterBlurbRefresh.phase === 'running';

  return {
    records,
    settings,
    hydrated,
    collectionLoading,
    collectionError,
    collectionHydrated: hydrated,
    retryCollectionLoad,
    backgroundSync,
    tracklistEnrichment,
    metadataEnrichment,
    characterBlurbRefresh,
    isFullTracklistEnrichmentRunning,
    isFullMetadataEnrichmentRunning,
    isCharacterBlurbRefreshRunning,
    runFullTracklistEnrichmentJob,
    runFullMetadataEnrichmentJob,
    runCharacterBlurbRefreshJob,
    runGuestSmartEnrichment,
    runCrossCrateTransferFromPersonal,
    cancelMetadataEnrichmentJob,
    cancelCharacterBlurbRefreshJob,
    liveEnrich,
    addRecord,
    importDiscogsCollection,
    updateRecord,
    enrichReleaseInCollection,
    removeRecord,
    clearCollection,
    markPlayed,
    updateSettings,
    refreshRecords,
    readOnly,
    collectionId,
  };
}