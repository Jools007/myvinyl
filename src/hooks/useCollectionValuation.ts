import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchCollectionValuation,
  type CollectionValuation,
  type ValuationFetchProgress,
} from '../lib/collectionValuation';
import type { VinylRecord } from '../lib/types';

export type ValuationState =
  | { status: 'idle' }
  | { status: 'loading'; progress: ValuationFetchProgress }
  | { status: 'ready'; data: CollectionValuation }
  | { status: 'error'; message: string }
  | { status: 'unavailable'; message: string };

export function useCollectionValuation(records: VinylRecord[]) {
  const [state, setState] = useState<ValuationState>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const linkedCount = records.filter((r) => r.discogsId != null).length;
  const valuationKey = useMemo(
    () =>
      records
        .filter((r) => r.discogsId != null)
        .map((r) => `${r.id}:${r.discogsId}:${r.condition}`)
        .sort()
        .join('|'),
    [records]
  );

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (linkedCount === 0) {
      setState({
        status: 'unavailable',
        message: 'Link releases to Discogs to estimate marketplace value.',
      });
      return;
    }

    setState({ status: 'loading', progress: { done: 0, total: linkedCount } });

    try {
      const data = await fetchCollectionValuation(records, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (!controller.signal.aborted) {
            setState({ status: 'loading', progress });
          }
        },
      });

      if (controller.signal.aborted) return;

      if (data.valuedCount === 0) {
        setState({
          status: 'unavailable',
          message: 'No Discogs price data returned for your linked releases yet.',
        });
        return;
      }

      setState({ status: 'ready', data });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : 'Valuation failed';
      setState({ status: 'error', message });
    }
  }, [linkedCount, records]);

  useEffect(() => {
    if (linkedCount === 0) {
      setState({
        status: 'unavailable',
        message: 'Link releases to Discogs to estimate marketplace value.',
      });
      return;
    }
    void load();
    return () => abortRef.current?.abort();
  }, [valuationKey, linkedCount, load]);

  return {
    state,
    linkedCount,
    refresh: load,
  };
}