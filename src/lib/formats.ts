/** Vinyl-only formats for MyVinyl — no CDs. */
export const VINYL_FORMATS = [
  'LP',
  '12" Single',
  '7" Single',
  '10"',
  'EP',
  'Compilation',
  'Reissue',
  'Box Set',
  'Picture Disc',
  'Lathe Cut',
  'Other',
] as const;

export type VinylFormatOption = (typeof VINYL_FORMATS)[number];

const CD_FORMAT_RE = /\bCD\b/i;

/** True when a stored or Discogs format string refers to CD media. */
export function isCdFormat(format?: string | null): boolean {
  if (!format?.trim()) return false;
  return CD_FORMAT_RE.test(format.trim());
}

export function isAllowedVinylFormat(format?: string | null): boolean {
  if (!format?.trim()) return true;
  if (isCdFormat(format)) return false;
  return true;
}

/** Drop collection items that are CD (or CD-combo) releases. */
export function withoutCdRecords<T extends { format?: string }>(records: T[]): T[] {
  return records.filter((r) => !isCdFormat(r.format));
}

/** Format dropdown options: vinyl constants + user values, never CD. */
export function buildFormatFilterOptions(availableFromCollection: string[]): string[] {
  const extra = availableFromCollection.filter(
    (f) => f.trim() && !isCdFormat(f) && !VINYL_FORMATS.includes(f as VinylFormatOption)
  );
  return [...new Set([...VINYL_FORMATS, ...extra])];
}

function mapDiscogsToken(token: string): VinylFormatOption | string {
  const t = token.trim();
  const upper = t.toUpperCase();
  if (upper.includes('12') && upper.includes('SINGLE')) return '12" Single';
  if (upper.includes('7') && upper.includes('SINGLE')) return '7" Single';
  if (upper.includes('10"')) return '10"';
  if (upper.includes('EP')) return 'EP';
  if (upper.includes('COMP')) return 'Compilation';
  if (upper.includes('REISSUE')) return 'Reissue';
  if (upper.includes('BOX')) return 'Box Set';
  if (upper.includes('PICTURE')) return 'Picture Disc';
  if (upper.includes('LATHE')) return 'Lathe Cut';
  if (upper.includes('LP') || upper.includes('VINYL') || upper.includes('ALBUM')) return 'LP';
  if ((VINYL_FORMATS as readonly string[]).includes(t)) return t as VinylFormatOption;
  return 'Other';
}

/** Pick the first vinyl-appropriate format from Discogs metadata. */
export function pickVinylFormatFromDiscogs(formats?: string[]): VinylFormatOption {
  if (!formats?.length) return 'LP';
  const vinylish = formats.find((f) => !isCdFormat(f));
  if (!vinylish) return 'LP';
  const primary = vinylish.split(',')[0]?.trim() ?? vinylish;
  const mapped = mapDiscogsToken(primary);
  if ((VINYL_FORMATS as readonly string[]).includes(mapped)) {
    return mapped as VinylFormatOption;
  }
  return 'Other';
}

/** Sanitize a user-selected format before save (reject CD strings). */
export function sanitizeVinylFormat(format?: string): string | undefined {
  if (!format?.trim() || isCdFormat(format)) return undefined;
  return format.trim();
}