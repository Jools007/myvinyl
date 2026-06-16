import { useCallback, useEffect, useRef, useState } from 'react';
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

const VALUATION_DELAY_MS = 1000;

export function useCollectionValuation(records: VinylRecord[]) {
  const [state, setState] = useState<ValuationState>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const fetchingRef = useRef(false);
  const recordsRef = useRef(records);
  recordsRef.current = records;

  const linkedCount = records.filter((r) => r.discogsId != null).length;

  useEffect(() => {
    if (linkedCount === 0) {
      abortRef.current?.abort();
      fetchingRef.current = false;
      setState({
        status: 'unavailable',
        message: 'Link releases to Discogs to estimate marketplace value.',
      });
      return;
    }

    setState((prev) => {
      if (prev.status === 'unavailable') return { status: 'idle' };
      return prev;
    });
  }, [linkedCount]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const refresh = useCallback(async () => {
    if (fetchingRef.current) return;

    const currentRecords = recordsRef.current;
    const linked = currentRecords.filter((r) => r.discogsId != null);
    if (linked.length === 0) {
      setState({
        status: 'unavailable',
        message: 'Link releases to Discogs to estimate marketplace value.',
      });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    fetchingRef.current = true;

    setState({
      status: 'loading',
      progress: { done: 0, total: linked.length, label: `Fetching 1 of ${linked.length}…` },
    });

    try {
      const data = await fetchCollectionValuation(currentRecords, {
        delayMs: VALUATION_DELAY_MS,
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
          status: 'error',
          message: 'No Discogs price data returned for your linked releases.',
        });
        return;
      }

      setState({ status: 'ready', data });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : 'Valuation failed';
      setState({ status: 'error', message });
    } finally {
      if (abortRef.current === controller) {
        fetchingRef.current = false;
      }
    }
  }, []);

  return {
    state,
    linkedCount,
    refresh,
    isFetching: fetchingRef.current || state.status === 'loading',
  };
}