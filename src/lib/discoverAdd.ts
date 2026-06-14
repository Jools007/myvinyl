import type { VinylRecord } from './types';

export type DiscoverAddIntent = 'save' | 'spin';

export interface DiscoverAddPayload {
  record: Omit<VinylRecord, 'id' | 'addedAt'>;
  intent: DiscoverAddIntent;
  trackIndex: number;
}