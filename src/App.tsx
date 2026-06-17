import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AppToaster } from './components/AppToaster';
import { Login } from './components/Auth/Login';
import { CollectionLoadError } from './components/CollectionLoadError';
import { CollectionLoading } from './components/CollectionLoading';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { DiscogsSearchBar, type DiscogsSearchBarHandle } from './components/DiscogsSearchBar';
import {
  CollectionFilters,
  DEFAULT_COLLECTION_FILTERS,
  recordMatchesBpm,
  type CollectionFilterState,
} from './components/CollectionFilters';
import { CollectionListView } from './components/CollectionListView';
import { GridView } from './components/GridView';
import { LabelPrint } from './components/LabelPrint';
import { Navigation } from './components/Navigation';
import { PlayNextPanel } from './components/PlayNextPanel';
import { RecordDetailModal } from './components/RecordDetailModal';
import { ShelfView } from './components/ShelfView';
import { BackgroundSyncIndicator } from './components/BackgroundSyncIndicator';
import { CollectionHero } from './components/CollectionHero';
import { EmptyCollection } from './components/EmptyCollection';
import { ClearCollectionModal } from './components/ClearCollectionModal';
import { EnrichGuestCrateModal } from './components/EnrichGuestCrateModal';
import { EnrichMetadataModal } from './components/EnrichMetadataModal';
import { EnrichTracklistsModal } from './components/EnrichTracklistsModal';
import { GuestCrateBanner } from './components/crates/GuestCrateBanner';
import { ImportCrateModal } from './components/crates/ImportCrateModal';
import { RemoveGuestCrateModal } from './components/crates/RemoveGuestCrateModal';
import { DiscogsImportModal } from './components/DiscogsImportModal';
import { DiscoverAddPanel } from './components/DiscoverAddPanel';
import { InsightsDashboard } from './components/InsightsDashboard';
import type { InsightFilterAction } from './lib/collectionInsights';
import {
  isSamePlaySelection,
  playSelectionKey,
  resolvePlayQueue,
  resolvePlaySelection,
  trackPositionLabel,
  type PlaySelection,
} from './lib/playSession';
import {
  buildAppHref,
  currentAppHref,
  locationForPage,
  pageDocumentTitle,
  playDocumentTitle,
} from './lib/appRoute';
import {
  clearNowPlayingStorage,
  clearPlayQueueStorage,
  loadNowPlaying,
  loadPlayQueue,
  saveNowPlaying,
  savePlayQueue,
} from './lib/playQueueStorage';
import { useAppRouter } from './hooks/useAppRouter';
import { getLastPlayed } from './lib/recommendations';
import { useAuth } from './contexts/AuthContext';
import { useCollection } from './hooks/useCollection';
import { useCollections } from './hooks/useCollections';
import {
  GUEST_CRATE_MAX_RECORDS,
  GUEST_SUMMARY_FETCH_THRESHOLD,
  isPersonalCrate,
} from './lib/collectionContext';
import { loadActiveCrateSlug, saveActiveCrateSlug } from './lib/crateStorage';
import { TRACKLIST_ENRICH_LARGE_THRESHOLD } from './lib/fullTracklistEnrichment';
import {
  dismissGuestCrateBanner,
  isGuestCrateBannerDismissed,
} from './lib/guestCrateBannerStorage';
import {
  isGuestCrateEnrichmentComplete,
  isGuestCrateTracklistsComplete,
  markGuestCrateEnrichmentComplete,
  markGuestCrateTracklistsComplete,
} from './lib/guestEnrichmentStorage';
import {
  fetchDiscogsIdsForCollection,
  fetchRecords,
  probeGuestTracklistsPersisted,
} from './lib/records';
import { clampLabelDescription } from './lib/labelContent';
import { migrateRecord } from './lib/tracks';

import { normalizeGenre, normalizeVibe, parseFilterList } from './lib/filterLabels';
import { collectGroupedGenreOptions, recordMatchesGroupedGenre } from './lib/genreGroups';
import { isCdFormat } from './lib/formats';
import { resolveTrackCamelot } from './lib/camelot';
import { CUT_RATING_LABELS, recordMatchesCutRatingFilter } from './lib/cutRating';
import { formatMetadataEnrichmentSummary } from './lib/fullMetadataEnrichment';
import {
  countDiscogsLinkedRecords,
  formatEnrichmentSummary,
} from './lib/fullTracklistEnrichment';
import type { BackgroundSyncState } from './lib/recordMigration';
import { getPrimaryTrack, isReleaseFullyEnriched, patchPrimaryTrack, patchTrack } from './lib/tracks';
import type { CutRating } from './lib/types';
import type { DiscogsReleaseDetail } from './lib/api';

import { closeRecordDetail, setRecordDetailController } from './lib/recordDetail';
import type { DiscoverAddPayload } from './lib/discoverAdd';
import type { DiscogsSearchHit, Track, VinylRecord } from './lib/types';

