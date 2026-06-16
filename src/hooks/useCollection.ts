import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';

import { isCdFormat, sanitizeVinylFormat } from '../lib/formats';
import { isScannerSessionActive } from '../lib/scannerSession';
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
import {
  addRecord as addRecordToSupabase,
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
};

export function useCollection(scope?: UseCollectionScope) {
  const collectionId = scope?.collectionId ?? null;
  const personalCollectionId = scope?.personalCollectionId ?? null;
  const readOnly = scope?.readOnly ?? false;

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
  const [liveEnrich, setLiveEnrich] = useState<LiveEnrichState>(null);
  const backgroundStarted = useRef(false);
  const enrichRunRef = useRef(0);
  const tracklistEnrichmentRunRef = useRef(0);
  const metadataEnrichmentRunRef = useRef(0);
  const persistTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  /** While set, background migrations must not overwrite this release (live per-track enrich). */
  const enrichActiveRecordIdRef = useRef<string | null>(null);

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
        ? { collectionId, personalCollectionId: personalCollectionId ?? undefined }
        : undefined
    );
    if (generation !== fetchGenerationRef.current) return;

    if (result.error) {
      setCollectionError(friendlyCollectionError(result.error.message));
      setIsFetchingCollection(false);
      return;
    }

    setRecords((result.data ?? []).map((record) => migrateRecord(record)));
    setCollectionError(null);
    setHydrated(true);
    setIsFetchingCollection(false);
  }, [user?.id, collectionId, personalCollectionId]);

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

    void loadCollection();

    return () => {
      fetchGenerationRef.current += 1;
    };
  }, [user?.id, authLoading, loadCollection]);

  const persistRecordNow = useCallback(
    (record: VinylRecord) => {
      if (!isPersistedRecordId(record.id)) return;
      void updateRecordInSupabase(record);
    },
    []
  );

  const persistRecordImmediately = useCallback((record: VinylRecord) => {
    const pending = persistTimersRef.current.get(record.id);
    if (pending) {
      clearTimeout(pending);
      persistTimersRef.current.delete(record.id);
    }
    persistRecordNow(record);
  }, [persistRecordNow]);

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
    if (backgroundStarted.current || !needsBackgroundMigration()) return;
    backgroundStarted.current = true;

    let cancelled = false;
    const initial = recordsRef.current;

    void runBackgroundMigrations(initial, {
      onRecordsChange: (next) => {
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
          for (const record of next) {
            schedulePersistRecord(record.id);
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
  }, [hydrated, schedulePersistRecord]);

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
      const addedEntries = next.records.slice(0, next.added);

      for (const entry of addedEntries) {
        persistNewRecord({ ...entry, collectionId: targetCollectionId });
      }

      if (targetCollectionId === collectionId) {
        setRecords(next.records);
        recordsRef.current = next.records;
      }

      return {
        added: next.added,
        skipped: next.skipped + capped,
        capped,
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
    [persistRecordImmediately, schedulePersistRecord]
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
    (id: string) => {
      if (readOnly) return;
      setRecords((prev) => prev.filter((record) => record.id !== id));
      if (isPersistedRecordId(id)) {
        void deleteRecordFromSupabase(id);
      }
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
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    try {
      const result = await fetchRecords(
        collectionId
          ? { collectionId, personalCollectionId: personalCollectionId ?? undefined }
          : undefined
      );
      if (result.error) {
        setCollectionError(friendlyCollectionError(result.error.message));
        return;
      }
      const remote = (result.data ?? []).map((record) => migrateRecord(record));
      setRecords(remote);
      recordsRef.current = remote;
      setCollectionError(null);
      setHydrated(true);
    } finally {
      isRefreshingRef.current = false;
    }
  }, [collectionId, personalCollectionId]);

  useEffect(() => {
    if (!hydrated || !user) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSyncAt = 0;
    const MIN_SYNC_INTERVAL_MS = 15_000;

    const syncFromServer = () => {
      if (isScannerSessionActive()) return;
      if (enrichActiveRecordIdRef.current) return;
      if (metadataEnrichment.phase === 'running') return;
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
  }, [hydrated, user?.id, metadataEnrichment.phase, refreshRecords]);

  const retryCollectionLoad = useCallback(() => {
    void loadCollection();
  }, [loadCollection]);

  const runFullTracklistEnrichmentJob = useCallback(async (): Promise<FullTracklistEnrichmentResult | null> => {
    const runId = ++tracklistEnrichmentRunRef.current;

    const result = await runFullTracklistEnrichment(recordsRef.current, {
      onRecordsChange: (next) => {
        if (tracklistEnrichmentRunRef.current !== runId) return;
        setRecords((prev) => mergePreservingTrackEnrichment(prev, next));
      },
      onProgress: (progress) => {
        if (tracklistEnrichmentRunRef.current !== runId) return;
        setTracklistEnrichment(progress);
      },
      onPersist: (record) => {
        persistRecordNow(record);
      },
      isCancelled: () => tracklistEnrichmentRunRef.current !== runId,
    });

    if (tracklistEnrichmentRunRef.current === runId) {
      window.setTimeout(() => {
        if (tracklistEnrichmentRunRef.current === runId) {
          setTracklistEnrichment(idleTracklistEnrichment);
        }
      }, 4000);
    }

    return tracklistEnrichmentRunRef.current === runId ? result : null;
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

  const collectionLoading = Boolean(user) && !authLoading && isFetchingCollection;
  const isFullTracklistEnrichmentRunning = tracklistEnrichment.phase === 'running';
  const isFullMetadataEnrichmentRunning = metadataEnrichment.phase === 'running';

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
    isFullTracklistEnrichmentRunning,
    isFullMetadataEnrichmentRunning,
    runFullTracklistEnrichmentJob,
    runFullMetadataEnrichmentJob,
    cancelMetadataEnrichmentJob,
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