import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AppToaster } from './components/AppToaster';
import { Login } from './components/Auth/Login';
import { CollectionLoadError } from './components/CollectionLoadError';
import { CollectionLoading } from './components/CollectionLoading';
import { AddRecordModal } from './components/AddRecordModal';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import type { DiscogsSearchBarHandle } from './components/DiscogsSearchBar';
import {
  CollectionFilters,
  DEFAULT_COLLECTION_FILTERS,
  recordMatchesBpm,
  type CollectionFilterState,
} from './components/CollectionFilters';
import { CollectionListView } from './components/CollectionListView';
import { GridView } from './components/GridView';
import { LabelPrint } from './components/LabelPrint';
import { Navigation, type NavPage } from './components/Navigation';
import { PlayNextPanel } from './components/PlayNextPanel';
import { RecordDetailModal } from './components/RecordDetailModal';
import { ShelfView } from './components/ShelfView';
import { BackgroundSyncIndicator } from './components/BackgroundSyncIndicator';
import { CollectionHero } from './components/CollectionHero';
import { EmptyCollection } from './components/EmptyCollection';
import { ClearCollectionModal } from './components/ClearCollectionModal';
import { EnrichMetadataModal } from './components/EnrichMetadataModal';
import { EnrichTracklistsModal } from './components/EnrichTracklistsModal';
import { DiscogsImportModal } from './components/DiscogsImportModal';
import { DiscoverAddPanel } from './components/DiscoverAddPanel';
import { InsightsDashboard } from './components/InsightsDashboard';
import type { InsightFilterAction } from './lib/collectionInsights';
import {
  isSamePlaySelection,
  resolvePlayQueue,
  resolvePlaySelection,
  trackPositionLabel,
  type PlaySelection,
} from './lib/playSession';
import { getLastPlayed } from './lib/recommendations';
import { useAuth } from './contexts/AuthContext';
import { useCollection } from './hooks/useCollection';
import { useSessionCrate } from './hooks/useSessionCrate';
import { SESSION_CRATE_MAX } from './lib/sessionCrate';
import { normalizeGenre, normalizeVibe, parseFilterList } from './lib/filterLabels';
import { isCdFormat } from './lib/formats';
import { resolveTrackCamelot } from './lib/camelot';
import { formatMetadataEnrichmentSummary } from './lib/fullMetadataEnrichment';
import {
  countDiscogsLinkedRecords,
  formatEnrichmentSummary,
} from './lib/fullTracklistEnrichment';
import type { BackgroundSyncState } from './lib/recordMigration';
import { getPrimaryTrack, isReleaseFullyEnriched, patchPrimaryTrack, patchTrack } from './lib/tracks';
import type { DiscogsReleaseDetail } from './lib/api';
import {
  buildCollectionFilterNote,
  exportCollectionToPdf,
} from './lib/collectionPdfExport';
import { closeRecordDetail, setRecordDetailController } from './lib/recordDetail';
import type { DiscogsSearchHit, Track, VinylRecord } from './lib/types';

function recordHasGenre(record: VinylRecord, genre: string): boolean {
  return record.genres.some((g) => normalizeGenre(g) === genre);
}

