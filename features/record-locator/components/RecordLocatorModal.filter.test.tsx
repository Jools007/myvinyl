// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGoogleFetch } from '../server/googleFetch';
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
    'fixture-intercept',
    { latitude: 51.5, longitude: -0.12, radiusMeters: 8000 },
    { fetchFn: createGoogleFetch('fixture') }
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
    expect(screen.getAllByTestId(/^record-locator-card-/).length).toBe(3);

    fireEvent.click(screen.getByTestId('record-locator-open-now-filter'));

    await waitFor(() => expect(screen.getAllByTestId(/^record-locator-card-/).length).toBe(2));
    expect(screen.getByText(/2 shop/)).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('record-locator-map-pane')).toBeTruthy());
  });

  it('shows store detail when a shop card is selected', async () => {
    render(<RecordLocatorModal onClose={() => undefined} />);

    await waitFor(() => expect(screen.getByTestId('record-locator-shop-list')).toBeTruthy());
    const firstCard = screen.getAllByTestId(/^record-locator-card-/)[0];
    const mainButton = firstCard.querySelector('.record-locator-card__main');
    expect(mainButton).toBeTruthy();
    fireEvent.click(mainButton!);

    await waitFor(() => expect(screen.getByTestId('record-locator-store-detail')).toBeTruthy());
  });
});