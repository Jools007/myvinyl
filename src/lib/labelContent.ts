import { resolveTrackCamelot } from './camelot';
import {
  DEFAULT_LABEL_DISPLAY,
  getPrimaryTrack,
  type LabelDisplayPrefs,
  type LabelTitleLayout,
} from './types';
import type { Track, VinylRecord } from './types';

/** Max characters saved on the record & shown on the printed label (2 lines). */
export const LABEL_DESCRIPTION_MAX = 120;

export type CrateLabelContent = {
  artist: string;
  album: string;
  titleLayout: LabelTitleLayout;
  showBpm: boolean;
  showKey: boolean;
  showVibes: boolean;
  bpm?: number;
  bpmEstimated?: boolean;
  camelot?: string;
  keyEstimated?: boolean;
  vibes: string[];
  description: string;
  format?: string;
  year?: string;
};

export function resolveLabelDisplayPrefs(
  record: VinylRecord,
  override?: LabelDisplayPrefs
): Required<LabelDisplayPrefs> {
  return {
    ...DEFAULT_LABEL_DISPLAY,
    ...record.labelDisplay,
    ...override,
  };
}

export function clampLabelDescription(text: string): string {
  return text.slice(0, LABEL_DESCRIPTION_MAX);
}

export function formatLabelVibes(track: Track | null, record: VinylRecord): string[] {
  const fromTrack = track?.vibeTags ?? [];
  if (fromTrack.length) return fromTrack.slice(0, 3);

  const fromAll = [...new Set(record.tracks.flatMap((t) => t.vibeTags ?? []))].slice(0, 3);
  if (fromAll.length) return fromAll;

  return record.genres.slice(0, 2);
}

/** Auto text when the user has not written custom label notes. */
export function labelDescriptionFallback(record: VinylRecord): string {
  const parts: string[] = [];
  if (record.format?.trim()) parts.push(record.format.trim());
  if (record.year?.trim()) parts.push(record.year.trim());
  if (record.genres.length) parts.push(record.genres.slice(0, 2).join(', '));
  return parts.join(' · ');
}

/** Text shown on the label: custom notes, or fallback metadata. */
export function resolveLabelDescription(
  record: VinylRecord,
  notesDraft?: string
): string {
  const custom = (notesDraft !== undefined ? notesDraft : record.notes)?.trim();
  if (custom) return clampLabelDescription(custom);
  return labelDescriptionFallback(record);
}

export function buildCrateLabelContent(
  record: VinylRecord,
  opts?: {
    description?: string;
    /** When true, show draft text only (no auto fallback) — modal live preview */
    useDescriptionDraft?: boolean;
    /** When set with useVibesDraft, preview shows these tags (max 3) */
    vibes?: string[];
    useVibesDraft?: boolean;
    /** Live override for sticker layout (modal editor). */
    display?: LabelDisplayPrefs;
    useDisplayDraft?: boolean;
  }
): CrateLabelContent {
  const track = getPrimaryTrack(record);
  const { code, estimated: keyEstimated } = resolveTrackCamelot(track);
  const display = resolveLabelDisplayPrefs(
    record,
    opts?.useDisplayDraft ? opts.display : undefined
  );

  const description = opts?.useDescriptionDraft
    ? clampLabelDescription(opts.description ?? '')
    : resolveLabelDescription(record, opts?.description);

  const vibes = opts?.useVibesDraft
    ? (opts.vibes ?? []).slice(0, 3)
    : formatLabelVibes(track, record);

  return {
    artist: record.artist.trim() || 'Unknown artist',
    album: record.title.trim() || 'Untitled',
    titleLayout: display.titleLayout,
    showBpm: display.showBpm,
    showKey: display.showKey,
    showVibes: display.showVibes,
    bpm: track?.bpm,
    bpmEstimated: track?.bpmEstimated && !track?.bpmManual && !track?.bpmTapped,
    camelot: code,
    keyEstimated,
    vibes,
    description,
    format: record.format?.trim(),
    year: record.year?.trim(),
  };
}