function App() {
  const { user, loading: authLoading } = useAuth();
  const {
    records,
    settings,
    backgroundSync,
    tracklistEnrichment,
    metadataEnrichment,
    isFullTracklistEnrichmentRunning,
    isFullMetadataEnrichmentRunning,
    runFullTracklistEnrichmentJob,
    runFullMetadataEnrichmentJob,
    cancelMetadataEnrichmentJob,
    addRecord,
    importDiscogsCollection,
    clearCollection,
    updateRecord,
    enrichReleaseInCollection,
    liveEnrich,
    removeRecord,
    markPlayed,
    updateSettings,
    collectionLoading,
    collectionError,
    retryCollectionLoad,
  } = useCollection();

  const [page, setPage] = useState<NavPage>('collection');
  const discogsSearchRef = useRef<DiscogsSearchBarHandle>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanAddHit, setScanAddHit] = useState<DiscogsSearchHit | null>(null);
  const [scanAddRelease, setScanAddRelease] = useState<DiscogsReleaseDetail | null>(null);
  const [scanAddOpen, setScanAddOpen] = useState(false);
  const [detail, setDetail] = useState<VinylRecord | null>(null);
  const [detailEditOnOpen, setDetailEditOnOpen] = useState(false);
  const [detailSession, setDetailSession] = useState(0);
  const [labelSelection, setLabelSelection] = useState<Set<string>>(new Set());
  const [discogsImportOpen, setDiscogsImportOpen] = useState(false);
  const [clearCollectionOpen, setClearCollectionOpen] = useState(false);
  const [enrichTracklistsOpen, setEnrichTracklistsOpen] = useState(false);
  const [enrichMetadataOpen, setEnrichMetadataOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [collectionFilters, setCollectionFilters] = useState<CollectionFilterState>(
    DEFAULT_COLLECTION_FILTERS
  );
  const [nowPlaying, setNowPlaying] = useState<PlaySelection | null>(null);
  const [playQueue, setPlayQueue] = useState<PlaySelection[]>([]);
  const sessionCrate = useSessionCrate(records);

  useEffect(() => {
    if (!detail) return;
    const fresh = records.find((r) => r.id === detail.id);
    if (fresh && fresh !== detail) setDetail(fresh);
  }, [records, detail]);

  const playAnchor = useMemo(() => {
    const explicit = resolvePlaySelection(records, nowPlaying);
    if (explicit) return explicit;
    const recent = getLastPlayed(records);
    if (!recent) return null;
    const track = getPrimaryTrack(recent);
    if (!track) return null;
    return { record: recent, track };
  }, [records, nowPlaying]);

  const resolvedQueue = useMemo(
    () => resolvePlayQueue(records, playQueue),
    [records, playQueue]
  );

  const discogsIds = useMemo(
    () => records.map((r) => r.discogsId).filter((id): id is number => id != null),
    [records]
  );

  const discogsLinkedCount = useMemo(() => countDiscogsLinkedRecords(records), [records]);

  const activeBackgroundSync = useMemo((): BackgroundSyncState => {
    if (metadataEnrichment.phase === 'running') {
      return {
        phase: 'enriching',
        message: metadataEnrichment.currentRelease
          ? `${metadataEnrichment.message} · ${metadataEnrichment.currentRelease}`
          : metadataEnrichment.message,
        completed: metadataEnrichment.tracksCompleted,
        total: metadataEnrichment.tracksTotal,
      };
    }
    if (tracklistEnrichment.phase === 'running') {
      return {
        phase: 'full-tracklists',
        message: tracklistEnrichment.message,
        completed: tracklistEnrichment.completed,
        total: tracklistEnrichment.total,
      };
    }
    return backgroundSync;
  }, [tracklistEnrichment, metadataEnrichment, backgroundSync]);

  const handleEnrichAllTracklists = useCallback(() => {
    void runFullTracklistEnrichmentJob().then((result) => {
      if (!result) return;
      if (result.updated > 0) {
        toast.success(
          result.updated === 1 ? '1 release updated' : `${result.updated} releases updated`,
          { description: formatEnrichmentSummary(result) }
        );
      } else if (result.failed > 0 && result.updated === 0) {
        toast.error('Tracklist enrichment failed', {
          description: formatEnrichmentSummary(result),
        });
      } else {
        toast.message('Tracklists already complete', {
          description: formatEnrichmentSummary(result),
        });
      }
    });
  }, [runFullTracklistEnrichmentJob]);

  const handleEnrichAllMetadata = useCallback((options?: { force?: boolean }) => {
    void runFullMetadataEnrichmentJob(options).then((result) => {
      if (!result) return;
      if (result.cancelled) {
        toast.message('Enrichment cancelled', {
          description: formatMetadataEnrichmentSummary(result),
        });
        return;
      }
      if (result.tracksEnriched > 0 || result.updated > 0) {
        toast.success(
          result.tracksEnriched > 0
            ? result.tracksEnriched === 1
              ? '1 track enriched'
              : `${result.tracksEnriched} tracks enriched`
            : result.updated === 1
              ? '1 release enriched'
              : `${result.updated} releases enriched`,
          { description: formatMetadataEnrichmentSummary(result) }
        );
      } else if (result.failed > 0) {
        toast.error('Metadata enrichment failed', {
          description: formatMetadataEnrichmentSummary(result),
        });
      } else {
        toast.message('Metadata already complete', {
          description: formatMetadataEnrichmentSummary(result),
        });
      }
    });
  }, [runFullMetadataEnrichmentJob]);

  const handleCancelMetadataEnrichment = useCallback(() => {
    cancelMetadataEnrichmentJob();
    toast.message('Stopping enrichment…', {
      description: 'Already-enriched tracks are saved.',
    });
  }, [cancelMetadataEnrichmentJob]);

  const availableFormats = useMemo(
    () =>
      [...new Set(records.map((r) => r.format).filter((f): f is string => !!f && !isCdFormat(f)))],
    [records]
  );

  const availableVibes = useMemo(
    () => [
      ...new Set(
        records.flatMap((r) =>
          (getPrimaryTrack(r)?.vibeTags ?? []).flatMap((tag) => parseFilterList(tag))
        )
      ),
    ],
    [records]
  );

  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      r.genres.forEach((g) => {
        parseFilterList(g).forEach((genre) => set.add(genre));
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [records]);

  const filtered = useMemo(() => {
    const q = collectionFilters.query.toLowerCase().trim();
    return records.filter((r) => {
      if (q && !r.title.toLowerCase().includes(q) && !r.artist.toLowerCase().includes(q)) {
        return false;
      }
      if (collectionFilters.format && r.format !== collectionFilters.format) return false;
      if (collectionFilters.genre && !recordHasGenre(r, collectionFilters.genre)) {
        return false;
      }
      if (collectionFilters.condition && r.condition !== collectionFilters.condition) {
        return false;
      }
      if (collectionFilters.vibe) {
        const vibe = collectionFilters.vibe.toLowerCase();
        const track = getPrimaryTrack(r);
        const hasVibe =
          (track?.vibeTags ?? []).some((t) => normalizeVibe(t).toLowerCase() === vibe) ||
          r.genres.some((g) => normalizeGenre(g).toLowerCase() === vibe);
        if (!hasVibe) return false;
      }
      const primary = getPrimaryTrack(r);
      if (!recordMatchesBpm(primary?.bpm, collectionFilters.bpmRangeId)) return false;
      if (collectionFilters.camelotKey) {
        const key = collectionFilters.camelotKey;
        const hasKey = r.tracks.some((t) => resolveTrackCamelot(t).code === key);
        if (!hasKey) return false;
      }
      return true;
    });
  }, [records, collectionFilters]);

  const handleExportPdf = useCallback(async () => {
    if (filtered.length === 0) return;

    const bpmLabels: Record<string, string> = {
      slow: '< 100',
      mid: '100–120',
      dance: '120–130',
      fast: '130+',
    };

    setExportingPdf(true);
    const preparing = toast.loading('Preparing your catalog…', {
      description: 'Loading artwork and layout',
    });
    try {
      await exportCollectionToPdf({
        records: filtered,
        totalInCollection: records.length,
        collectionName: 'Jools Collection',
        curatorName: user?.email?.split('@')[0],
        filterNote: buildCollectionFilterNote(
          collectionFilters,
          collectionFilters.bpmRangeId !== 'all'
            ? bpmLabels[collectionFilters.bpmRangeId]
            : undefined
        ),
        onProgress: (message) => {
          toast.loading(message, { id: preparing });
        },
      });
      toast.dismiss(preparing);
      const scope =
        filtered.length === records.length
          ? `${filtered.length} release${filtered.length === 1 ? '' : 's'}`
          : `${filtered.length} of ${records.length} releases`;
      toast.success('Jools Collection PDF ready', {
        description: `Your catalog with ${scope} is downloaded.`,
      });
    } catch (err) {
      toast.dismiss(preparing);
      const message = err instanceof Error ? err.message : 'Something went wrong';
      toast.error('PDF export failed', { description: message });
    } finally {
      setExportingPdf(false);
    }
  }, [filtered, records.length, collectionFilters, user?.email]);

  const hadUserRef = useRef(false);
  useEffect(() => {
    if (user && !hadUserRef.current) {
      hadUserRef.current = true;
      setPage('collection');
      if (!settings.onboardingComplete) {
        updateSettings({ onboardingComplete: true });
      }
    }
    if (!user) {
      hadUserRef.current = false;
    }
  }, [user, settings.onboardingComplete, updateSettings]);

  const handlePlayNow = useCallback(
    (record: VinylRecord, track: Track) => {
      const ref: PlaySelection = { recordId: record.id, trackId: track.id };
      setNowPlaying(ref);
      markPlayed(record.id);
      setPlayQueue((q) => q.filter((item) => !isSamePlaySelection(item, ref)));
      setPage('play');
      const idx = record.tracks.findIndex((t) => t.id === track.id);
      toast.success(`Now playing: ${track.title}`, {
        description: `${trackPositionLabel(track, idx >= 0 ? idx : 0)} · ${record.artist}`,
      });
    },
    [markPlayed]
  );

  const handleApplyInsightFilter = useCallback((patch: InsightFilterAction) => {
    setCollectionFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleQueueMany = useCallback(
    (items: { record: VinylRecord; track: Track }[], label?: string) => {
      if (items.length === 0) return;
      let added = 0;
      setPlayQueue((q) => {
        const next = [...q];
        for (const { record, track } of items) {
          const ref: PlaySelection = { recordId: record.id, trackId: track.id };
          if (nowPlaying && isSamePlaySelection(nowPlaying, ref)) continue;
          if (next.some((item) => isSamePlaySelection(item, ref))) continue;
          next.push(ref);
          added += 1;
        }
        return next;
      });
      if (added > 0) {
        toast.success(label ?? `${added} tracks queued`, {
          description: 'Open Play to start your set.',
        });
      }
    },
    [nowPlaying]
  );

  const handleAddToQueue = useCallback(
    (record: VinylRecord, track: Track) => {
      const ref: PlaySelection = { recordId: record.id, trackId: track.id };
      if (nowPlaying && isSamePlaySelection(nowPlaying, ref)) {
        toast.message('Already playing', { description: track.title });
        return;
      }
      let added = false;
      setPlayQueue((q) => {
        if (q.some((item) => isSamePlaySelection(item, ref))) return q;
        added = true;
        return [...q, ref];
      });
      if (added) {
        toast.success('Added to queue', {
          description: `${track.title} · ${record.artist}`,
        });
      } else {
        toast.message('Already in queue', { description: track.title });
      }
    },
    [nowPlaying]
  );

  const handleAddToCrate = useCallback(
    (record: VinylRecord, track: Track) => {
      if (sessionCrate.isInCrate(record.id, track.id)) {
        toast.message('Already in crate', { description: track.title });
        return;
      }
      if (sessionCrate.isFull) {
        toast.error('Crate is full', {
          description: `Tonight's crate holds up to ${SESSION_CRATE_MAX} tracks.`,
        });
        return;
      }
      if (sessionCrate.add(record, track)) {
        toast.success('Added to tonight\'s crate', {
          description: `${track.title} · ${record.artist}`,
        });
      }
    },
    [sessionCrate]
  );

  const handleAddManyToCrate = useCallback(
    (items: { record: VinylRecord; track: Track }[], label?: string) => {
      if (items.length === 0) return;
      const added = sessionCrate.addMany(items);
      if (added > 0) {
        toast.success(label ?? `Added ${added} to tonight's crate`, {
          description:
            added < items.length
              ? `Crate full — ${items.length - added} skipped`
              : 'Open Play to review your set.',
        });
      } else if (sessionCrate.isFull) {
        toast.error('Crate is full', {
          description: `Tonight's crate holds up to ${SESSION_CRATE_MAX} tracks.`,
        });
      } else {
        toast.message('Already in crate', {
          description: 'Those tracks are already in tonight\'s crate.',
        });
      }
    },
    [sessionCrate]
  );

  const handleLoadCrateToQueue = useCallback(() => {
    const items = sessionCrate.resolved;
    if (items.length === 0) return;

    const refs = items.map((item) => ({
      recordId: item.record.id,
      trackId: item.track.id,
    }));
    const [, ...rest] = refs;
    setPlayQueue(rest);
    const opener = items[0];
    handlePlayNow(opener.record, opener.track);
    toast.success('Crate loaded', {
      description: `${items.length} track${items.length === 1 ? '' : 's'} ready to spin.`,
    });
  }, [sessionCrate.resolved, handlePlayNow]);

  const handleCloseRecordDetail = useCallback(() => {
    setDetail(null);
    setDetailEditOnOpen(false);
  }, []);

  useEffect(() => {
    setRecordDetailController({
      open: (record, initialEditing = false) => {
        setScanAddOpen(false);
        setScanAddHit(null);
        setScanAddRelease(null);
        setDetailSession((n) => n + 1);
        setDetailEditOnOpen(initialEditing);
        setDetail(record);
      },
      close: handleCloseRecordDetail,
    });
    return () => setRecordDetailController(null);
  }, [handleCloseRecordDetail]);

  const handleEnrichRelease = async (recordId: string) => {
    const before = records.find((r) => r.id === recordId);
    if (!before) return;

    try {
      const updated = await enrichReleaseInCollection(recordId, { force: true });
      if (!updated) return;

      const wasComplete = isReleaseFullyEnriched(before);
      const nowComplete = isReleaseFullyEnriched(updated);
      const usesEstimates = updated.tracks.some(
        (track) => track.bpmEstimated || track.keyEstimated
      );
      const label = nowComplete
        ? wasComplete
          ? 'Tracks re-enriched'
          : 'Release enriched'
        : 'Enrichment finished';
      toast.success(label, {
        description: usesEstimates
          ? `${updated.artist} — ${updated.title} (genre-based estimates on live site)`
          : `${updated.artist} — ${updated.title}`,
      });
    } catch (e) {
      toast.error('Enrichment failed', {
        description: e instanceof Error ? e.message : 'Could not enrich this release',
      });
    }
  };

  const enqueueReleaseEnrichment = useCallback(
    (added: VinylRecord) => {
      if (isReleaseFullyEnriched(added)) return;
      void enrichReleaseInCollection(added.id).catch(() => {
        toast.message('Enrichment will continue in the background');
      });
    },
    [enrichReleaseInCollection]
  );

  const handleAddRecord = useCallback(() => {
    setPage('collection');

    const activateHeroDiscogsSearch = () => {
      document.getElementById('collection-hero')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      window.setTimeout(() => discogsSearchRef.current?.focus(), 400);
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(activateHeroDiscogsSearch);
    });
  }, []);

  const toggleLabel = (id: string) => {
    setLabelSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (authLoading) {
    return (
      <>
        <div className="flex min-h-dvh items-center justify-center bg-[var(--bg)] p-4">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" aria-label="Loading" />
        </div>
        <AppToaster />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Login />
        <AppToaster />
      </>
    );
  }

  if (collectionError && !collectionLoading) {
    return (
      <>
        <CollectionLoadError
          message={collectionError}
          onRetry={retryCollectionLoad}
        />
        <AppToaster />
      </>
    );
  }

  if (collectionLoading) {
    return (
      <>
        <CollectionLoading />
        <AppToaster />
      </>
    );
  }

  return (
    <div className="app-shell--mobile-tabs min-h-dvh">
      <a href="#collection-main" className="skip-to-content">
        Skip to collection
      </a>
      <BackgroundSyncIndicator
        status={activeBackgroundSync}
        onCancel={isFullMetadataEnrichmentRunning ? handleCancelMetadataEnrichment : undefined}
      />
      <Navigation
        page={page}
        onNavigate={setPage}
        recordCount={records.length}
        onScan={() => setScanOpen(true)}
        onAddRecord={handleAddRecord}
      />

      <main
        className={`app-main mx-auto max-w-7xl px-3 sm:px-6 ${
          page === 'collection'
            ? 'app-main--collection pb-8 pt-0 sm:pt-4'
            : page === 'labels'
              ? 'app-main--labels pb-0 pt-3 sm:py-8'
              : page === 'insights'
                ? 'app-main--insights pb-10 pt-2 sm:pt-4 sm:pb-12'
                : 'app-main--play py-8'
        }`}
      >
        <AnimatePresence mode="wait">
          {page === 'collection' && (
            <motion.div
              key="collection"
              initial={false}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="collection-page"
            >
              <CollectionHero
                recordCount={records.length}
                collectionDiscogsIds={discogsIds}
                searchRef={discogsSearchRef}
                onDiscogsImport={() => setDiscogsImportOpen(true)}
                onAdd={(r) => {
                  const added = addRecord(r);
                  if (!added) return;
                  toast.success('Added to your crate', {
                    description: `${r.artist} — ${r.title}`,
                  });
                  enqueueReleaseEnrichment(added);
                }}
              />

              <section id="collection-main" className="collection-main">
                <CollectionFilters
                  filters={collectionFilters}
                  onChange={(patch) =>
                    setCollectionFilters((prev) => ({ ...prev, ...patch }))
                  }
                  onClear={() => setCollectionFilters(DEFAULT_COLLECTION_FILTERS)}
                  resultCount={filtered.length}
                  totalCount={records.length}
                  viewMode={settings.viewMode}
                  onViewModeChange={(mode) => updateSettings({ viewMode: mode })}
                  availableFormats={availableFormats}
                  availableGenres={availableGenres}
                  availableVibes={availableVibes}
                  onResetCollection={() => setClearCollectionOpen(true)}
                  onEnrichTracklists={() => setEnrichTracklistsOpen(true)}
                  enrichingTracklists={isFullTracklistEnrichmentRunning}
                  onEnrichMetadata={() => setEnrichMetadataOpen(true)}
                  enrichingMetadata={isFullMetadataEnrichmentRunning}
                  discogsLinkedCount={discogsLinkedCount}
                  onExportPdf={() => void handleExportPdf()}
                  exportingPdf={exportingPdf}
                  onOpenInsights={() => setPage('insights')}
                />

                {records.length === 0 ? (
                  <EmptyCollection onAddRecord={handleAddRecord} />
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--border)] py-16">
                    <p className="text-[var(--text-secondary)]">No records match your filters.</p>
                    <button
                      type="button"
                      onClick={() => setCollectionFilters(DEFAULT_COLLECTION_FILTERS)}
                      className="btn-ghost mt-3 text-xs"
                    >
                      Clear filters
                    </button>
                  </div>
                ) : settings.viewMode === 'shelf' ? (
                  <ShelfView records={filtered} />
                ) : settings.viewMode === 'list' ? (
                  <CollectionListView
                    records={filtered}
                    liveEnrich={liveEnrich}
                    onPlayNow={handlePlayNow}
                    onAddToQueue={handleAddToQueue}
                    onEnrichRelease={handleEnrichRelease}
                    onDelete={(id) => {
                      removeRecord(id);
                      if (detail?.id === id) closeRecordDetail();
                      toast.success('Removed from collection');
                    }}
                  />
                ) : (
                  <GridView
                    records={filtered}
                    onPlay={(record) => markPlayed(record.id)}
                  />
                )}
              </section>
            </motion.div>
          )}

          {page === 'insights' && (
            <motion.div
              key="insights"
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <InsightsDashboard
                records={records}
                onApplyFilter={handleApplyInsightFilter}
                onOpenCollection={() => setPage('collection')}
                onEnrichTracklists={() => setEnrichTracklistsOpen(true)}
                onEnrichMetadata={() => setEnrichMetadataOpen(true)}
                onPlayNow={handlePlayNow}
                onAddToQueue={handleAddToQueue}
                onQueueMany={handleQueueMany}
                onAddToCrate={handleAddToCrate}
                onAddManyToCrate={handleAddManyToCrate}
              />
            </motion.div>
          )}

          {page === 'play' && (
            <motion.div
              key="play"
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <PlayNextPanel
                collection={records}
                nowPlaying={playAnchor}
                queue={resolvedQueue}
                crateItems={sessionCrate.resolved}
                crateKeyPath={sessionCrate.keyPath}
                isInCrate={sessionCrate.isInCrate}
                onPlayNow={handlePlayNow}
                onAddToCrate={handleAddToCrate}
                onSaveTapBpm={(recordId, trackId, bpm) => {
                  updateRecord(recordId, (record) =>
                    patchTrack(record, trackId, { bpm, bpmEstimated: false })
                  );
                  toast.success('BPM saved', {
                    description: `${bpm} BPM — replaces estimate for this track`,
                  });
                }}
                onRemoveFromCrate={sessionCrate.remove}
                onMoveCrateUp={sessionCrate.moveUp}
                onMoveCrateDown={sessionCrate.moveDown}
                onClearCrate={sessionCrate.clear}
                onLoadCrateToQueue={handleLoadCrateToQueue}
              />
            </motion.div>
          )}

          {page === 'labels' && (
            <motion.div
              key="labels"
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <LabelPrint
                records={records}
                selectedIds={labelSelection}
                onToggle={toggleLabel}
                onSelectAll={() => setLabelSelection(new Set(records.map((r) => r.id)))}
                onClearSelection={() => setLabelSelection(new Set())}
                onSaveDescription={(id, notes) =>
                  updateRecord(id, { notes: notes || undefined })
                }
                onSaveVibes={(id, vibeTags) =>
                  updateRecord(id, (r) => patchPrimaryTrack(r, { vibeTags }))
                }
                onSaveLabelDisplay={(id, labelDisplay) =>
                  updateRecord(id, { labelDisplay })
                }
                onEnrichRelease={handleEnrichRelease}
                enrichingRecordId={liveEnrich?.recordId ?? null}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <BarcodeScannerModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onAddToCollection={(hit, release) => {
          setScanAddHit(hit);
          setScanAddRelease(release);
          setScanOpen(false);
          setScanAddOpen(true);
        }}
      />

      <DiscoverAddPanel
        hit={scanAddHit}
        prefetchedRelease={scanAddRelease}
        open={scanAddOpen}
        onClose={() => {
          setScanAddOpen(false);
          setScanAddHit(null);
          setScanAddRelease(null);
        }}
        onSave={(r) => {
          const added = addRecord(r);
          setScanAddOpen(false);
          setScanAddHit(null);
          setScanAddRelease(null);
          if (!added) return;
          toast.success('Added to your crate', {
            description: `${r.artist} — ${r.title}`,
          });
          enqueueReleaseEnrichment(added);
        }}
      />

      <AddRecordModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={(r) => {
          addRecord(r);
          toast.success('Added to collection');
        }}
      />

      <RecordDetailModal
        key={
          detail
            ? `${detail.id}-${detailEditOnOpen ? 'edit' : 'view'}-${detailSession}`
            : 'closed'
        }
        record={detail}
        initialEditing={detailEditOnOpen}
        onClose={handleCloseRecordDetail}
        onUpdate={(id, patch) => {
          updateRecord(id, patch);
          const label = detail;
          toast.success('Record updated', {
            description: label ? `${label.artist} — ${label.title}` : undefined,
          });
        }}
        onDelete={removeRecord}
        onPlay={markPlayed}
      />

      <EnrichTracklistsModal
        open={enrichTracklistsOpen}
        records={records}
        running={isFullTracklistEnrichmentRunning}
        onClose={() => setEnrichTracklistsOpen(false)}
        onConfirm={() => {
          setEnrichTracklistsOpen(false);
          handleEnrichAllTracklists();
        }}
      />

      <EnrichMetadataModal
        open={enrichMetadataOpen}
        records={records}
        running={isFullMetadataEnrichmentRunning}
        onClose={() => setEnrichMetadataOpen(false)}
        onConfirm={(options) => {
          setEnrichMetadataOpen(false);
          handleEnrichAllMetadata(options);
        }}
      />

      <ClearCollectionModal
        open={clearCollectionOpen}
        records={records}
        onClose={() => setClearCollectionOpen(false)}
        onConfirm={(mode) => {
          const removed = clearCollection(mode);
          closeRecordDetail();
          setPlayQueue([]);
          setNowPlaying(null);
          if (removed > 0) {
            toast.success(
              removed === 1 ? '1 record removed' : `${removed} records removed`,
              { description: 'Your collection has been updated.' }
            );
          } else {
            toast.message('Nothing to remove', {
              description: 'No records matched that option.',
            });
          }
        }}
      />

      <DiscogsImportModal
        open={discogsImportOpen}
        onClose={() => setDiscogsImportOpen(false)}
        existingDiscogsIds={discogsIds}
        onImport={(incoming) => {
          const { added, skipped } = importDiscogsCollection(incoming);
          if (added > 0) {
            toast.success(
              added === 1 ? '1 record imported' : `${added} records imported`,
              { description: skipped > 0 ? `${skipped} skipped (duplicate or CD)` : undefined }
            );
          } else {
            toast.message('Nothing new to import', {
              description: 'Your crate already has these releases, or they are CD-only.',
            });
          }
          return { added, skipped };
        }}
      />

      <AppToaster />
    </div>
  );
}

export default App;