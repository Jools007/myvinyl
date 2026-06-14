import { camelotDistance, isCompatibleKey, parseCamelot, resolveTrackCamelot } from './camelot';
import { normalizeGenre, normalizeVibe } from './filterLabels';
import { recordMatchesGroupedGenre } from './genreGroups';
import type { InsightFilterAction } from './collectionInsights';
import { scoreNextPlay } from './recommendations';
import { getPrimaryTrack } from './tracks';
import type { Track, VinylRecord } from './types';

export type InsightLens =
  | { kind: 'genre'; label: string }
  | { kind: 'format'; label: string }
  | { kind: 'camelot'; code: string }
  | { kind: 'bpm'; label: string; rangeId: string }
  | { kind: 'vibe'; label: string }
  | { kind: 'artist'; label: string }
  | { kind: 'decade'; label: string }
  | { kind: 'release'; recordId: string; label: string }
  | { kind: 'roulette'; recordId: string; quip: string }
  | { kind: 'journey'; stepIds: string[] };

export type HarmonicPartner = {
  code: string;
  relationship: string;
  trackCount: number;
};

export type MixPick = {
  record: VinylRecord;
  track: Track;
  reason: string;
};

export type JourneyStep = {
  record: VinylRecord;
  track: Track;
  role: string;
  reason: string;
};

export type RouletteResult = {
  record: VinylRecord;
  track: Track;
  quip: string;
  lens: InsightLens;
};

const BPM_BUCKET_MAP: Record<string, { rangeId: string; min?: number; max?: number }> = {
  'Under 100': { rangeId: 'slow', max: 99 },
  '100–119': { rangeId: 'mid', min: 100, max: 120 },
  '120–129': { rangeId: 'dance', min: 120, max: 130 },
  '130+': { rangeId: 'fast', min: 130 },
};

const ROULETTE_QUIPS = [
  'The crate has spoken.',
  'Trust the wax.',
  'Tonight\'s opener?',
  'Deep cut unlocked.',
  'The turntable wants this one.',
  'Forgotten gem — spin it.',
];

function decadeFromYear(year: number): string {
  return `${Math.floor(year / 10) * 10}s`;
}

function primaryBpm(record: VinylRecord): number | undefined {
  return getPrimaryTrack(record)?.bpm ?? undefined;
}

function recordMatchesBpmBucket(record: VinylRecord, label: string): boolean {
  const bucket = BPM_BUCKET_MAP[label];
  if (!bucket) return false;
  const bpm = primaryBpm(record);
  if (bpm == null) return false;
  if (bucket.min != null && bpm < bucket.min) return false;
  if (bucket.max != null && bpm > bucket.max) return false;
  return true;
}

function recordHasCamelot(record: VinylRecord, code: string): boolean {
  return record.tracks.some((t) => resolveTrackCamelot(t).code === code);
}

function recordHasVibe(record: VinylRecord, vibe: string): boolean {
  const v = vibe.toLowerCase();
  const primary = getPrimaryTrack(record);
  return (
    (primary?.vibeTags ?? []).some((t) => normalizeVibe(t).toLowerCase() === v) ||
    record.genres.some((g) => normalizeGenre(g).toLowerCase() === v)
  );
}

export function getHarmonicPartners(code: string, wheelCounts: Map<string, number>): HarmonicPartner[] {
  const pa = parseCamelot(code);
  if (!pa) return [];

  const other = pa.letter === 'A' ? 'B' : 'A';
  const prev = pa.num === 1 ? 12 : pa.num - 1;
  const next = pa.num === 12 ? 1 : pa.num + 1;

  const candidates: { code: string; relationship: string }[] = [
    { code: `${pa.num}${other}`, relationship: 'Relative key' },
    { code: `${prev}${pa.letter}`, relationship: 'Mix down (−1)' },
    { code: `${next}${pa.letter}`, relationship: 'Energy up (+1)' },
  ];

  return candidates
    .map((c) => ({
      ...c,
      trackCount: wheelCounts.get(c.code) ?? 0,
    }))
    .sort((a, b) => b.trackCount - a.trackCount);
}

export function isHarmonicPartner(selected: string, candidate: string): boolean {
  return camelotDistance(selected, candidate) <= 2 && selected !== candidate;
}

