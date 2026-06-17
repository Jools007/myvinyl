import { resolveTrackCamelot } from './camelot';
import {
  DEFAULT_LABEL_DISPLAY,
  getPrimaryTrack,
  type LabelDisplayPrefs,
  type LabelTitleLayout,
} from './types';
import type { Track, VinylRecord } from './types';

/** Max characters saved for sticker copy (canvas may fit slightly less per layout). */
export const LABEL_DESCRIPTION_MAX = 340;

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
  /** Sticker description (manual, album blurb, or metadata fallback). */
  customNotes: string;
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

/** Trim sticker copy at a sentence boundary when possible. */
export function truncateAtSentenceBoundary(text: string, maxLen: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;

  const slice = trimmed.slice(0, maxLen);
  const lastStop = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
    slice.lastIndexOf('; ')
  );
  if (lastStop >= Math.floor(maxLen * 0.45)) {
    return slice.slice(0, lastStop + 1).trim();
  }

  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace >= Math.floor(maxLen * 0.6)) {
    return `${slice.slice(0, lastSpace).trim()}…`;
  }

  return `${slice.trim()}…`;
}

export function clampLabelDescription(text: string): string {
  return truncateAtSentenceBoundary(text, LABEL_DESCRIPTION_MAX);
}

export function formatLabelVibes(track: Track | null, record: VinylRecord): string[] {
  const fromTrack = track?.vibeTags ?? [];
  if (fromTrack.length) return fromTrack.slice(0, 3);

  const fromAll = [...new Set(record.tracks.flatMap((t) => t.vibeTags ?? []))].slice(0, 3);
  if (fromAll.length) return fromAll;

  return record.genres.slice(0, 2);
}

/** Metadata line when no album blurb is available (format · year · genres). */
export function labelMetadataFallback(record: VinylRecord): string {
  const parts: string[] = [];
  if (record.format?.trim()) parts.push(record.format.trim());
  if (record.year?.trim()) parts.push(record.year.trim());
  if (record.genres.length) parts.push(record.genres.slice(0, 2).join(', '));
  return parts.join(' · ');
}

/** Default sticker copy before any manual override (album blurb, else metadata). */
export function resolveDefaultStickerDescription(
  record: VinylRecord,
  baseDescription?: string
): string {
  const album = baseDescription?.trim();
  if (album) return clampLabelDescription(album);
  const meta = labelMetadataFallback(record).trim();
  return meta ? clampLabelDescription(meta) : '';
}

/** Sticker text: manual override, else album description, else metadata, else blank. */
export function resolveStickerDescription(
  record: VinylRecord,
  opts?: {
    description?: string;
    useDescriptionDraft?: boolean;
    baseDescription?: string;
  }
): string {
  const manual = (
    opts?.useDescriptionDraft
      ? opts.description
      : opts?.description !== undefined
        ? opts.description
        : record.labelDescription
  )?.trim();
  if (manual) return clampLabelDescription(manual);

  return resolveDefaultStickerDescription(record, opts?.baseDescription);
}

export function buildCrateLabelContent(
  record: VinylRecord,
  opts?: {
    description?: string;
    /** When true, prefer live draft text; empty draft still falls back to default copy. */
    useDescriptionDraft?: boolean;
    /** When set with useVibesDraft, preview shows these tags (max 3) */
    vibes?: string[];
    useVibesDraft?: boolean;
    /** Live override for sticker layout (modal editor). */
    display?: LabelDisplayPrefs;
    useDisplayDraft?: boolean;
    /** Album description from Discogs / Last.fm when no manual sticker copy. */
    baseDescription?: string;
  }
): CrateLabelContent {
  const track = getPrimaryTrack(record);
  const { code, estimated: keyEstimated } = resolveTrackCamelot(track);
  const display = resolveLabelDisplayPrefs(
    record,
    opts?.useDisplayDraft ? opts.display : undefined
  );

  const stickerText = resolveStickerDescription(record, {
    description: opts?.description,
    useDescriptionDraft: opts?.useDescriptionDraft,
    baseDescription: opts?.baseDescription,
  });

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
    description: stickerText,
    customNotes: stickerText,
    format: record.format?.trim(),
    year: record.year?.trim(),
  };
}