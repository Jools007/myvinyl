import type { PlacesSearchRequest, RecordStore } from '../types';
import { normalizePhotonResponse, type PhotonFeature } from '../utils/photonNormalize';
import type { GoogleFetchFn } from './googleFetch';

const PHOTON_URL = 'https://photon.komoot.io/api/';
const PHOTON_QUERIES = [
  'vinyl shop',
  'record store',
  'music store',
  'vinyl records',
  'Viniloteka',
  'Muzikumas',
  'VinyloMania',
  'iMuzika',
  'Thelonious',
  'BUYMUSIC',
  'Ragainė',
  'Discotag',
  'Mint Vinetu',
];

export async function searchPhotonRecordStores(
  input: PlacesSearchRequest,
  fetchFn: GoogleFetchFn
): Promise<RecordStore[]> {
  const radius = input.radiusMeters ?? 12_000;
  const allFeatures: PhotonFeature[] = [];

  await Promise.all(
    PHOTON_QUERIES.map(async (query) => {
      const url = new URL(PHOTON_URL);
      url.searchParams.set('q', query);
      url.searchParams.set('lat', String(input.latitude));
      url.searchParams.set('lon', String(input.longitude));
      url.searchParams.set('limit', '12');
      url.searchParams.set('lang', 'en');

      try {
        const response = await fetchFn(url.toString(), {
          signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { features?: PhotonFeature[] };
        if (payload.features?.length) allFeatures.push(...payload.features);
      } catch {
        // Photon is best-effort; Overpass supplements.
      }
    })
  );

  return normalizePhotonResponse(allFeatures, {
    latitude: input.latitude,
    longitude: input.longitude,
  }, radius);
}