export function filterRecordsByLens(records: VinylRecord[], lens: InsightLens): VinylRecord[] {
  switch (lens.kind) {
    case 'genre':
      return records.filter((r) => recordMatchesGroupedGenre(r, lens.label));
    case 'format':
      return records.filter((r) => r.format === lens.label);
    case 'camelot':
      return records.filter((r) => recordHasCamelot(r, lens.code));
    case 'bpm':
      return records.filter((r) => recordMatchesBpmBucket(r, lens.label));
    case 'vibe':
      return records.filter((r) => recordHasVibe(r, lens.label));
    case 'artist':
      return records.filter((r) => r.artist.trim() === lens.label);
    case 'decade':
      return records.filter((r) => {
        const y = r.year ? parseInt(String(r.year), 10) : NaN;
        return !Number.isNaN(y) && decadeFromYear(y) === lens.label;
      });
    case 'release':
    case 'roulette':
      return records.filter((r) => r.id === lens.recordId);
    case 'journey':
      return records.filter((r) => lens.stepIds.includes(r.id));
    default:
      return records;
  }
}

export function lensToFilterPatch(lens: InsightLens): InsightFilterAction | null {
  switch (lens.kind) {
    case 'genre':
      return { genre: lens.label };
    case 'format':
      return { format: lens.label };
    case 'camelot':
      return { camelotKey: lens.code };
    case 'bpm':
      return { bpmRangeId: lens.rangeId };
    case 'vibe':
      return { vibe: lens.label };
    case 'artist':
      return { query: lens.label };
    case 'release':
    case 'roulette':
      return { query: lens.kind === 'release' ? lens.label.split(' — ')[0] : undefined };
    default:
      return null;
  }
}

export function getMixPicks(records: VinylRecord[], camelotCode: string, limit = 5): MixPick[] {
  const picks: MixPick[] = [];

  for (const record of records) {
    for (const track of record.tracks) {
      const code = resolveTrackCamelot(track).code;
      if (!code || !isCompatibleKey(camelotCode, code) || code === camelotCode) continue;

      const dist = camelotDistance(camelotCode, code);
      let reason = `Harmonic blend · ${code}`;
      if (dist === 1) reason = `Relative key · ${code}`;
      else if (dist === 2) reason = `Adjacent on wheel · ${code}`;

      picks.push({ record, track, reason });
    }
  }

  picks.sort((a, b) => {
    const da = camelotDistance(camelotCode, resolveTrackCamelot(a.track).code);
    const db = camelotDistance(camelotCode, resolveTrackCamelot(b.track).code);
    return da - db;
  });

  const seen = new Set<string>();
  const out: MixPick[] = [];
  for (const pick of picks) {
    if (seen.has(pick.record.id)) continue;
    seen.add(pick.record.id);
    out.push(pick);
    if (out.length >= limit) break;
  }
  return out;
}

export function buildCrateJourney(records: VinylRecord[], length = 4): JourneyStep[] | null {
  const enriched = records.filter((r) => {
    const t = getPrimaryTrack(r);
    return t && t.bpm != null && resolveTrackCamelot(t).code;
  });
  if (enriched.length < 2) return null;

  const seed = enriched[Math.floor(Math.random() * enriched.length)];
  const seedTrack = getPrimaryTrack(seed)!;
  const roles = ['Warm up', 'Build', 'Peak', 'Land'];
  const steps: JourneyStep[] = [
    {
      record: seed,
      track: seedTrack,
      role: roles[0],
      reason: `Opens at ${seedTrack.bpm} BPM · ${resolveTrackCamelot(seedTrack).code}`,
    },
  ];

  let anchor = { record: seed, track: seedTrack };
  const used = new Set([seed.id]);

  while (steps.length < length && steps.length < enriched.length) {
    let best: { record: VinylRecord; track: Track; score: number } | null = null;

    for (const record of enriched) {
      if (used.has(record.id)) continue;
      const track = getPrimaryTrack(record);
      if (!track) continue;
      const score = scoreNextPlay(anchor, record, track);
      if (score <= 0) continue;
      if (!best || score > best.score) best = { record, track, score };
    }

    if (!best) break;

    const anchorKey = resolveTrackCamelot(anchor.track).code;
    const key = resolveTrackCamelot(best.track).code;
    const reasons: string[] = [];
    if (anchorKey && key && isCompatibleKey(anchorKey, key)) {
      reasons.push(`In-key → ${key}`);
    }
    if (anchor.track.bpm != null && best.track.bpm != null) {
      const delta = best.track.bpm - anchor.track.bpm;
      if (Math.abs(delta) <= 3) reasons.push(`Smooth ${best.track.bpm} BPM`);
      else if (delta > 0) reasons.push(`+${delta} BPM lift`);
      else reasons.push(`${delta} BPM cool-down`);
    }

    steps.push({
      record: best.record,
      track: best.track,
      role: roles[steps.length] ?? 'Ride',
      reason: reasons.join(' · ') || 'Energy flow',
    });

    used.add(best.record.id);
    anchor = { record: best.record, track: best.track };
  }

  return steps.length >= 2 ? steps : null;
}

