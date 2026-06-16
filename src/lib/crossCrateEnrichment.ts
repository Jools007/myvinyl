import { resolveTrackCamelot } from './camelot';
import { releaseNeedsMetadataEnrichment } from './fullMetadataEnrichment';
import { countLikelyIncompleteTracklists } from './fullTracklistEnrichment';
import {
  mergeEnrichedTracksIntoRelease,
  migrateRecord,
  trackNeedsEnrichment,
  trackRowKey,
} from './tracks';
import type { Track, VinylRecord } from './types';

export type CrossCrateOverlapAnalysis = {
  guestLinked: number;
  personalLinked: number;
  overlapReleases: number;
  tracklistsCopyable: number;
  metadataCopyable: number;
  overlapDiscogsIds: number[];
};

export type CrossCrateTransferResult = {
  record: VinylRecord;
  tracklistCopied: boolean;
  metadataTracksCopied: number;
};

export type CrossCrateTransferStats = {
  overlapReleases: number;
  tracklistsCopied: number;
  metadataTracksCopied: number;
  releasesUpdated: number;
  releasesUnchanged: number;
};

export function guestHasPlaceholderTracklist(record: VinylRecord): boolean {
  return record.discogsId != null && record.tracks.length <= 1;
}

export function personalHasFullTracklist(record: VinylRecord): boolean {
  return record.tracks.length > 1;
}

export function personalHasUsefulMetadata(record: VinylRecord): boolean {
  return record.tracks.some(
    (track) =>
      track.bpm != null ||
      Boolean(resolveTrackCamelot(track).code) ||
      (track.vibeTags?.length ?? 0) > 0
  );
}

function sanitizeTransferredTrack(track: Track, newId: string): Track {
  return {
    id: newId,
    title: track.title,
    position: track.position,
    duration: track.duration,
    artist: track.artist,
    bpm: track.bpm,
    camelotKey: track.camelotKey,
    musicalKey: track.musicalKey,
    bpmEstimated: track.bpmEstimated,
    keyEstimated: track.keyEstimated,
    vibeTags: [...(track.vibeTags ?? [])],
    discogsTrackId: track.discogsTrackId,
    isPrimary: track.isPrimary,
    spotifyPreviewUrl: track.spotifyPreviewUrl,
    spotifyTrackId: track.spotifyTrackId,
  };
}

function copyTracklistFromPersonal(
  guest: VinylRecord,
  source: VinylRecord,
  createId: () => string
): VinylRecord {
  const sourcePrimaryIndex = source.tracks.findIndex((t) => t.isPrimary);
  const primaryIndex = sourcePrimaryIndex >= 0 ? sourcePrimaryIndex : 0;

  const tracks = source.tracks.map((track, index) => ({
    ...sanitizeTransferredTrack(track, createId()),
    isPrimary: index === primaryIndex,
  }));

  return migrateRecord({
    ...guest,
    tracks,
    genres: guest.genres.length > 0 ? guest.genres : source.genres,
  });
}

function countMetadataTracksCopied(before: VinylRecord, after: VinylRecord): number {
  const beforeByKey = new Map(before.tracks.map((t) => [trackRowKey(t), t]));
  let copied = 0;
  for (const track of after.tracks) {
    const prev = beforeByKey.get(trackRowKey(track));
    if (!prev) continue;
    const wasEmpty = trackNeedsEnrichment(prev) && (prev.vibeTags?.length ?? 0) === 0;
    const nowFilled =
      track.bpm != null ||
      Boolean(resolveTrackCamelot(track).code) ||
      (track.vibeTags?.length ?? 0) > 0;
    if (wasEmpty && nowFilled) copied += 1;
  }
  return copied;
}

