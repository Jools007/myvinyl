import {
  fetchPriceSuggestionsCached,
  pickPriceForCondition,
  type DiscogsPriceSuggestion,
  type DiscogsPriceSuggestions,
} from './discogsPriceSuggestions';
import type { ChartItem } from './collectionInsights';
import type { RecordCondition, VinylRecord } from './types';

export type ValuedRecord = {
  recordId: string;
  discogsId: number;
  artist: string;
  title: string;
  year?: string;
  condition: RecordCondition;
  coverUrl?: string;
  primaryGenre: string;
  decade: string;
  estimate: DiscogsPriceSuggestion;
};

export type CollectionValuation = {
  currency: string;
  totalValue: number;
  valuedCount: number;
  linkedCount: number;
  skippedCount: number;
  topRecords: ValuedRecord[];
  byDecade: ChartItem[];
  byGenre: ChartItem[];
};

function decadeFromYear(year?: string): string {
  const y = year ? parseInt(year, 10) : NaN;
  if (!Number.isFinite(y) || y < 1000) return 'Unknown';
  const bucket = Math.floor(y / 10) * 10;
  return `${bucket}s`;
}

function primaryGenre(record: VinylRecord): string {
  return record.genres[0]?.trim() || 'Unknown';
}

function addToMap(map: Map<string, number>, key: string, amount: number): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function mapToChartItems(map: Map<string, number>, limit = 12): ChartItem[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count: Math.round(count * 100) / 100 }));
}

export function buildValuationFromRows(rows: ValuedRecord[]): CollectionValuation {
  const byDecade = new Map<string, number>();
  const byGenre = new Map<string, number>();
  let totalValue = 0;
  const currency = rows[0]?.estimate.currency ?? 'USD';

  for (const row of rows) {
    totalValue += row.estimate.value;
    addToMap(byDecade, row.decade, row.estimate.value);
    addToMap(byGenre, row.primaryGenre, row.estimate.value);
  }

  const topRecords = [...rows].sort((a, b) => b.estimate.value - a.estimate.value).slice(0, 10);

  return {
    currency,
    totalValue: Math.round(totalValue * 100) / 100,
    valuedCount: rows.length,
    linkedCount: rows.length,
    skippedCount: 0,
    topRecords,
    byDecade: mapToChartItems(byDecade, 10),
    byGenre: mapToChartItems(byGenre, 10),
  };
}

export type ValuationFetchProgress = {
  done: number;
  total: number;
  current?: string;
};

export async function fetchCollectionValuation(
  records: VinylRecord[],
  opts?: {
    concurrency?: number;
    delayMs?: number;
    onProgress?: (progress: ValuationFetchProgress) => void;
    signal?: AbortSignal;
  }
): Promise<CollectionValuation> {
  const linked = records.filter((r) => r.discogsId != null);
  const concurrency = Math.max(1, Math.min(3, opts?.concurrency ?? 2));
  const delayMs = opts?.delayMs ?? 1100;
  const valued: ValuedRecord[] = [];
  let done = 0;
  let lastFetchError: string | null = null;

  const queue = [...linked];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      if (opts?.signal?.aborted) return;
      const record = queue.shift();
      if (!record?.discogsId) continue;

      opts?.onProgress?.({
        done,
        total: linked.length,
        current: `${record.artist} — ${record.title}`,
      });

      try {
        const response = await fetchPriceSuggestionsCached(record.discogsId);
        const estimate = pickPriceForCondition(response.suggestions, record.condition);
        if (estimate && estimate.value > 0) {
          valued.push({
            recordId: record.id,
            discogsId: record.discogsId,
            artist: record.artist,
            title: record.title,
            year: record.year,
            condition: record.condition,
            coverUrl: record.coverUrl,
            primaryGenre: primaryGenre(record),
            decade: decadeFromYear(record.year),
            estimate,
          });
        }
      } catch (error) {
        lastFetchError = error instanceof Error ? error.message : 'Price lookup failed';
        if (/seller settings|not configured|rate limit/i.test(lastFetchError)) {
          throw error;
        }
      }

      done += 1;
      opts?.onProgress?.({ done, total: linked.length });
      if (queue.length > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
  });

  await Promise.all(workers);

  if (valued.length === 0 && lastFetchError) {
    throw new Error(lastFetchError);
  }

  const result = buildValuationFromRows(valued);
  return {
    ...result,
    linkedCount: linked.length,
    skippedCount: linked.length - valued.length,
  };
}

export function formatCurrency(amount: number, currency = 'USD', compact = false): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 1 : 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(0)}`;
  }
}

export function suggestionsSummary(suggestions: DiscogsPriceSuggestions): number | null {
  const values = Object.values(suggestions)
    .map((row) => row.value)
    .filter((v) => v > 0);
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}