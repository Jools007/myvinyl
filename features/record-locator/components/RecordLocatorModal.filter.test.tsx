// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleNearbyRecordStores } from '../server/placesHandler';

vi.mock('./RecordStoreMap', () => ({
  RecordStoreMap: () => <div data-testid="record-locator-map-pane" />,
}));

import { RecordLocatorModal } from './RecordLocatorModal';

function mockGeolocation() {
  const getCurrentPosition = vi.fn((success: PositionCallback) => {
    success({
      coords: { latitude: 51.5, longitude: -0.12, accuracy: 1 },
    } as GeolocationPosition);
  });
  vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: { getCurrentPosition },
  });
}

beforeEach(async () => {
  mockGeolocation();
  const fixturePayload = await handleNearbyRecordStores(
    undefined,
    { latitude: 51.5, longitude: -0.12, radiusMeters: 8000 },
    { useFixture: true }
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo) => {
      if (String(input).includes('/api/record-locator/places')) {
        return new Response(JSON.stringify(fixturePayload), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'unexpected' }), { status: 404 });
    })
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RecordLocatorModal open-now filter', () => {
  it('renders shop list from API then reduces count when Open now is toggled', async () => {
    render(<RecordLocatorModal onClose={() => undefined} />);

    await waitFor(() => expect(screen.getByTestId('record-locator-shop-list')).toBeTruthy());
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);

    fireEvent.click(screen.getByTestId('record-locator-open-now-filter'));

    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(2));
    expect(screen.getByText(/2\s+shops/)).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('record-locator-map-pane')).toBeTruthy());
  });
});