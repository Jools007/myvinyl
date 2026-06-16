const ENRICHED_GUEST_CRATES_KEY = 'myvinyl:guest-crate-enriched';
const TRACKLISTS_GUEST_CRATES_KEY = 'myvinyl:guest-crate-tracklists-complete';

function readIdList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function markIdList(key: string, crateId: string): void {
  try {
    const ids = readIdList(key);
    if (ids.includes(crateId)) return;
    localStorage.setItem(key, JSON.stringify([...ids, crateId]));
  } catch {
    /* quota or private mode */
  }
}

/** Full smart enrich done (tracklists + metadata pass). */
export function isGuestCrateEnrichmentComplete(crateId: string): boolean {
  return readIdList(ENRICHED_GUEST_CRATES_KEY).includes(crateId);
}

export function markGuestCrateEnrichmentComplete(crateId: string): void {
  markIdList(ENRICHED_GUEST_CRATES_KEY, crateId);
  markGuestCrateTracklistsComplete(crateId);
}

/** Tracklists persisted — switch guest crate off summary-only load. */
export function isGuestCrateTracklistsComplete(crateId: string): boolean {
  return readIdList(TRACKLISTS_GUEST_CRATES_KEY).includes(crateId);
}

export function markGuestCrateTracklistsComplete(crateId: string): void {
  markIdList(TRACKLISTS_GUEST_CRATES_KEY, crateId);
}