/** Copy tracklist and/or BPM/key/vibes from a personal release onto a guest row (matched by discogsId). */
export function transferEnrichmentFromPersonal(
  guest: VinylRecord,
  personal: VinylRecord,
  createId: () => string
): CrossCrateTransferResult {
  let record = migrateRecord(guest);
  let tracklistCopied = false;
  let metadataTracksCopied = 0;

  if (guestHasPlaceholderTracklist(record) && personalHasFullTracklist(personal)) {
    const before = record;
    record = copyTracklistFromPersonal(record, personal, createId);
    tracklistCopied = true;
    metadataTracksCopied = countMetadataTracksCopied(before, record);
    return { record, tracklistCopied, metadataTracksCopied };
  }

  if (personalHasUsefulMetadata(personal) && releaseNeedsMetadataEnrichment(record)) {
    const before = record;
    record = migrateRecord(mergeEnrichedTracksIntoRelease(record, personal.tracks));
    metadataTracksCopied = countMetadataTracksCopied(before, record);
  }

  return { record, tracklistCopied, metadataTracksCopied };
}

export function buildPersonalDiscogsIndex(
  personalRecords: VinylRecord[]
): Map<number, VinylRecord> {
  const index = new Map<number, VinylRecord>();
  for (const record of personalRecords) {
    if (record.discogsId == null) continue;
    const existing = index.get(record.discogsId);
    if (!existing || record.tracks.length > existing.tracks.length) {
      index.set(record.discogsId, migrateRecord(record));
    }
  }
  return index;
}

export function analyzeCrossCrateOverlap(
  guestRecords: VinylRecord[],
  personalRecords: VinylRecord[]
): CrossCrateOverlapAnalysis {
  const personalIndex = buildPersonalDiscogsIndex(personalRecords);
  const guestLinked = guestRecords.filter((r) => r.discogsId != null).length;
  const personalLinked = personalIndex.size;

  let overlapReleases = 0;
  let tracklistsCopyable = 0;
  let metadataCopyable = 0;
  const overlapDiscogsIds: number[] = [];

  for (const guest of guestRecords) {
    if (guest.discogsId == null) continue;
    const personal = personalIndex.get(guest.discogsId);
    if (!personal) continue;

    overlapReleases += 1;
    overlapDiscogsIds.push(guest.discogsId);

    if (guestHasPlaceholderTracklist(guest) && personalHasFullTracklist(personal)) {
      tracklistsCopyable += 1;
    }
    if (personalHasUsefulMetadata(personal) && releaseNeedsMetadataEnrichment(guest)) {
      metadataCopyable += 1;
    }
  }

  return {
    guestLinked,
    personalLinked,
    overlapReleases,
    tracklistsCopyable,
    metadataCopyable,
    overlapDiscogsIds,
  };
}

export function applyCrossCrateTransferToCollection(
  guestRecords: VinylRecord[],
  personalRecords: VinylRecord[],
  createId: () => string
): { records: VinylRecord[]; stats: CrossCrateTransferStats; changedRecords: VinylRecord[] } {
  const personalIndex = buildPersonalDiscogsIndex(personalRecords);
  const stats: CrossCrateTransferStats = {
    overlapReleases: 0,
    tracklistsCopied: 0,
    metadataTracksCopied: 0,
    releasesUpdated: 0,
    releasesUnchanged: 0,
  };

  const changedRecords: VinylRecord[] = [];

  const records = guestRecords.map((guest) => {
    if (guest.discogsId == null) return migrateRecord(guest);
    const personal = personalIndex.get(guest.discogsId);
    if (!personal) return migrateRecord(guest);

    stats.overlapReleases += 1;
    const result = transferEnrichmentFromPersonal(guest, personal, createId);
    if (result.tracklistCopied || result.metadataTracksCopied > 0) {
      stats.releasesUpdated += 1;
      if (result.tracklistCopied) stats.tracklistsCopied += 1;
      stats.metadataTracksCopied += result.metadataTracksCopied;
      changedRecords.push(result.record);
      return result.record;
    }
    stats.releasesUnchanged += 1;
    return migrateRecord(guest);
  });

  return { records, stats, changedRecords };
}

/** Rough estimate of remaining work after a cross-crate copy. */
export function estimateRemainingGuestEnrichment(guestRecords: VinylRecord[]): {
  tracklistsRemaining: number;
  metadataReleasesRemaining: number;
} {
  return {
    tracklistsRemaining: countLikelyIncompleteTracklists(guestRecords),
    metadataReleasesRemaining: guestRecords.filter(releaseNeedsMetadataEnrichment).length,
  };
}