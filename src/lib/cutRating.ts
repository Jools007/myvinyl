import type { CutRating, VinylRecord } from './types';

export type CutRatingFilter = CutRating | 'rated' | 'unrated';

export const CUT_RATINGS: CutRating[] = ['G', 'VG', 'VG+'];

export const CUT_RATING_LABELS: Record<CutRating, string> = {
  G: 'Good',
  VG: 'Very good',
  'VG+': 'Very very good',
};

export type TrackRatingOption = {
  value: '' | CutRating;
  label: string;
  hint?: string;
};

/** Track-level rating picker options (blank is valid). */
export const TRACK_RATING_OPTIONS: TrackRatingOption[] = [
  { value: '', label: '—', hint: 'No rating' },
  { value: 'G', label: 'G', hint: CUT_RATING_LABELS.G },
  { value: 'VG', label: 'VG', hint: CUT_RATING_LABELS.VG },
  { value: 'VG+', label: 'VG+', hint: CUT_RATING_LABELS['VG+'] },
];

export function cutRatingFromValue(value: string): CutRating | undefined {
  if (value === 'G' || value === 'VG' || value === 'VG+') return value;
  return undefined;
}

export function recordMatchesCutRatingFilter(
  record: VinylRecord,
  filter: CutRatingFilter | null | undefined
): boolean {
  if (!filter) return true;
  const tracks = record.tracks;
  if (filter === 'rated') return tracks.some((t) => t.cutRating != null);
  if (filter === 'unrated') return tracks.every((t) => t.cutRating == null);
  return tracks.some((t) => t.cutRating === filter);
}

export function cutRatingFilterLabel(filter: CutRatingFilter): string {
  if (filter === 'rated') return 'Any rated';
  if (filter === 'unrated') return 'Unrated';
  return filter;
}

export function ratingTierClass(rating?: CutRating): string {
  if (!rating) return 'track-rating--none';
  if (rating === 'G') return 'track-rating--g';
  if (rating === 'VG') return 'track-rating--vg';
  return 'track-rating--vgplus';
}