// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleRecordStores } from '../testFixtures';
import { useWalkingRoute } from './useWalkingRoute';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useWalkingRoute', () => {
  it('POSTs selected stores to the routes proxy and returns ordered legs', async () => {
    const route = {
      orderedStoreIds: ['places/open-vinyl', 'places/open-crate'],
      totalDistanceMeters: 1200,
      totalDurationSeconds: 900,
      legs: [
        {
          fromName: 'You',
          toName: 'Open Vinyl',
          distanceMeters: 320,
          durationSeconds: 240,
          steps: ['Head north on Groove Lane'],
        },
        {
          fromName: 'Open Vinyl',
          toName: 'Open Crate',
          distanceMeters: 880,
          durationSeconds: 660,
          steps: ['Turn right on Wax Street'],
        },
      ],
    };

    const fetchMock = vi.fn(async (_input: RequestInfo, init?: RequestInit) => {
      expect(String(_input)).toBe('/api/record-locator/routes');
      const body = JSON.parse(String(init?.body)) as { selectedStoreIds: string[] };
      expect(body.selectedStoreIds).toEqual(['places/open-vinyl', 'places/open-crate']);
      return new Response(JSON.stringify({ route }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useWalkingRoute());

    await act(async () => {
      await result.current.computeRoute(
        { latitude: 51.5, longitude: -0.12 },
        sampleRecordStores,
        ['places/open-vinyl', 'places/open-crate']
      );
    });

    await waitFor(() => expect(result.current.state.status).toBe('success'));
    if (result.current.state.status !== 'success') throw new Error('expected success');
    expect(result.current.state.route.legs).toHaveLength(2);
    expect(result.current.state.route.legs[0].steps[0]).toContain('Groove Lane');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});