import { useCallback, useState } from 'react';
import type { GeoPosition, RecordStore, WalkingRoute } from '../types';

const ROUTES_API = '/api/record-locator/routes';

type RouteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; route: WalkingRoute }
  | { status: 'error'; message: string };

export function useWalkingRoute() {
  const [state, setState] = useState<RouteState>({ status: 'idle' });

  const computeRoute = useCallback(
    async (origin: GeoPosition, stores: RecordStore[], selectedStoreIds: string[]) => {
      if (selectedStoreIds.length < 2) {
        setState({
          status: 'error',
          message: 'Select at least two stores to build a walking route.',
        });
        return;
      }

      setState({ status: 'loading' });
      try {
        const response = await fetch(ROUTES_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin, stores, selectedStoreIds }),
        });
        const payload = (await response.json()) as { route?: WalkingRoute; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? `Route failed (${response.status})`);
        }
        if (!payload.route) {
          throw new Error('No route returned');
        }
        setState({ status: 'success', route: payload.route });
      } catch (error) {
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Could not compute walking route.',
        });
      }
    },
    []
  );

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, computeRoute, reset };
}