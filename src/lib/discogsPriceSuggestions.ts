import type { RecordCondition } from './types';

export type DiscogsPriceSuggestion = {
  currency: string;
  value: number;
};

export type DiscogsPriceSuggestions = Record<string, DiscogsPriceSuggestion>;

export type PriceSuggestionsResponse = {
  releaseId: number;
  suggestions: DiscogsPriceSuggestions;
  currency: string;
};

const CONDITION_TO_DISCOGS: Record<RecordCondition, string[]> = {
  Mint: ['Mint (M)', 'Mint'],
  NM: ['Near Mint (NM or M-)', 'Near Mint (NM)', 'Near Mint'],
  'VG+': ['Very Good Plus (VG+)', 'Very Good Plus'],
  VG: ['Very Good (VG)', 'Very Good'],
  'G+': ['Good Plus (G+)', 'Good Plus'],
  G: ['Good (G)', 'Good'],
  P: ['Poor (P)', 'Poor'],
};

const FALLBACK_CONDITION_ORDER = [
  'Near Mint (NM or M-)',
  'Very Good Plus (VG+)',
  'Very Good (VG)',
  'Mint (M)',
  'Good Plus (G+)',
  'Good (G)',
  'Fair (F)',
  'Poor (P)',
];

export function pickPriceForCondition(
  suggestions: DiscogsPriceSuggestions,
  condition: RecordCondition
): DiscogsPriceSuggestion | null {
  const aliases = CONDITION_TO_DISCOGS[condition] ?? [];
  for (const key of aliases) {
    const hit = suggestions[key];
    if (hit?.value != null) return hit;
  }

  for (const key of FALLBACK_CONDITION_ORDER) {
    const hit = suggestions[key];
    if (hit?.value != null) return hit;
  }

  const first = Object.values(suggestions).find((row) => row.value > 0);
  return first ?? null;
}

export function medianPrice(suggestions: DiscogsPriceSuggestions): DiscogsPriceSuggestion | null {
  const values = Object.values(suggestions)
    .map((row) => row.value)
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  const value =
    values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
  const currency = Object.values(suggestions)[0]?.currency ?? 'USD';
  return { currency, value };
}

export async function fetchPriceSuggestions(releaseId: number): Promise<PriceSuggestionsResponse> {
  const params = new URLSearchParams({ releaseId: String(releaseId) });
  const res = await fetch(`/api/discogs/price-suggestions?${params}`);
  const data = (await res.json()) as PriceSuggestionsResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Price suggestions failed (${res.status})`);
  }
  return data;
}

const CACHE_KEY = 'myvinyl:price-suggestions:v1';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

type CacheRow = {
  fetchedAt: number;
  suggestions: DiscogsPriceSuggestions;
  currency: string;
};

type CacheStore = Record<string, CacheRow>;

function readCache(): CacheStore {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CacheStore;
  } catch {
    return {};
  }
}

function writeCache(store: CacheStore): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

export function getCachedPriceSuggestions(releaseId: number): CacheRow | null {
  const row = readCache()[String(releaseId)];
  if (!row) return null;
  if (Date.now() - row.fetchedAt > CACHE_TTL_MS) return null;
  return row;
}

export function setCachedPriceSuggestions(
  releaseId: number,
  suggestions: DiscogsPriceSuggestions,
  currency: string
): void {
  const store = readCache();
  store[String(releaseId)] = { fetchedAt: Date.now(), suggestions, currency };
  writeCache(store);
}

export async function fetchPriceSuggestionsCached(
  releaseId: number
): Promise<PriceSuggestionsResponse> {
  const cached = getCachedPriceSuggestions(releaseId);
  if (cached) {
    return {
      releaseId,
      suggestions: cached.suggestions,
      currency: cached.currency,
    };
  }
  const fresh = await fetchPriceSuggestions(releaseId);
  setCachedPriceSuggestions(releaseId, fresh.suggestions, fresh.currency);
  return fresh;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}