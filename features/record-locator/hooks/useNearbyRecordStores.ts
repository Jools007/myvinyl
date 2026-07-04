import { useCallback, useEffect, useState } from 'react';
import type { GeoPosition, NearbyStoresState, RecordStore } from '../types';

const PLACES_API = '/api/record-locator/places';

export function useNearbyRecordStores(position: GeoPosition | null) {
  const [state, setState] = useState<NearbyStoresState>({ status: 'idle' });

  const fetchStores = useCallback(async (coords: GeoPosition) => {
    setState({ status: 'loading' });
    try {
      const response = await fetch(PLACES_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: coords.latitude,
          longitude: coords.longitude,
          radiusMeters: 8000,
        }),
      });

      const payload = (await response.json()) as { stores?: unknown; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Search failed (${response.status})`);
      }

      setState({
        status: 'success',
        stores: (payload.stores ?? []) as RecordStore[],
      });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Could not load record stores.',
      });
    }
  }, []);

  useEffect(() => {
    if (!position) return;
    void fetchStores(position);
  }, [position?.latitude, position?.longitude, fetchStores]);

  return { state, retry: position ? () => fetchStores(position) : undefined };
}