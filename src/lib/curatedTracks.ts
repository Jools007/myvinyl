import type { CutRating, Track, VinylRecord } from './types';
import { COMPILATIONS_CHART_LABEL, isVariousArtist } from './variousArtist';

/** User has marked this track as a keeper — manual BPM and/or cut rating. */
export function isCuratedTrack(track: Track): boolean {
  return track.bpmManual === true || track.cutRating != null;
}

const RATING_WEIGHT: Record<CutRating, number> = {
  G: 2,
  VG: 3,
  'VG+': 4,
};

/** Higher = stronger personal signal (rating tier + manual BPM). */
export function curatedTrackWeight(track: Track): number {
  let score = 0;
  if (track.bpmManual) score += 3;
  if (track.cutRating) score += RATING_WEIGHT[track.cutRating];
  if (track.bpmManual && track.cutRating) score += 2;
  return score;
}

export function isCuratedRelease(record: VinylRecord): boolean {
  return record.tracks.some(isCuratedTrack);
}

export function curatedTracksOnRelease(record: VinylRecord): Track[] {
  return record.tracks.filter(isCuratedTrack);
}

/** Insights artist label — VA rows become Compilations. */
export function curatedArtistLabel(record: VinylRecord): string {
  return isVariousArtist(record.artist) ? COMPILATIONS_CHART_LABEL : record.artist.trim();
}

export type CuratedTrackHighlight = {
  recordId: string;
  trackId: string;
  artist: string;
  releaseTitle: string;
  trackTitle: string;
  cutRating?: CutRating;
  hasManualBpm: boolean;
  weight: number;
};

export type PreferenceGap = {
  artist: string;
  ownedCount: number;
  curatedTrackCount: number;
};

export type CuratedInsights = {
  trackCount: number;
  releaseCount: number;
  trackPct: number;
  manualBpmCount: number;
  ratedTrackCount: number;
  vgPlusCount: number;
  topArtist: { name: string; trackCount: number; weight: number } | null;
  topArtists: { label: string; count: number; weight: number; ownedCount: number }[];
  topGenres: { label: string; count: number }[];
  avgBpm: number | null;
  medianBpm: number | null;
  bpmBuckets: { label: string; count: number }[];
  topTracks: CuratedTrackHighlight[];
  preferenceGaps: PreferenceGap[];
  /** Top curated named artist differs from top owned named artist. */
  shelfVsPicks: boolean;
};

const BPM_BUCKETS = ['Under 100', '100–119', '120–129', '130+'] as const;

function bpmBucketForValue(bpm: number): (typeof BPM_BUCKETS)[number] {
  if (bpm < 100) return 'Under 100';
  if (bpm < 120) return '100–119';
  if (bpm < 130) return '120–129';
  return '130+';
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export function computeCuratedInsights(
  records: VinylRecord[],
  topOwnedNamedArtist: string | null
): CuratedInsights {
  const artistTracks = new Map<string, { trackCount: number; weight: number }>();
  const artistOwned = new Map<string, number>();
  const genres = new Map<string, number>();
  const bpmBuckets = new Map<string, number>(
    BPM_BUCKETS.map((label) => [label, 0])
  );
  const highlights: CuratedTrackHighlight[] = [];
  const curatedBpms: number[] = [];

  let trackCount = 0;
  let manualBpmCount = 0;
  let ratedTrackCount = 0;
  let vgPlusCount = 0;
  const curatedReleaseIds = new Set<string>();

  for (const record of records) {
    const artistLabel = curatedArtistLabel(record);
    if (!isVariousArtist(record.artist)) {
      artistOwned.set(artistLabel, (artistOwned.get(artistLabel) ?? 0) + 1);
    }

    for (const track of record.tracks) {
      if (!isCuratedTrack(track)) continue;

      trackCount += 1;
      curatedReleaseIds.add(record.id);
      const weight = curatedTrackWeight(track);

      if (track.bpmManual) manualBpmCount += 1;
      if (track.cutRating) {
        ratedTrackCount += 1;
        if (track.cutRating === 'VG+') vgPlusCount += 1;
      }

      const bucket = artistTracks.get(artistLabel) ?? { trackCount: 0, weight: 0 };
      bucket.trackCount += 1;
      bucket.weight += weight;
      artistTracks.set(artistLabel, bucket);

      for (const g of record.genres) {
        genres.set(g, (genres.get(g) ?? 0) + 1);
      }

      if (track.bpm != null) {
        curatedBpms.push(track.bpm);
        bpmBuckets.set(bpmBucketForValue(track.bpm), (bpmBuckets.get(bpmBucketForValue(track.bpm)) ?? 0) + 1);
      }

      highlights.push({
        recordId: record.id,
        trackId: track.id,
        artist: artistLabel,
        releaseTitle: record.title,
        trackTitle: track.title,
        cutRating: track.cutRating,
        hasManualBpm: track.bpmManual === true,
        weight,
      });
    }
  }

  const totalTracks = records.reduce((sum, r) => sum + r.tracks.length, 0);
  const trackPct = totalTracks > 0 ? Math.round((trackCount / totalTracks) * 100) : 0;

  const topArtists = [...artistTracks.entries()]
    .map(([label, stats]) => ({
      label,
      count: stats.trackCount,
      weight: stats.weight,
      ownedCount: artistOwned.get(label) ?? (label === COMPILATIONS_CHART_LABEL ? 0 : 0),
    }))
    .sort((a, b) => b.weight - a.weight || b.count - a.count)
    .slice(0, 8);

  for (const row of topArtists) {
    if (row.label !== COMPILATIONS_CHART_LABEL) {
      row.ownedCount = artistOwned.get(row.label) ?? 0;
    } else {
      row.ownedCount = records.filter((r) => isVariousArtist(r.artist)).length;
    }
  }

  const topArtist = topArtists[0]
    ? {
        name: topArtists[0].label,
        trackCount: topArtists[0].count,
        weight: topArtists[0].weight,
      }
    : null;

  const topGenres = [...genres.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count]) => ({ label, count }));

  const preferenceGaps = [...artistOwned.entries()]
    .filter(([artist, owned]) => owned >= 2 && (artistTracks.get(artist)?.trackCount ?? 0) === 0)
    .map(([artist, ownedCount]) => ({
      artist,
      ownedCount,
      curatedTrackCount: 0,
    }))
    .sort((a, b) => b.ownedCount - a.ownedCount)
    .slice(0, 6);

  const topNamedCurated = topArtists.find((a) => a.label !== COMPILATIONS_CHART_LABEL) ?? null;
  const shelfVsPicks =
    topOwnedNamedArtist != null &&
    topNamedCurated != null &&
    topOwnedNamedArtist !== topNamedCurated.label;

  highlights.sort((a, b) => b.weight - a.weight);

  const avgBpm =
    curatedBpms.length > 0
      ? Math.round(curatedBpms.reduce((s, n) => s + n, 0) / curatedBpms.length)
      : null;

  return {
    trackCount,
    releaseCount: curatedReleaseIds.size,
    trackPct,
    manualBpmCount,
    ratedTrackCount,
    vgPlusCount,
    topArtist,
    topArtists,
    topGenres,
    avgBpm,
    medianBpm: median(curatedBpms),
    bpmBuckets: BPM_BUCKETS.map((label) => ({
      label,
      count: bpmBuckets.get(label) ?? 0,
    })).filter((b) => b.count > 0),
    topTracks: highlights.slice(0, 8),
    preferenceGaps,
    shelfVsPicks,
  };
}