function collectionDisplayName(email?: string | null): string {
  if (!email) return 'My Vinyl Collection';
  const handle = email.split('@')[0]?.trim();
  if (!handle) return 'My Vinyl Collection';
  const titled = handle.charAt(0).toUpperCase() + handle.slice(1);
  return `${titled}'s Collection`;
}

function App() {
  const { user, loading: authLoading } = useAuth();
  const crates = useCollections();
  const [guestEnrichmentRevision, setGuestEnrichmentRevision] = useState(0);
  const [guestTracklistsProbeRevision, setGuestTracklistsProbeRevision] = useState(0);
  const collectionScope = useMemo(() => {
    const cratesPending = crates.loading || (crates.available && !crates.activeCrate);
    if (cratesPending) {
      return { suspended: true as const };
    }
    if (crates.available && crates.activeCrate) {
      const guestSummaryOnly =
        crates.isGuestView &&
        (crates.activeCrate.recordCount ?? 0) > GUEST_SUMMARY_FETCH_THRESHOLD &&
        !isGuestCrateTracklistsComplete(crates.activeCrate.id) &&
        !isGuestCrateEnrichmentComplete(crates.activeCrate.id);
      return {
        collectionId: crates.activeCrate.id,
        personalCollectionId: crates.personalCrate?.id ?? null,
        readOnly: crates.isGuestView,
        summaryOnly: guestSummaryOnly,
        suspended: false as const,
      };
    }
    return undefined;
  }, [
    crates.available,
    crates.activeCrate,
    crates.loading,
    crates.personalCrate?.id,
    crates.isGuestView,
    guestEnrichmentRevision,
    guestTracklistsProbeRevision,
  ]);

  const crateSlugKey = useMemo(
    () => crates.crates.map((crate) => crate.slug).join('|'),
    [crates.crates]
  );

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
    runCrossCrateTransferFromPersonal,
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
    collectionHydrated,
    retryCollectionLoad,
  } = useCollection(collectionScope);

  const router = useAppRouter();
  const page = router.location.page;
  const discogsSearchRef = useRef<DiscogsSearchBarHandle>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanAddHit, setScanAddHit] = useState<DiscogsSearchHit | null>(null);
  const [scanAddRelease, setScanAddRelease] = useState<DiscogsReleaseDetail | null>(null);
  const [scanAddOpen, setScanAddOpen] = useState(false);
  const [detail, setDetail] = useState<VinylRecord | null>(null);
  const [detailEditOnOpen, setDetailEditOnOpen] = useState(false);
  const [detailSession, setDetailSession] = useState(0);
  const [labelSelection, setLabelSelection] = useState<Set<string>>(new Set());
  const [discogsImportOpen, setDiscogsImportOpen] = useState(false);
  const [removeGuestCrateOpen, setRemoveGuestCrateOpen] = useState(false);
  const [guestBannerDismissed, setGuestBannerDismissed] = useState(false);
  const [personalDiscogsIds, setPersonalDiscogsIds] = useState<number[]>([]);
  const [clearCollectionOpen, setClearCollectionOpen] = useState(false);
  const [enrichTracklistsOpen, setEnrichTracklistsOpen] = useState(false);
  const [enrichMetadataOpen, setEnrichMetadataOpen] = useState(false);
  const [enrichGuestOpen, setEnrichGuestOpen] = useState(false);
  const [personalRecordsForEnrich, setPersonalRecordsForEnrich] = useState<VinylRecord[]>([]);
  const [personalRecordsForEnrichLoading, setPersonalRecordsForEnrichLoading] = useState(false);
  const [guestSmartEnrichRunning, setGuestSmartEnrichRunning] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [collectionFilters, setCollectionFilters] = useState<CollectionFilterState>(
    DEFAULT_COLLECTION_FILTERS
  );
  const [nowPlaying, setNowPlaying] = useState<PlaySelection | null>(null);
  const [playQueue, setPlayQueue] = useState<PlaySelection[]>([]);
  const playHydratedRef = useRef<string | null>(null);
  const queueHydratedRef = useRef(false);
  const playCrateIdRef = useRef<string | null>(null);
  const releaseRouteRef = useRef<string | null>(null);
  const activeCollectionId = crates.activeCrate?.id ?? null;

  useEffect(() => {
    if (!detail) return;
    const fresh = records.find((r) => r.id === detail.id);
    if (fresh && fresh !== detail) setDetail(fresh);
  }, [records, detail]);

  const playAnchor = useMemo(() => {
    const explicit = resolvePlaySelection(records, nowPlaying);
    if (explicit) return explicit;

    if (router.location.page === 'play') {
      const routed = resolvePlaySelection(records, router.location.playSelection);
      if (routed) return routed;
    }

    const recent = getLastPlayed(records);
    if (!recent) return null;
    const track = getPrimaryTrack(recent);
    if (!track) return null;
    return { record: recent, track };
  }, [records, nowPlaying, router.location.page, router.location.playSelection]);

  const resolvedQueue = useMemo(
    () => resolvePlayQueue(records, playQueue),
    [records, playQueue]
  );

  const discogsIds = useMemo(
    () => records.map((r) => r.discogsId).filter((id): id is number => id != null),
    [records]
  );

  useEffect(() => {
    if (!crates.personalCrate?.id || crates.isGuestView) return;
    void fetchDiscogsIdsForCollection(crates.personalCrate.id).then(setPersonalDiscogsIds);
  }, [crates.personalCrate?.id, crates.isGuestView]);

  useEffect(() => {
    const crateId = crates.activeCrate?.id;
    if (!crates.isGuestView || !crateId) return;
    if (isGuestCrateTracklistsComplete(crateId)) return;

    void probeGuestTracklistsPersisted(crateId).then((probe) => {
      if (!probe.looksEnriched) return;
      markGuestCrateTracklistsComplete(crateId);
      setGuestTracklistsProbeRevision((n) => n + 1);
      toast.message('Tracklists found in database', {
        description: `Loading full data (${probe.multiTrack}/${probe.sampled} sampled releases have full tracklists).`,
      });
    });
  }, [crates.isGuestView, crates.activeCrate?.id]);

  useEffect(() => {
    if (!crates.available || crates.crates.length === 0) return;

    const { crateSlug, page } = router.location;
    if (crateSlug) {
      crates.selectCrateBySlug(crateSlug);
      return;
    }

    const onGuestCollectionPath =
      typeof window !== 'undefined' && window.location.pathname.startsWith('/crates/');
    if (page === 'collection' && !onGuestCollectionPath) {
      crates.selectCrateBySlug(null);
      return;
    }

    const savedSlug = loadActiveCrateSlug();
    if (savedSlug) {
      crates.selectCrateBySlug(savedSlug);
    }
  }, [
    router.location.crateSlug,
    router.location.page,
    crates.available,
    crateSlugKey,
    crates.selectCrateBySlug,
    crates.crates.length,
  ]);

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

  const openGuestSmartEnrich = useCallback(() => {
    const personalId = crates.personalCrate?.id;
    if (!personalId) return;
    setEnrichGuestOpen(true);
    setPersonalRecordsForEnrichLoading(true);
    void fetchRecords({
      collectionId: personalId,
      personalCollectionId: personalId,
      summaryOnly: false,
    })
      .then((result) => {
        setPersonalRecordsForEnrich((result.data ?? []).map((row) => migrateRecord(row)));
      })
      .finally(() => setPersonalRecordsForEnrichLoading(false));
  }, [crates.personalCrate?.id]);

  const handleGuestSmartEnrich = useCallback(async () => {
    setGuestSmartEnrichRunning(true);
    setEnrichGuestOpen(false);
    toast.message('Smart enrich running', {
      description: 'Tracklists first — watch progress bottom-right.',
    });
    try {
      const stats = await runCrossCrateTransferFromPersonal(personalRecordsForEnrich);
      await runFullTracklistEnrichmentJob();

      const crateId = crates.activeCrate?.id;
      if (crateId) {
        markGuestCrateTracklistsComplete(crateId);
        setGuestEnrichmentRevision((n) => n + 1);
        toast.success('Tracklists imported', {
          description: 'Loading full crate data — Insights will show all tracks shortly.',
        });
      }

      void runFullMetadataEnrichmentJob().then(() => {
        if (crateId) markGuestCrateEnrichmentComplete(crateId);
        toast.message('Metadata enrich finished', {
          description: 'BPM/key lookup complete for Keendigger\'s crate.',
        });
      });

      if (stats.tracklistsCopied > 0 || stats.metadataTracksCopied > 0) {
        toast.message('Copied from your crate', {
          description: `${stats.tracklistsCopied} tracklists, ${stats.metadataTracksCopied} metadata rows`,
        });
      }
    } catch (error) {
      toast.error('Smart enrich failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setGuestSmartEnrichRunning(false);
    }
  }, [
    crates.activeCrate?.id,
    personalRecordsForEnrich,
    runCrossCrateTransferFromPersonal,
    runFullTracklistEnrichmentJob,
    runFullMetadataEnrichmentJob,
  ]);

  const handleOpenTracklistEnrich = useCallback(() => {
    if (crates.isGuestView) {
      openGuestSmartEnrich();
      return;
    }
    setEnrichTracklistsOpen(true);
  }, [crates.isGuestView, openGuestSmartEnrich]);

  const handleOpenMetadataEnrich = useCallback(() => {
    if (crates.isGuestView) {
      openGuestSmartEnrich();
      return;
    }
    setEnrichMetadataOpen(true);
  }, [crates.isGuestView, openGuestSmartEnrich]);

  const handleEnrichAllTracklists = useCallback(() => {
    void runFullTracklistEnrichmentJob().then((result) => {
      if (!result) return;
      const linked = records.filter((r) => r.discogsId != null).length;
      const batched = linked > TRACKLIST_ENRICH_LARGE_THRESHOLD;
      if (result.updated > 0) {
        toast.success(
          batched ? 'Tracklist enrichment finished' : result.updated === 1 ? '1 release updated' : `${result.updated} releases updated`,
          {
            description: formatEnrichmentSummary(result),
          }
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
  }, [records, runFullTracklistEnrichmentJob]);

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

  const availableGenres = useMemo(() => collectGroupedGenreOptions(records), [records]);

  const filtered = useMemo(() => {
    const q = collectionFilters.query.toLowerCase().trim();
    return records.filter((r) => {
      if (q && !r.title.toLowerCase().includes(q) && !r.artist.toLowerCase().includes(q)) {
        return false;
      }
      if (collectionFilters.format && r.format !== collectionFilters.format) return false;
      if (collectionFilters.genre && !recordMatchesGroupedGenre(r, collectionFilters.genre)) {
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
      if (!recordMatchesCutRatingFilter(r, collectionFilters.cutRating)) return false;
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

    const collectionName = collectionDisplayName(user?.email);

    setExportingPdf(true);
    const preparing = toast.loading('Preparing your catalog…', {
      description: 'Loading artwork and layout',
    });
    try {
      const { buildCollectionFilterNote, exportCollectionToPdf } = await import(
        './lib/collectionPdfExport'
      );
      await exportCollectionToPdf({
        records: filtered,
        totalInCollection: records.length,
        collectionName,
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
      toast.success(`${collectionName} PDF ready`, {
        description: `Your catalog with ${scope} is downloaded.`,
      });
    } catch (err) {
      toast.dismiss(preparing);
      const message = err instanceof Error ? err.message : 'Something went wrong';
      if (/dynamically imported module|loading chunk|failed to fetch/i.test(message)) {
        toast.error('App updated — reloading…', {
          description: 'Then try Export PDF again.',
        });
        window.setTimeout(() => window.location.reload(), 1200);
        return;
      }
      toast.error('PDF export failed', { description: message });
    } finally {
      setExportingPdf(false);
    }
  }, [filtered, records.length, collectionFilters, user?.email]);

  const hadUserRef = useRef(false);
  useEffect(() => {
    if (user && !hadUserRef.current) {
      hadUserRef.current = true;
      if (!settings.onboardingComplete) {
        updateSettings({ onboardingComplete: true });
      }
    }
    if (!user) {
      hadUserRef.current = false;
      playHydratedRef.current = null;
      queueHydratedRef.current = false;
    }
  }, [user, settings.onboardingComplete, updateSettings]);

  useEffect(() => {
    if (collectionLoading || !activeCollectionId) return;

    if (playCrateIdRef.current === activeCollectionId) return;
    playCrateIdRef.current = activeCollectionId;

    playHydratedRef.current = null;
    queueHydratedRef.current = true;
    setLabelSelection(new Set());

    const restoredQueue = loadPlayQueue(activeCollectionId);
    setPlayQueue(restoredQueue);

    const restoredNow = loadNowPlaying(activeCollectionId);
    setNowPlaying(restoredNow);
  }, [collectionLoading, activeCollectionId]);

  useEffect(() => {
    if (!queueHydratedRef.current || !activeCollectionId) return;
    savePlayQueue(playQueue, activeCollectionId);
  }, [playQueue, activeCollectionId]);

  useEffect(() => {
    if (authLoading || collectionLoading || !collectionHydrated) return;
    if (router.location.page !== 'play') return;

    let routePlay = router.location.playSelection;
    if (!routePlay) {
      const stored = loadNowPlaying(activeCollectionId ?? undefined);
      if (!stored) return;
      const targetHref = buildAppHref(
        locationForPage('play', {
          playSelection: stored,
          crateSlug: router.location.crateSlug,
        })
      );
      if (currentAppHref() !== targetHref) {
        router.goToPlay(stored, { replace: true });
        return;
      }
      routePlay = stored;
    }

    const key = playSelectionKey(routePlay);
    if (playHydratedRef.current === key) return;

    const resolved = resolvePlaySelection(records, routePlay);
    if (!resolved) {
      playHydratedRef.current = null;
      saveNowPlaying(null, activeCollectionId ?? undefined);
      setNowPlaying(null);
      toast.error('Track not found in your collection', {
        description: 'That link may be outdated or the release was removed.',
      });
      router.goToPlay(null, { replace: true });
      return;
    }

    playHydratedRef.current = key;
    setNowPlaying(routePlay);
    saveNowPlaying(routePlay, activeCollectionId ?? undefined);
  }, [
    activeCollectionId,
    authLoading,
    collectionHydrated,
    collectionLoading,
    records,
    router.location.crateSlug,
    router.location.page,
    router.location.playSelection,
    router.goToPlay,
  ]);

  useEffect(() => {
    if (collectionLoading) return;

    const releaseId = router.location.releaseId;
    if (!releaseId) {
      releaseRouteRef.current = null;
      setDetail(null);
      setDetailEditOnOpen(false);
      return;
    }

    const record = records.find((r) => r.id === releaseId);
    if (!record) {
      router.closeRelease();
      return;
    }

    if (releaseRouteRef.current !== releaseId) {
      releaseRouteRef.current = releaseId;
      setDetailSession((n) => n + 1);
    }
    setDetailEditOnOpen(router.location.releaseEdit);
    setDetail(record);
  }, [
    collectionLoading,
    records,
    router.location.releaseId,
    router.location.releaseEdit,
    router.closeRelease,
  ]);

  useEffect(() => {
    if (collectionLoading) return;

    const resolved = router.location.playSelection
      ? resolvePlaySelection(records, router.location.playSelection)
      : null;

    if (resolved) {
      document.title = playDocumentTitle(
        resolved.record.artist,
        resolved.track.title,
        resolved.record.title
      );
      return;
    }

    document.title = pageDocumentTitle(router.location.page);
  }, [
    collectionLoading,
    records,
    router.location.page,
    router.location.playSelection,
  ]);

  const handlePlayNow = useCallback(
    (record: VinylRecord, track: Track) => {
      const ref: PlaySelection = { recordId: record.id, trackId: track.id };
      const key = playSelectionKey(ref);
      playHydratedRef.current = key;
      saveNowPlaying(ref, activeCollectionId ?? undefined);
      setNowPlaying(ref);
      markPlayed(record.id);
      setPlayQueue((q) => q.filter((item) => !isSamePlaySelection(item, ref)));
      if (crates.isGuestView && crates.activeCrate?.slug) {
        router.goToPage('play', ref, { crateSlug: crates.activeCrate.slug });
      } else {
        router.goToPlay(ref);
      }
      const idx = record.tracks.findIndex((t) => t.id === track.id);
      toast.success(`Now playing: ${track.title}`, {
        description: `${trackPositionLabel(track, idx >= 0 ? idx : 0)} · ${record.artist}`,
      });
    },
    [
      activeCollectionId,
      crates.activeCrate?.slug,
      crates.isGuestView,
      markPlayed,
      router,
    ]
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
        toast.success('Added to set', {
          description: `${track.title} · ${record.artist}`,
        });
      } else {
        toast.message('Already in set', { description: track.title });
      }
    },
    [nowPlaying]
  );

  const handleCloseRecordDetail = useCallback(() => {
    router.closeRelease();
    setDetail(null);
    setDetailEditOnOpen(false);
  }, [router]);

  useEffect(() => {
    setRecordDetailController({
      open: (record, initialEditing = false) => {
        setScanAddOpen(false);
        setScanAddHit(null);
        setScanAddRelease(null);
        router.openRelease(record.id, initialEditing);
      },
      close: handleCloseRecordDetail,
    });
    return () => setRecordDetailController(null);
  }, [handleCloseRecordDetail, router]);

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

  const handleDiscoverAdd = useCallback(
    (payload: DiscoverAddPayload) => {
      const personalId = crates.personalCrate?.id;
      const added = addRecord(payload.record, personalId);
      if (!added) return null;

      enqueueReleaseEnrichment(added);

      const track = added.tracks[payload.trackIndex] ?? getPrimaryTrack(added);
      if (!track) return added;

      if (payload.intent === 'spin') {
        handlePlayNow(added, track);
        return added;
      }

      const guestNote =
        crates.isGuestView ? ' Added to your personal crate.' : '';
      toast.success('Added to your crate', {
        description: `${added.artist} — ${added.title}${guestNote}`,
        action: {
          label: 'Load on deck',
          onClick: () => handlePlayNow(added, track),
        },
      });
      return added;
    },
    [addRecord, crates.isGuestView, crates.personalCrate?.id, enqueueReleaseEnrichment, handlePlayNow]
  );

  const handleNavigate = useCallback(
    (nextPage: typeof page) => {
      const playSelection =
        nextPage === 'play' && nowPlaying ? nowPlaying : router.location.playSelection;
      const crateSlug = crates.isGuestView ? crates.activeCrate?.slug ?? null : null;
      router.goToPage(nextPage, playSelection, { crateSlug });
    },
    [crates.activeCrate?.slug, crates.isGuestView, nowPlaying, router]
  );

  const handleSelectCrate = useCallback(
    (crate: (typeof crates.crates)[number]) => {
      crates.selectCrate(crate);
      router.goToCrate(isPersonalCrate(crate) ? null : crate.slug);
    },
    [crates, router]
  );

  useEffect(() => {
    if (!crates.isGuestView || !crates.activeCrate) {
      setGuestBannerDismissed(false);
      return;
    }
    setGuestBannerDismissed(isGuestCrateBannerDismissed(crates.activeCrate.slug));
  }, [crates.activeCrate?.slug, crates.isGuestView]);

  const handleDismissGuestBanner = useCallback(() => {
    if (!crates.activeCrate) return;
    dismissGuestCrateBanner(crates.activeCrate.slug);
    setGuestBannerDismissed(true);
  }, [crates.activeCrate]);

  const handleRemoveGuestCrate = useCallback(async (): Promise<boolean> => {
    if (!crates.activeCrate || !crates.isGuestView) return false;
    const name = crates.activeCrate.name;
    const result = await crates.removeGuestCrate(crates.activeCrate.id);
    if (result.error) {
      toast.error('Could not remove guest crate', { description: result.error.message });
      return false;
    }
    router.goToCrate(null);
    toast.success('Guest crate removed', { description: name });
    return true;
  }, [crates, router]);

  const handleAddRecord = useCallback(() => {
    discogsSearchRef.current?.focus();
  }, []);

  const handleOpenPersonalCrate = useCallback(() => {
    saveActiveCrateSlug(null);
    crates.setActiveSlug(null);
    router.goToCrate(null);
    void retryCollectionLoad();
  }, [crates, router, retryCollectionLoad]);

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

  if (collectionLoading || (crates.available && crates.loading)) {
    return (
      <>
        <CollectionLoading
          onSwitchToPersonal={crates.isGuestView ? handleOpenPersonalCrate : undefined}
          switchLabel="Stuck? Open My Crate"
        />
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
        onNavigate={handleNavigate}
        recordCount={records.length}
        crateSlug={crates.isGuestView ? crates.activeCrate?.slug ?? null : null}
        playSelection={nowPlaying ?? router.location.playSelection}
        onScan={() => setScanOpen(true)}
        onAddRecord={handleAddRecord}
        searchSlot={
          <DiscogsSearchBar
            ref={discogsSearchRef}
            variant="nav"
            onAdd={handleDiscoverAdd}
            onDiscogsImport={() => setDiscogsImportOpen(true)}
            collectionDiscogsIds={discogsIds}
            inputId="app-discogs-search-input"
          />
        }
      />

      <main
        className={`app-main mx-auto max-w-7xl px-3 sm:px-6 ${
          page === 'collection'
            ? 'app-main--collection pb-8 pt-0 sm:pt-2'
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
                crates={crates.crates}
                activeCrate={crates.activeCrate}
                showCrateSwitcher={crates.available}
                onSelectCrate={handleSelectCrate}
                onImportGuest={() => setDiscogsImportOpen(true)}
              />

              {crates.isGuestView && crates.activeCrate && !guestBannerDismissed ? (
                <GuestCrateBanner
                  crate={crates.activeCrate}
                  onDismiss={handleDismissGuestBanner}
                  onRemoveRequest={() => setRemoveGuestCrateOpen(true)}
                />
              ) : null}

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
                  onResetCollection={
                    crates.isGuestView ? undefined : () => setClearCollectionOpen(true)
                  }
                  onEnrichTracklists={handleOpenTracklistEnrich}
                  enrichingTracklists={
                    isFullTracklistEnrichmentRunning || guestSmartEnrichRunning
                  }
                  onEnrichMetadata={handleOpenMetadataEnrich}
                  enrichingMetadata={isFullMetadataEnrichmentRunning}
                  discogsLinkedCount={discogsLinkedCount}
                  onExportPdf={() => void handleExportPdf()}
                  exportingPdf={exportingPdf}
                  onOpenInsights={() => router.goToPage('insights')}
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
                    readOnly={crates.isGuestView}
                    onPlayNow={handlePlayNow}
                    onAddToQueue={handleAddToQueue}
                    onEnrichRelease={handleEnrichRelease}
                    onSaveCutRating={(recordId, trackId, rating: CutRating | undefined) => {
                      updateRecord(
                        recordId,
                        (record) => ({
                          tracks: patchTrack(record, trackId, { cutRating: rating }).tracks,
                        }),
                        { persistImmediately: true }
                      );
                    }}
                    onDelete={(id) => {
                      if (!removeRecord(id)) return;
                      if (detail?.id === id) closeRecordDetail();
                      toast.success('Removed from collection');
                    }}
                  />
                ) : (
                  <GridView
                    records={filtered}
                    onPlay={(record) => {
                      const track = getPrimaryTrack(record);
                      if (track) handlePlayNow(record, track);
                    }}
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
                crateName={crates.activeCrate?.name}
                isGuestCrate={crates.isGuestView}
                onApplyFilter={handleApplyInsightFilter}
                onOpenCollection={() =>
                  router.goToPage(
                    'collection',
                    undefined,
                    { crateSlug: crates.isGuestView ? crates.activeCrate?.slug ?? null : null }
                  )
                }
                onEnrichTracklists={handleOpenTracklistEnrich}
                onEnrichMetadata={handleOpenMetadataEnrich}
                onPlayNow={handlePlayNow}
                onAddToQueue={handleAddToQueue}
                onQueueMany={handleQueueMany}

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
                crateName={crates.activeCrate?.name}
                isGuestCrate={crates.isGuestView}
                nowPlaying={playAnchor}
                queue={resolvedQueue}
                onPlayNow={handlePlayNow}
                onSaveTapBpm={
                  crates.isGuestView
                    ? undefined
                    : (recordId, trackId, bpm) => {
                        updateRecord(
                          recordId,
                          (record) => ({
                            tracks: patchTrack(record, trackId, {
                              bpm,
                              bpmEstimated: false,
                              bpmTapped: true,
                              bpmManual: false,
                            }).tracks,
                          }),
                          { persistImmediately: true }
                        );
                        toast.success('BPM saved', {
                          description: `${bpm} BPM — tap locked for this track`,
                        });
                      }
                }
                onSaveManualBpm={
                  crates.isGuestView
                    ? undefined
                    : (recordId, trackId, bpm) => {
                        updateRecord(
                          recordId,
                          (record) => ({
                            tracks: patchTrack(record, trackId, {
                              bpm,
                              bpmEstimated: false,
                              bpmTapped: false,
                              bpmManual: true,
                            }).tracks,
                          }),
                          { persistImmediately: true }
                        );
                        toast.success('BPM set', {
                          description: `${bpm} BPM — your entry is locked for this track`,
                        });
                      }
                }
                onSaveCutRating={
                  crates.isGuestView
                    ? undefined
                    : (recordId, trackId, rating) => {
                        updateRecord(
                          recordId,
                          (record) => ({
                            tracks: patchTrack(record, trackId, { cutRating: rating }).tracks,
                          }),
                          { persistImmediately: true }
                        );
                        if (rating) {
                          toast.success('Rating saved', {
                            description: CUT_RATING_LABELS[rating],
                          });
                        }
                      }
                }
                onEnrichRelease={
                  !crates.isGuestView && playAnchor
                    ? () => handleEnrichRelease(playAnchor.record.id)
                    : undefined
                }
                enrichingRelease={
                  !crates.isGuestView &&
                  Boolean(playAnchor) &&
                  liveEnrich?.recordId === playAnchor?.record.id
                }
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
                crateName={crates.activeCrate?.name}
                isGuestCrate={crates.isGuestView}
                readOnly={crates.isGuestView}
                selectedIds={labelSelection}
                onToggle={toggleLabel}
                onSelectAll={() => setLabelSelection(new Set(records.map((r) => r.id)))}
                onClearSelection={() => setLabelSelection(new Set())}
                onSaveDescription={
                  crates.isGuestView
                    ? undefined
                    : (id, text) =>
                        updateRecord(id, {
                          labelDescription: text ? clampLabelDescription(text) : undefined,
                        })
                }
                onSaveVibes={
                  crates.isGuestView
                    ? undefined
                    : (id, vibeTags) =>
                        updateRecord(id, (r) => patchPrimaryTrack(r, { vibeTags }))
                }
                onSaveLabelDisplay={
                  crates.isGuestView
                    ? undefined
                    : (id, labelDisplay) => updateRecord(id, { labelDisplay })
                }
                onEnrichRelease={crates.isGuestView ? undefined : handleEnrichRelease}
                enrichingRecordId={crates.isGuestView ? null : liveEnrich?.recordId ?? null}
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
        onSave={(record, meta) => {
          handleDiscoverAdd({ record, ...meta });
          setScanAddOpen(false);
          setScanAddHit(null);
          setScanAddRelease(null);
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
        readOnly={crates.isGuestView}
        onClose={handleCloseRecordDetail}
        onUpdate={(id, patch) => {
          updateRecord(id, patch, { persistImmediately: true });
          const label = detail;
          toast.success('Record updated', {
            description: label ? `${label.artist} — ${label.title}` : undefined,
          });
        }}
        onDelete={(id) => {
          if (!removeRecord(id)) return;
          handleCloseRecordDetail();
          toast.success('Removed from collection');
        }}
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

      <EnrichGuestCrateModal
        open={enrichGuestOpen}
        running={
          guestSmartEnrichRunning ||
          isFullTracklistEnrichmentRunning ||
          isFullMetadataEnrichmentRunning
        }
        guestRecords={records}
        personalRecords={personalRecordsForEnrich}
        personalLoading={personalRecordsForEnrichLoading}
        crateName={crates.activeCrate?.name ?? 'Guest crate'}
        onClose={() => setEnrichGuestOpen(false)}
        onConfirm={() => void handleGuestSmartEnrich()}
      />

      <ClearCollectionModal
        open={clearCollectionOpen}
        records={records}
        onClose={() => setClearCollectionOpen(false)}
        onConfirm={(mode) => {
          const removed = clearCollection(mode);
          closeRecordDetail();
          setPlayQueue([]);
          clearPlayQueueStorage();
          clearNowPlayingStorage();
          setNowPlaying(null);
          playHydratedRef.current = null;
          router.goToPage('collection');
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

      <RemoveGuestCrateModal
        open={removeGuestCrateOpen}
        crate={crates.isGuestView ? crates.activeCrate : null}
        onClose={() => setRemoveGuestCrateOpen(false)}
        onConfirm={handleRemoveGuestCrate}
      />

      {crates.available || discogsImportOpen ? (
        <ImportCrateModal
          open={discogsImportOpen}
          onClose={() => setDiscogsImportOpen(false)}
          existingDiscogsIds={personalDiscogsIds}
          resolveGuestExistingIds={async (discogsUsername) => {
            const match = crates.guestCrates.find(
              (c) => c.discogsUsername?.toLowerCase() === discogsUsername.trim().toLowerCase()
            );
            if (!match) return [];
            return fetchDiscogsIdsForCollection(match.id);
          }}
          onImportPersonal={async (incoming) => {
            const personalId = crates.personalCrate?.id;
            if (!personalId) return { added: 0, skipped: incoming.length };
            const { added, skipped } = await importDiscogsCollection(incoming, {
              collectionId: personalId,
            });
            if (added > 0) {
              toast.success(
                added === 1 ? '1 record imported' : `${added} records imported`,
                { description: skipped > 0 ? `${skipped} skipped (duplicate or CD)` : undefined }
              );
              void fetchDiscogsIdsForCollection(personalId).then(setPersonalDiscogsIds);
              if (!crates.isGuestView) {
                void retryCollectionLoad();
              }
            } else {
              toast.message('Nothing new to import', {
                description: 'Your crate already has these releases, or they are CD-only.',
              });
            }
            return { added, skipped };
          }}
          onImportGuest={async (incoming, { discogsUsername }) => {
            const trimmedUsername = discogsUsername.trim();
            const existingBefore = crates.guestCrates.find(
              (c) => c.discogsUsername?.toLowerCase() === trimmedUsername.toLowerCase()
            );
            const created = await crates.importGuestCrate(discogsUsername);
            if (created.error || !created.data) {
              return {
                added: 0,
                skipped: incoming.length,
                error: created.error?.message ?? 'Could not create guest crate',
              };
            }

            const crateId = created.data.id;
            const isNewEmptyCrate =
              !existingBefore && (created.data.recordCount ?? 0) === 0;

            const discardEmptyCrate = async () => {
              if (!isNewEmptyCrate) return;
              await crates.removeGuestCrate(crateId);
            };

            try {
              const { added, skipped, capped, partial, error } = await importDiscogsCollection(
                incoming,
                { collectionId: crateId }
              );

              if (added === 0) {
                await discardEmptyCrate();
                return {
                  added: 0,
                  skipped: incoming.length,
                  error:
                    error ??
                    'No records could be imported. The guest crate was not saved.',
                };
              }

              crates.selectCrateBySlug(created.data.slug);
              router.goToCrate(created.data.slug);
              setDiscogsImportOpen(false);
              void crates.bumpRecordCount(crateId).then(() => crates.refreshCrates());
              void retryCollectionLoad();

              const capNote =
                capped > 0
                  ? ` · capped at ${GUEST_CRATE_MAX_RECORDS.toLocaleString()} vinyl`
                  : '';
              const skipNote = skipped > 0 ? `${skipped} skipped${capNote}` : capNote.slice(3);

              if (partial) {
                toast.warning(
                  added === 1 ? '1 record imported (partial)' : `${added} records imported (partial)`,
                  {
                    description:
                      [error, skipNote].filter(Boolean).join(' · ') ||
                      'Some records could not be saved.',
                  }
                );
              } else {
                toast.success(
                  added === 1 ? '1 record imported' : `${added} records imported`,
                  { description: skipNote || undefined }
                );
              }

              return { added, skipped };
            } catch (e) {
              await discardEmptyCrate();
              const message = e instanceof Error ? e.message : 'Import failed';
              toast.error('Guest import failed', {
                description: isNewEmptyCrate
                  ? `${message} Empty crate was discarded.`
                  : message,
              });
              return { added: 0, skipped: incoming.length, error: message };
            }
          }}
        />
      ) : (
        <DiscogsImportModal
          open={discogsImportOpen}
          onClose={() => setDiscogsImportOpen(false)}
          existingDiscogsIds={discogsIds}
          onImport={async (incoming) => {
            const { added, skipped } = await importDiscogsCollection(incoming);
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
      )}

      <AppToaster />
    </div>
  );
}

export default App;