import { resolveTrackCamelot, CAMELOT_KEYS } from './camelot';
import {
  countReleasesNeedingMetadata,
  countTracksNeedingMetadata,
  isPrimaryTrackEnriched,
} from './fullMetadataEnrichment';
import { normalizeFormat, normalizeGenre } from './filterLabels';
import { isReleaseFullyEnriched } from './tracks';
import { getPrimaryTrack, type RecordCondition, type VinylRecord } from './types';

export type ChartItem = { label: string; count: number };

export type CamelotWheelCell = {
  code: string;
  count: number;
  intensity: number;
};

export type ScatterPoint = {
  year: number;
  bpm: number;
  label: string;
  id: string;
};

export type TreemapCell = {
  label: string;
  count: number;
  share: number;
};

export type RadarAxis = {
  label: string;
  value: number;
  max: number;
};

export type EnrichmentTier = {
  id: 'primary' | 'tracks' | 'full';
  label: string;
  value: number;
  detail: string;
};

export type InsightFilterAction = {
  query?: string;
  format?: string | null;
  genre?: string | null;
  condition?: RecordCondition | null;
  vibe?: string | null;
  bpmRangeId?: string;
  camelotKey?: string | null;
};

export type InsightAction = 'filter' | 'enrich-metadata' | 'enrich-tracklists';

export type ActionableInsight = {
  id: string;
  title: string;
  body: string;
  tone: 'accent' | 'warm' | 'neutral';
  action?: InsightAction;
  filter?: InsightFilterAction;
};

export type CollectionInsights = {
  releaseCount: number;
  trackCount: number;
  artistCount: number;
  genreCount: number;
  yearRange: string | null;
  oldestYear: number | null;
  newestYear: number | null;
  medianYear: number | null;
  avgTracksPerRelease: number;
  mintCount: number;
  mintPct: number;
  withBpmCount: number;
  withKeyCount: number;
  tracksWithBpm: number;
  tracksWithKey: number;
  tracksWithMetadata: number;
  trackMetadataPct: number;
  primaryEnrichedCount: number;
  primaryEnrichmentPct: number;
  fullyEnrichedCount: number;
  enrichmentPct: number;
  releasesNeedingMetadata: number;
  tracksNeedingMetadata: number;
  enrichmentTiers: EnrichmentTier[];
  discogsLinkedCount: number;
  manualAddCount: number;
  importAddCount: number;
  avgBpm: number | null;
  medianBpm: number | null;
  bpmSpread: number | null;
  playedCount: number;
  playedPct: number;
  energyLabel: string;
  dominantDecade: string | null;
  topArtist: { name: string; count: number } | null;
  topGenre: { name: string; count: number } | null;
  topCamelot: { code: string; count: number } | null;
  topArtists: ChartItem[];
  topGenres: ChartItem[];
  formatCounts: ChartItem[];
  decadeCounts: ChartItem[];
  bpmBuckets: ChartItem[];
  conditionCounts: ChartItem[];
  keyCounts: ChartItem[];
  vibeCounts: ChartItem[];
  camelotWheel: CamelotWheelCell[];
  scatterPoints: ScatterPoint[];
  genreTreemap: TreemapCell[];
  vibeRadar: RadarAxis[];
  actionableInsights: ActionableInsight[];
};

export type GenreGroup = {
  genre: string;
  records: VinylRecord[];
};

const DONUT_PALETTE = [
  'var(--accent)',
  '#7c6fe0',
  '#e07b54',
  '#5b9fd4',
  '#c97b4a',
  '#6bc9a8',
  '#d4a574',
  '#9b8fd4',
];

export function chartColor(index: number): string {
  return DONUT_PALETTE[index % DONUT_PALETTE.length];
}

