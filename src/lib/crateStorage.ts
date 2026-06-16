const ACTIVE_CRATE_SLUG_KEY = 'myvinyl:active-crate-slug';

export function loadActiveCrateSlug(): string | null {
  try {
    const raw = localStorage.getItem(ACTIVE_CRATE_SLUG_KEY);
    return raw?.trim() || null;
  } catch {
    return null;
  }
}

export function saveActiveCrateSlug(slug: string | null): void {
  try {
    if (!slug) {
      localStorage.removeItem(ACTIVE_CRATE_SLUG_KEY);
      return;
    }
    localStorage.setItem(ACTIVE_CRATE_SLUG_KEY, slug);
  } catch {
    // ignore
  }
}