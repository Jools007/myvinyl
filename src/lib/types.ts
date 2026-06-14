export type RecordCondition = 'Mint' | 'NM' | 'VG+' | 'VG' | 'G+' | 'G' | 'P';

/** DJ cut quality on a single track (Serato-style shorthand). */
export type CutRating = 'G' | 'VG' | 'VG+';

/** How artist/album titles appear on printed crate stickers. */
export type LabelTitleLayout = 'artist-album' | 'album-artist' | 'album-only';

/** Per-record overrides for what appears on crate labels. */
export interface LabelDisplayPrefs {
  titleLayout?: LabelTitleLayout;
  showBpm?: boolean;
  showKey?: boolean;
  showVibes?: boolean;
}

export const DEFAULT_LABEL_DISPLAY: Required<LabelDisplayPrefs> = {
  titleLayout: 'artist-album',
  showBpm: true,
  showKey: true,
  showVibes: true,
};

/** How a release entered the local collection. */
export type RecordAddSource = 'manual' | 'discogs-import';

export type StarterVibe =
  | 'soul'
  | 'jazz'
  | 'house'
  | 'hip-hop'
  | 'techno'
  | 'disco'
  | 'funk'
  | 'ambient'
  | 'latin'
  | 'reggae';

/**
 * A single track on a release. All musical / mixing metadata lives here.
 */
export interface Track {
  id: string;
  title: string;
  /** Discogs position (e.g. "A1", "B2") */
  position?: string;
  duration?: string;
  /** Track-level artist when it differs from the release artist */
  artist?: string;
  bpm?: number;
  camelotKey?: string;
  musicalKey?: string;
  /** True when BPM came from genre/wiki estimate, not audio analysis */
  bpmEstimated?: boolean;
  /** True when BPM was saved from live tap — wins over enrichment */
  bpmTapped?: boolean;
  /** True when BPM was entered manually — highest priority, never overwritten by enrich */
  bpmManual?: boolean;
  /** True when Camelot came from genre estimate, not detected key */
  keyEstimated?: boolean;
  vibeTags: string[];
  /** User-rated cut quality — optional, never set by enrichment. */
  cutRating?: CutRating;
  discogsTrackId?: number;
  /** Preferred track for single-track display (e.g. 12" A-side) */
  isPrimary?: boolean;
  /** Cached Spotify 30s preview URL (set during enrichment) */
  spotifyPreviewUrl?: string;
  /** Verified Spotify track id for this catalog row (exact match) */
  spotifyTrackId?: string;
}

/**
 * A physical release in the collection (LP, EP, 12", 7", etc.).
 * `VinylRecord` is the app’s name for this shape; it maps to catalog `Release` + ownership fields.
 */
export interface VinylRecord {
  id: string;
  discogsId?: number;
  artist: string;
  title: string;
  year?: string;
  format?: string;
  coverUrl?: string;
  genres: string[];
  condition: RecordCondition;
  notes?: string;
  /** Optional sticker layout overrides (title order, BPM/key/vibe visibility). */
  labelDisplay?: LabelDisplayPrefs;
  tracks: Track[];
  /** Denormalized: last time any track on this copy was marked played */
  lastPlayedAt?: string;
  addedAt: string;
  /** `discogs-import` = bulk Discogs collection import; otherwise manual/search adds */
  addSource?: RecordAddSource;
}

/** Track at id */
export function trackById(release: VinylRecord, trackId: string): Track | undefined {
  return release.tracks.find((t) => t.id === trackId);
}

/** Primary track (`isPrimary`), or first track; null if none */
export function getPrimaryTrack(record: VinylRecord): Track | null {
  if (!record.tracks?.length) return null;
  return record.tracks.find((t) => t.isPrimary) ?? record.tracks[0] ?? null;
}

/** Legacy search shape (kept for migration) */
export interface DiscogsSearchResult {
  id: number;
  title: string;
  year: string;
  genre: string[];
  style: string[];
  thumb?: string;
  cover_image?: string;
  country?: string;
  label?: string[];
}

export interface DiscogsSearchHit {
  id: number;
  type: string;
  title: string;
  artist: string;
  year?: string;
  thumb?: string;
  cover?: string;
  genre?: string[];
  style?: string[];
  format?: string[];
  label?: string[];
  country?: string;
  resource_url?: string;
}

export type ViewMode = 'grid' | 'list' | 'shelf';

export interface AppSettings {
  starterVibe?: StarterVibe;
  theme: 'light' | 'dark' | 'system';
  viewMode: ViewMode;
  onboardingComplete: boolean;
}