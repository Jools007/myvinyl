import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import { DEMO_RECORDS } from '../lib/seed';
import { isCdFormat, sanitizeVinylFormat } from '../lib/formats';
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

export function useCollection() {
  const { user, loading: authLoading } = useAuth();
  const [records, setRecords] = useState<VinylRecord[]>([]);
  const recordsRef = useRef(records);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [hydrated, setHydrated] = useState(false);
  const [isFetchingCollection, setIsFetchingCollection] = useState(false);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const fetchGenerationRef = useRef(0);
  const [backgroundSync, setBackgroundSync] = useState<BackgroundSyncState>(idleSync);
  const [liveEnrich, setLiveEnrich] = useState<LiveEnrichState>(null);
  const backgroundStarted = useRef(false);
  const enrichRunRef = useRef(0);
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

    const result = await fetchRecords();
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
  }, [user?.id]);

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

  const persistRecordNow = useCallback((record: VinylRecord) => {
    if (!isPersistedRecordId(record.id)) return;
    void updateRecordInSupabase(record);
  }, []);

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
      void addRecordToSupabase(entry).then((result) => {
        if (result.data) replaceSavedRecord(entry.id, result.data);
      });
    },
    [replaceSavedRecord]
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
    if (!settings.onboardingComplete || !hydrated) return;
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
  }, [settings.onboardingComplete, hydrated, schedulePersistRecord]);

  const loadDemo = useCallback(() => {
    const entries = DEMO_RECORDS.map((record) => ({ ...record, id: generateId() }));
    setRecords(entries);
    for (const entry of entries) {
      persistNewRecord(migrateRecord(entry));
    }
  }, [persistNewRecord]);

  const addRecord = useCallback(
    (record: Omit<VinylRecord, 'id' | 'addedAt'>) => {
      if (isCdFormat(record.format)) return null;
      const entry = migrateRecord({
        ...record,
        format: sanitizeVinylFormat(record.format),
        addSource: record.addSource ?? 'manual',
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
    [persistNewRecord]
  );

  const importDiscogsCollection = useCallback(
    (incoming: Omit<VinylRecord, 'id' | 'addedAt'>[]) => {
      let summary = { added: 0, skipped: 0 };
      let addedEntries: VinylRecord[] = [];

      setRecords((prev) => {
        const next = bulkImportCollectionRecords(prev, incoming, generateId);
        summary = { added: next.added, skipped: next.skipped };
        addedEntries = next.records.slice(0, next.added);
        return next.records;
      });

      for (const entry of addedEntries) {
        persistNewRecord(entry);
      }

      return summary;
    },
    [persistNewRecord]
  );

  const updateRecord = useCallback(
    (id: string, patch: Partial<VinylRecord> | ((record: VinylRecord) => Partial<VinylRecord>)) => {
      setRecords((prev) =>
        prev.map((record) => {
          if (record.id !== id) return record;
          const nextPatch = typeof patch === 'function' ? patch(record) : patch;
          const updated = migrateRecord({ ...record, ...nextPatch });
          schedulePersistRecord(updated.id);
          return updated;
        })
      );
    },
    [schedulePersistRecord]
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

  const removeRecord = useCallback((id: string) => {
    setRecords((prev) => prev.filter((record) => record.id !== id));
    if (isPersistedRecordId(id)) {
      void deleteRecordFromSupabase(id);
    }
  }, []);

  const clearCollection = useCallback((mode: ClearCollectionMode) => {
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
  }, []);

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

  const refreshRecords = useCallback(async () => {
    const result = await fetchRecords();
    if (result.error) {
      setCollectionError(friendlyCollectionError(result.error.message));
      return;
    }
    setRecords((result.data ?? []).map((record) => migrateRecord(record)));
    setCollectionError(null);
    setHydrated(true);
  }, []);

  const retryCollectionLoad = useCallback(() => {
    void loadCollection();
  }, [loadCollection]);

  const collectionLoading = Boolean(user) && !authLoading && isFetchingCollection;

  return {
    records,
    settings,
    hydrated,
    collectionLoading,
    collectionError,
    retryCollectionLoad,
    backgroundSync,
    liveEnrich,
    addRecord,
    importDiscogsCollection,
    updateRecord,
    enrichReleaseInCollection,
    removeRecord,
    clearCollection,
    markPlayed,
    updateSettings,
    loadDemo,
    refreshRecords,
  };
}