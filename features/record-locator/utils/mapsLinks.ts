import type { GeoPosition, RecordStore } from '../types';

export type MapsProvider = 'apple' | 'google';

export function detectMapsProvider(): MapsProvider {
  if (typeof navigator === 'undefined') return 'google';
  const ua = navigator.userAgent;
  const isAppleMobile = /iPhone|iPad|iPod/i.test(ua);
  const isMac = /Macintosh/i.test(ua);
  if (isAppleMobile || isMac) return 'apple';
  return 'google';
}

export function mapsProviderLabel(provider: MapsProvider): string {
  return provider === 'apple' ? 'Apple Maps' : 'Google Maps';
}

export function buildDirectionsUrl(
  destination: GeoPosition,
  label: string,
  origin?: GeoPosition,
  provider: MapsProvider = detectMapsProvider()
): string {
  const encodedLabel = encodeURIComponent(label);
  const destinationParam = `${destination.latitude},${destination.longitude}`;

  if (provider === 'apple') {
    const params = new URLSearchParams({
      daddr: destinationParam,
      q: label,
    });
    if (origin) {
      params.set('saddr', `${origin.latitude},${origin.longitude}`);
    }
    return `https://maps.apple.com/?${params.toString()}`;
  }

  const params = new URLSearchParams({
    api: '1',
    query: `${destination.latitude},${destination.longitude} (${encodedLabel})`,
  });
  if (origin) {
    params.set('origin', `${origin.latitude},${origin.longitude}`);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildPlaceSearchUrl(store: RecordStore, provider: MapsProvider = detectMapsProvider()): string {
  if (store.mapsUrl && provider === 'google' && store.mapsUrl.includes('google')) {
    return store.mapsUrl;
  }

  const query = encodeURIComponent(`${store.name} ${store.address}`.trim());
  if (provider === 'apple') {
    return `https://maps.apple.com/?q=${query}&ll=${store.latitude},${store.longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}