const DISMISSED_BANNERS_KEY = 'myvinyl:guest-crate-banner-dismissed';

function readDismissedSlugs(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_BANNERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

export function isGuestCrateBannerDismissed(slug: string): boolean {
  return readDismissedSlugs().includes(slug);
}

export function dismissGuestCrateBanner(slug: string): void {
  try {
    const slugs = readDismissedSlugs();
    if (slugs.includes(slug)) return;
    localStorage.setItem(DISMISSED_BANNERS_KEY, JSON.stringify([...slugs, slug]));
  } catch {
    /* quota or private mode */
  }
}