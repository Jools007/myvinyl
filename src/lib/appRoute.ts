import type { NavPage } from '../components/Navigation';
import { PERSONAL_CRATE_SLUG } from './collectionContext';
import { isPersistedRecordId } from './records';
import type { PlaySelection } from './playSession';

export interface AppLocation {
  page: NavPage;
  playSelection: PlaySelection | null;
  releaseId: string | null;
  releaseEdit: boolean;
  /** Guest crate slug from /crates/:slug — null means personal crate. */
  crateSlug: string | null;
}

const PAGE_PATHS: Record<NavPage, string> = {
  collection: '/collection',
  insights: '/insights',
  play: '/play',
  labels: '/labels',
};

const PATH_TO_PAGE: Record<string, NavPage> = {
  '/': 'collection',
  '/collection': 'collection',
  '/insights': 'insights',
  '/play': 'play',
  '/labels': 'labels',
};

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim() || '/';
  if (trimmed.length > 1 && trimmed.endsWith('/')) {
    return trimmed.slice(0, -1);
  }
  return trimmed;
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isValidRecordId(value: string): boolean {
  return isPersistedRecordId(value) || /^mv_\d+_[a-z0-9]+$/i.test(value);
}

function isValidTrackId(value: string): boolean {
  return isValidRecordId(value);
}

export function parseAppLocation(
  pathnameInput: string,
  searchInput = ''
): AppLocation {
  const pathname = normalizePathname(pathnameInput);
  const segments = pathname.split('/').filter(Boolean);

  let page: NavPage = PATH_TO_PAGE[pathname] ?? 'collection';
  let playSelection: PlaySelection | null = null;
  let crateSlug: string | null = null;

  const params = new URLSearchParams(
    searchInput.startsWith('?') ? searchInput.slice(1) : searchInput
  );
  const crateFromQuery = params.get('crate')?.trim();

  if (segments[0] === 'crates' && segments[1]) {
    page = 'collection';
    const raw = decodeSegment(segments[1]);
    crateSlug = raw === PERSONAL_CRATE_SLUG ? null : raw;
  } else if (crateFromQuery) {
    const raw = decodeSegment(crateFromQuery);
    crateSlug = raw === PERSONAL_CRATE_SLUG ? null : raw;
  } else if (segments[0] === 'play') {
    page = 'play';
    if (segments.length >= 3) {
      const recordId = decodeSegment(segments[1]);
      const trackId = decodeSegment(segments[2]);
      if (isValidRecordId(recordId) && isValidTrackId(trackId)) {
        playSelection = { recordId, trackId };
      }
    }
  } else if (!PATH_TO_PAGE[pathname]) {
    page = 'collection';
  }

  const releaseIdRaw = params.get('release')?.trim() ?? '';
  const releaseId = releaseIdRaw && isValidRecordId(releaseIdRaw) ? releaseIdRaw : null;
  const releaseEdit = releaseId != null && params.get('edit') === '1';

  return { page, playSelection, releaseId, releaseEdit, crateSlug };
}

export function readAppLocation(): AppLocation {
  if (typeof window === 'undefined') {
    return {
      page: 'collection',
      playSelection: null,
      releaseId: null,
      releaseEdit: false,
      crateSlug: null,
    };
  }
  return parseAppLocation(window.location.pathname, window.location.search);
}

export function currentAppHref(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}`;
}

export function playSelectionsEqual(
  a: PlaySelection | null | undefined,
  b: PlaySelection | null | undefined
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.recordId === b.recordId && a.trackId === b.trackId;
}

export function locationsEqual(a: AppLocation, b: AppLocation): boolean {
  return (
    a.page === b.page &&
    a.releaseId === b.releaseId &&
    a.releaseEdit === b.releaseEdit &&
    a.crateSlug === b.crateSlug &&
    playSelectionsEqual(a.playSelection, b.playSelection)
  );
}

export function buildAppHref(location: AppLocation): string {
  let pathname = PAGE_PATHS[location.page];

  if (location.page === 'collection' && location.crateSlug) {
    pathname = `/crates/${encodeURIComponent(location.crateSlug)}`;
  } else if (location.page === 'play' && location.playSelection) {
    const { recordId, trackId } = location.playSelection;
    pathname = `/play/${encodeURIComponent(recordId)}/${encodeURIComponent(trackId)}`;
  }

  const params = new URLSearchParams();
  if (location.releaseId) {
    params.set('release', location.releaseId);
    if (location.releaseEdit) params.set('edit', '1');
  }

  if (location.crateSlug && location.page !== 'collection') {
    params.set('crate', location.crateSlug);
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function locationForPage(
  page: NavPage,
  options?: {
    playSelection?: PlaySelection | null;
    releaseId?: string | null;
    releaseEdit?: boolean;
    crateSlug?: string | null;
  }
): AppLocation {
  return {
    page,
    playSelection: page === 'play' ? (options?.playSelection ?? null) : null,
    releaseId: options?.releaseId ?? null,
    releaseEdit: options?.releaseEdit ?? false,
    crateSlug: options?.crateSlug ?? null,
  };
}

export function playDocumentTitle(
  artist: string,
  trackTitle: string,
  releaseTitle?: string
): string {
  const base = `${trackTitle} · ${artist}`;
  return releaseTitle ? `${base} — ${releaseTitle} | MyVinyl` : `${base} | MyVinyl`;
}

export function pageDocumentTitle(page: NavPage): string {
  const labels: Record<NavPage, string> = {
    collection: 'Collection',
    insights: 'Insights',
    play: 'Play',
    labels: 'Labels',
  };
  return `${labels[page]} | MyVinyl`;
}