function decadeLabel(year: number): string {
  return `${Math.floor(year / 10) * 10}s`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function toChartItems(map: Map<string, number>, limit = 8): ChartItem[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function bpmRangeIdForValue(bpm: number): string {
  if (bpm < 100) return 'slow';
  if (bpm < 120) return 'mid';
  if (bpm < 130) return 'dance';
  return 'fast';
}

function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

function harmonicNeighbors(code: string): string[] {
  const m = code.match(/^(\d+)([AB])$/);
  if (!m) return [];
  const num = parseInt(m[1], 10);
  const letter = m[2];
  const other = letter === 'A' ? 'B' : 'A';
  const prev = num === 1 ? 12 : num - 1;
  const next = num === 12 ? 1 : num + 1;
  return [`${num}${other}`, `${prev}${letter}`, `${next}${letter}`];
}

export function groupRecordsByGenre(records: VinylRecord[]): GenreGroup[] {
  const map = new Map<string, VinylRecord[]>();

  for (const record of records) {
    const genre =
      record.genres.length > 0 ? normalizeGenre(record.genres[0]) : 'Uncategorized';
    const bucket = map.get(genre) ?? [];
    bucket.push(record);
    map.set(genre, bucket);
  }

  const groups = [...map.entries()].map(([genre, rows]) => ({
    genre,
    records: [...rows].sort((a, b) => a.artist.localeCompare(b.artist)),
  }));

  groups.sort((a, b) => {
    if (a.genre === 'Uncategorized') return 1;
    if (b.genre === 'Uncategorized') return -1;
    return b.records.length - a.records.length;
  });

  return groups;
}

function buildActionableInsights(
  data: CollectionInsights,
  releaseCount: number
): ActionableInsight[] {
  const out: ActionableInsight[] = [];
  if (releaseCount === 0) return out;

  if (data.topGenre && data.topGenre.count >= 2) {
    const share = pct(data.topGenre.count, releaseCount);
    const runnerUp = data.topGenres[1];
    const concentration =
      runnerUp && share >= 35
        ? ` — nearly ${share}% of your shelf, with ${runnerUp.label} a distant second.`
        : ` — ${share}% of releases carry this tag.`;
    out.push({
      id: 'top-genre',
      title: `${data.topGenre.name} defines your sound`,
      body: `Your crate leans hard into ${data.topGenre.name.toLowerCase()}${concentration}`,
      tone: 'accent',
      action: 'filter',
      filter: { genre: data.topGenre.name },
    });
  }

  if (data.topCamelot && data.topCamelot.count >= 2) {
    const neighbors = harmonicNeighbors(data.topCamelot.code)
      .map((c) => ({ code: c, count: data.camelotWheel.find((w) => w.code === c)?.count ?? 0 }))
      .filter((n) => n.count > 0)
      .sort((a, b) => b.count - a.count)[0];
    out.push({
      id: 'top-key',
      title: `${data.topCamelot.code} is your harmonic anchor`,
      body: neighbors
        ? `${data.topCamelot.count} tracks sit on ${data.topCamelot.code}; ${neighbors.code} (${neighbors.count}) is your best mix-out neighbor for harmonic blends.`
        : `${data.topCamelot.count} tracks share ${data.topCamelot.code} — ideal for opening or closing a set in-key.`,
      tone: 'warm',
      action: 'filter',
      filter: { camelotKey: data.topCamelot.code },
    });
  }

  if (data.avgBpm != null && data.bpmSpread != null) {
    const rangeId = bpmRangeIdForValue(data.avgBpm);
    const spreadNote =
      data.bpmSpread >= 25
        ? `Wide tempo range (${data.bpmSpread} BPM spread) — you can bridge chill and peak-time.`
        : data.bpmSpread <= 12
          ? `Tight tempo cluster (±${Math.round(data.bpmSpread / 2)} BPM) — cohesive crate for single-energy sets.`
          : `Balanced tempo spread for versatile programming.`;
    out.push({
      id: 'tempo-profile',
      title: `${data.energyLabel} · ${data.avgBpm} BPM avg`,
      body: spreadNote,
      tone: 'accent',
      action: rangeId !== 'all' ? 'filter' : undefined,
      filter: rangeId !== 'all' ? { bpmRangeId: rangeId } : undefined,
    });
  }

  if (data.dominantDecade) {
    const decade = data.decadeCounts.find((d) => d.label === data.dominantDecade);
    const gaps = data.decadeCounts.filter((d) => d.count === 0).map((d) => d.label);
    if (decade && decade.count >= 2) {
      out.push({
        id: 'dominant-decade',
        title: `${data.dominantDecade} is your golden era`,
        body:
          gaps.length > 0 && gaps.length <= 3
            ? `${decade.count} releases from the ${data.dominantDecade}; gaps in ${gaps.join(', ')} — room to diversify.`
            : `${decade.count} releases anchor your collection in the ${data.dominantDecade}.`,
        tone: 'neutral',
      });
    }
  }

  if (data.releasesNeedingMetadata > 0 && data.primaryEnrichmentPct < 95) {
    out.push({
      id: 'enrichment-metadata',
      title: `${data.tracksNeedingMetadata} tracks missing BPM or key`,
      body: `Primary tracks: ${data.primaryEnrichmentPct}% ready · All tracks: ${data.trackMetadataPct}% · Full disc: ${data.enrichmentPct}%. Run metadata enrichment to unlock DJ filters and harmonic maps.`,
      tone: 'warm',
      action: 'enrich-metadata',
    });
  } else if (data.releasesNeedingMetadata > 0 && data.enrichmentPct < 50) {
    out.push({
      id: 'enrichment-deep',
      title: `${data.releasesNeedingMetadata} releases need deeper enrichment`,
      body: `Every primary track has tempo & key, but only ${data.enrichmentPct}% of releases have full disc metadata. Enrich all tracks for complete crate analytics.`,
      tone: 'warm',
      action: 'enrich-metadata',
    });
  }

  if (data.playedPct < 20 && releaseCount >= 10) {
    out.push({
      id: 'unplayed',
      title: `${100 - data.playedPct}% still waiting on the turntable`,
      body: `Only ${data.playedCount} of ${releaseCount} releases marked played — fire up Play Mode and work through the backlog.`,
      tone: 'neutral',
    });
  }

  if (data.topArtist && data.topArtist.count >= 3) {
    out.push({
      id: 'top-artist',
      title: `Deep cut: ${data.topArtist.name}`,
      body: `${data.topArtist.count} releases — more than any other artist in your library.`,
      tone: 'neutral',
    });
  }

  const topVibe = data.vibeCounts[0];
  if (topVibe && topVibe.count >= 3) {
    out.push({
      id: 'vibe-signature',
      title: `"${topVibe.label}" runs through your crates`,
      body: `${topVibe.count} track tags — tap to filter releases carrying this energy.`,
      tone: 'accent',
      action: 'filter',
      filter: { vibe: topVibe.label },
    });
  }

  return out.slice(0, 6);
}

export function computeCollectionInsights(records: VinylRecord[]): CollectionInsights {
  const artists = new Map<string, number>();
  const genres = new Map<string, number>();
  const formats = new Map<string, number>();
  const decades = new Map<string, number>();
  const conditions = new Map<string, number>();
  const keys = new Map<string, number>();
  const camelotRaw = new Map<string, number>();
  const vibes = new Map<string, number>();
  const bpmBuckets = new Map<string, number>([
    ['Under 100', 0],
    ['100–119', 0],
    ['120–129', 0],
    ['130+', 0],
  ]);

  const years: number[] = [];
  const trackBpms: number[] = [];
  const releaseBpms: number[] = [];
  const scatterPoints: ScatterPoint[] = [];
  let trackCount = 0;
  let mintCount = 0;
  let withBpmCount = 0;
  let withKeyCount = 0;
  let tracksWithBpm = 0;
  let tracksWithKey = 0;
  let tracksWithMetadata = 0;
  let primaryEnrichedCount = 0;
  let fullyEnrichedCount = 0;
  let discogsLinkedCount = 0;
  let manualAddCount = 0;
  let importAddCount = 0;
  let playedCount = 0;

  for (const record of records) {
    trackCount += record.tracks.length;
    const artistKey = record.artist.trim();
    if (artistKey) artists.set(artistKey, (artists.get(artistKey) ?? 0) + 1);

    for (const g of record.genres) {
      const genre = normalizeGenre(g);
      genres.set(genre, (genres.get(genre) ?? 0) + 1);
    }

    if (record.format) {
      const fmt = normalizeFormat(record.format);
      formats.set(fmt, (formats.get(fmt) ?? 0) + 1);
    }

    const yearNum = record.year ? parseInt(String(record.year), 10) : NaN;
    const hasYear = !Number.isNaN(yearNum);

    if (hasYear) {
      years.push(yearNum);
      decades.set(decadeLabel(yearNum), (decades.get(decadeLabel(yearNum)) ?? 0) + 1);
    }

    if (record.condition) {
      conditions.set(record.condition, (conditions.get(record.condition) ?? 0) + 1);
    }
    if (record.condition === 'Mint' || record.condition === 'NM') mintCount += 1;
    if (record.lastPlayedAt) playedCount += 1;
    if (record.discogsId) discogsLinkedCount += 1;
    if (record.addSource === 'discogs-import') importAddCount += 1;
    else manualAddCount += 1;

    if (isReleaseFullyEnriched(record)) fullyEnrichedCount += 1;
    if (isPrimaryTrackEnriched(record)) primaryEnrichedCount += 1;

    const primary = getPrimaryTrack(record);
    if (primary?.bpm != null) {
      withBpmCount += 1;
      releaseBpms.push(primary.bpm);
      if (hasYear) {
        scatterPoints.push({
          year: yearNum,
          bpm: primary.bpm,
          label: `${record.artist} — ${primary.title}`,
          id: record.id,
        });
      }
    }
    if (primary && resolveTrackCamelot(primary).code) withKeyCount += 1;

    for (const track of record.tracks) {
      if (track.bpm != null) {
        tracksWithBpm += 1;
        trackBpms.push(track.bpm);
      }
      const camelot = resolveTrackCamelot(track).code;
      if (camelot) {
        tracksWithKey += 1;
        keys.set(camelot, (keys.get(camelot) ?? 0) + 1);
        camelotRaw.set(camelot, (camelotRaw.get(camelot) ?? 0) + 1);
      }
      if (track.bpm != null && camelot) tracksWithMetadata += 1;
      for (const tag of track.vibeTags) {
        const label = tag.charAt(0).toUpperCase() + tag.slice(1);
        vibes.set(label, (vibes.get(label) ?? 0) + 1);
      }
    }

    if (primary?.bpm != null) {
      const bpm = primary.bpm;
      if (bpm < 100) bpmBuckets.set('Under 100', (bpmBuckets.get('Under 100') ?? 0) + 1);
      else if (bpm < 120) bpmBuckets.set('100–119', (bpmBuckets.get('100–119') ?? 0) + 1);
      else if (bpm < 130) bpmBuckets.set('120–129', (bpmBuckets.get('120–129') ?? 0) + 1);
      else bpmBuckets.set('130+', (bpmBuckets.get('130+') ?? 0) + 1);
    }
  }

  const topArtistEntry = [...artists.entries()].sort((a, b) => b[1] - a[1])[0];
  const topGenreEntry = [...genres.entries()].sort((a, b) => b[1] - a[1])[0];
  const topCamelotEntry = [...camelotRaw.entries()].sort((a, b) => b[1] - a[1])[0];
  const topDecadeEntry = [...decades.entries()].sort((a, b) => b[1] - a[1])[0];

  let yearRange: string | null = null;
  let oldestYear: number | null = null;
  let newestYear: number | null = null;
  if (years.length > 0) {
    oldestYear = Math.min(...years);
    newestYear = Math.max(...years);
    yearRange = oldestYear === newestYear ? String(oldestYear) : `${oldestYear}–${newestYear}`;
  }

  const avgBpm =
    trackBpms.length > 0
      ? Math.round(trackBpms.reduce((sum, n) => sum + n, 0) / trackBpms.length)
      : releaseBpms.length > 0
        ? Math.round(releaseBpms.reduce((sum, n) => sum + n, 0) / releaseBpms.length)
        : null;

  const medianBpm = median(trackBpms.length ? trackBpms : releaseBpms);
  const bpmValues = trackBpms.length ? trackBpms : releaseBpms;
  const bpmSpread =
    bpmValues.length >= 2
      ? Math.max(...bpmValues) - Math.min(...bpmValues)
      : null;

  let energyLabel = 'Eclectic selector';
  if (avgBpm != null) {
    if (avgBpm >= 128) energyLabel = 'Peak-time velocity';
    else if (avgBpm >= 118) energyLabel = 'Dancefloor ready';
    else if (avgBpm >= 100) energyLabel = 'Head-nod tempo';
    else energyLabel = 'Late-night deep';
  }

  const releaseCount = records.length;
  const maxCamelot = Math.max(1, ...camelotRaw.values(), 0);

  const camelotWheel: CamelotWheelCell[] = CAMELOT_KEYS.map((code) => {
    const count = camelotRaw.get(code) ?? 0;
    return { code, count, intensity: count / maxCamelot };
  });

  const genreTreemap: TreemapCell[] = toChartItems(genres, 10).map((item) => ({
    label: item.label,
    count: item.count,
    share: pct(item.count, releaseCount || 1),
  }));

  const maxVibe = Math.max(1, ...vibes.values(), 0);
  const vibeRadar: RadarAxis[] = toChartItems(vibes, 6).map((item) => ({
    label: item.label,
    value: item.count,
    max: maxVibe,
  }));

  const primaryEnrichmentPct = pct(primaryEnrichedCount, releaseCount);
  const trackMetadataPct = pct(tracksWithMetadata, trackCount || 1);
  const enrichmentPct = pct(fullyEnrichedCount, releaseCount);

  const enrichmentTiers: EnrichmentTier[] = [
    {
      id: 'primary',
      label: 'Primary tracks',
      value: primaryEnrichmentPct,
      detail: `${primaryEnrichedCount} of ${releaseCount} releases with BPM & key on lead track`,
    },
    {
      id: 'tracks',
      label: 'All tracks',
      value: trackMetadataPct,
      detail: `${tracksWithMetadata} of ${trackCount} tracks with BPM & key`,
    },
    {
      id: 'full',
      label: 'Full disc',
      value: enrichmentPct,
      detail: `${fullyEnrichedCount} of ${releaseCount} releases fully enriched`,
    },
  ];

  const base: CollectionInsights = {
    releaseCount,
    trackCount,
    artistCount: artists.size,
    genreCount: groupRecordsByGenre(records).length,
    yearRange,
    oldestYear,
    newestYear,
    medianYear: median(years),
    avgTracksPerRelease:
      releaseCount > 0 ? Math.round((trackCount / releaseCount) * 10) / 10 : 0,
    mintCount,
    mintPct: pct(mintCount, releaseCount),
    withBpmCount,
    withKeyCount,
    tracksWithBpm,
    tracksWithKey,
    tracksWithMetadata,
    trackMetadataPct,
    primaryEnrichedCount,
    primaryEnrichmentPct,
    fullyEnrichedCount,
    enrichmentPct,
    releasesNeedingMetadata: countReleasesNeedingMetadata(records),
    tracksNeedingMetadata: countTracksNeedingMetadata(records),
    enrichmentTiers,
    discogsLinkedCount,
    manualAddCount,
    importAddCount,
    avgBpm,
    medianBpm,
    bpmSpread,
    playedCount,
    playedPct: pct(playedCount, releaseCount),
    energyLabel,
    dominantDecade: topDecadeEntry?.[0] ?? null,
    topArtist: topArtistEntry ? { name: topArtistEntry[0], count: topArtistEntry[1] } : null,
    topGenre: topGenreEntry ? { name: topGenreEntry[0], count: topGenreEntry[1] } : null,
    topCamelot: topCamelotEntry ? { code: topCamelotEntry[0], count: topCamelotEntry[1] } : null,
    topArtists: toChartItems(artists, 6),
    topGenres: toChartItems(genres, 8),
    formatCounts: toChartItems(formats, 6),
    decadeCounts: [...decades.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, count]) => ({ label, count })),
    bpmBuckets: [...bpmBuckets.entries()]
      .filter(([, count]) => count > 0)
      .map(([label, count]) => ({ label, count })),
    conditionCounts: toChartItems(conditions, 7),
    keyCounts: toChartItems(keys, 8),
    vibeCounts: toChartItems(vibes, 10),
    camelotWheel,
    scatterPoints: scatterPoints.slice(0, 120),
    genreTreemap,
    vibeRadar,
    actionableInsights: [],
  };

  base.actionableInsights = buildActionableInsights(base, releaseCount);
  return base;
}

/** PDF export compatibility — intro copy from insights snapshot. */
export function buildInsightsIntroParagraphs(
  insights: CollectionInsights,
  collectionName: string,
  curatorName?: string
): string[] {
  if (insights.releaseCount === 0) return [];

  const who = curatorName?.trim() || 'This collector';
  const paragraphs: string[] = [
    `${collectionName} spans ${insights.releaseCount} releases and ${insights.trackCount} tracks across ${insights.artistCount} artists.`,
  ];

  if (insights.yearRange) {
    paragraphs.push(
      `Pressings run from ${insights.yearRange}${insights.medianYear ? ` (median ${insights.medianYear})` : ''}.`
    );
  }

  if (insights.avgBpm != null) {
    paragraphs.push(
      `${who}'s crate averages ${insights.avgBpm} BPM — ${insights.energyLabel.toLowerCase()}.`
    );
  }

  if (insights.topGenre) {
    paragraphs.push(
      `${insights.topGenre.name} is the dominant lane (${insights.topGenre.count} releases).`
    );
  }

  return paragraphs;
}