export type RouletteBias = 'any' | 'unplayed' | 'deep-cut';

export function spinCrateRoulette(records: VinylRecord[], bias: RouletteBias = 'any'): RouletteResult | null {
  let pool = records.filter((r) => getPrimaryTrack(r));

  if (bias === 'unplayed') {
    const unplayed = pool.filter((r) => !r.lastPlayedAt);
    if (unplayed.length > 0) pool = unplayed;
  } else if (bias === 'deep-cut') {
    const artistCounts = new Map<string, number>();
    for (const r of pool) {
      const a = r.artist.trim();
      if (a) artistCounts.set(a, (artistCounts.get(a) ?? 0) + 1);
    }
    const deep = pool.filter((r) => (artistCounts.get(r.artist.trim()) ?? 0) === 1);
    if (deep.length > 0) pool = deep;
  }

  if (pool.length === 0) return null;

  const record = pool[Math.floor(Math.random() * pool.length)];
  const track = getPrimaryTrack(record)!;
  const key = resolveTrackCamelot(track).code;
  const quipBase = ROULETTE_QUIPS[Math.floor(Math.random() * ROULETTE_QUIPS.length)];

  let quip = quipBase;
  if (!record.lastPlayedAt) quip = `${quipBase} Never spun.`;
  else if (track.bpm != null && track.bpm >= 128) quip = `${quipBase} Peak-time pick.`;
  else if (key) quip = `${quipBase} Key ${key}.`;

  return {
    record,
    track,
    quip,
    lens: {
      kind: 'roulette',
      recordId: record.id,
      quip,
    },
  };
}

export function describeLens(lens: InsightLens, matchCount: number): { title: string; subtitle: string } {
  switch (lens.kind) {
    case 'genre':
      return {
        title: lens.label,
        subtitle: `${matchCount} release${matchCount === 1 ? '' : 's'} in this lane — dig in or build a set.`,
      };
    case 'format':
      return {
        title: lens.label,
        subtitle: `${matchCount} on the shelf in this format.`,
      };
    case 'camelot': {
      return {
        title: `Key ${lens.code}`,
        subtitle: `${matchCount} track${matchCount === 1 ? '' : 's'} — explore mix partners below.`,
      };
    }
    case 'bpm':
      return {
        title: lens.label,
        subtitle: `${matchCount} releases in this tempo zone.`,
      };
    case 'vibe':
      return {
        title: lens.label,
        subtitle: `${matchCount} releases carrying this energy.`,
      };
    case 'artist':
      return {
        title: lens.label,
        subtitle: `${matchCount} release${matchCount === 1 ? '' : 's'} from this artist in your crate.`,
      };
    case 'decade':
      return {
        title: lens.label,
        subtitle: `${matchCount} pressings from the ${lens.label}.`,
      };
    case 'release':
      return {
        title: lens.label,
        subtitle: 'Tap play or queue — or filter the collection to this pick.',
      };
    case 'roulette':
      return {
        title: `${lens.quip}`,
        subtitle: 'The crate roulette picked this one. Feeling lucky?',
      };
    case 'journey':
      return {
        title: 'Your crate journey',
        subtitle: `${lens.stepIds.length} tracks chained by key & tempo — queue the full ride.`,
      };
    default:
      return { title: 'Explore', subtitle: '' };
  }
}

export function lensPreviewRecords(
  records: VinylRecord[],
  lens: InsightLens,
  limit = 6
): VinylRecord[] {
  return filterRecordsByLens(records, lens).slice(0, limit);
}

export function bpmBucketLens(label: string): InsightLens | null {
  const bucket = BPM_BUCKET_MAP[label];
  if (!bucket) return null;
  return { kind: 'bpm', label, rangeId: bucket.rangeId };
}