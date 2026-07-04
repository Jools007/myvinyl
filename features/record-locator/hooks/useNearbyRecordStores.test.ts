// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleRecordStores } from '../testFixtures';
import { useNearbyRecordStores } from './useNearbyRecordStores';

afterEach(() => {
  vi.restoreAllMocks();
});

const testPosition = { latitude: 51.5, longitude: -0.12 };

describe('useNearbyRecordStores', () => {
  it('POSTs to the shipped places proxy and stores the API response', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo, init?: RequestInit) => {
      expect(String(_input)).toBe('/api/record-locator/places');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body)) as { latitude: number; longitude: number };
      expect(body.latitude).toBe(51.5);
      expect(body.longitude).toBe(-0.12);
      return new Response(
        JSON.stringify({
          stores: sampleRecordStores,
          meta: { source: 'osm', locationLabel: 'Vilnius, Lithuania · 54.6872°, 25.2797°' },
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ position }) => useNearbyRecordStores(position),
      { initialProps: { position: null as typeof testPosition | null } }
    );
    rerender({ position: testPosition });

    await waitFor(() => expect(result.current.state.status).toBe('success'));
    if (result.current.state.status !== 'success') throw new Error('expected success');
    expect(result.current.state.stores).toHaveLength(3);
    expect(result.current.state.stores[0].name).toBe('Open Vinyl');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces API errors from the proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'No record stores found near your location.' }), {
          status: 502,
        })
      )
    );

    const { result, rerender } = renderHook(
      ({ position }) => useNearbyRecordStores(position),
      { initialProps: { position: null as typeof testPosition | null } }
    );
    rerender({ position: testPosition });

    await waitFor(() => expect(result.current.state.status).toBe('error'));
    if (result.current.state.status !== 'error') throw new Error('expected error');
    expect(result.current.state.message).toContain('No record stores found');
  });
});