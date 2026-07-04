import { describe, expect, it } from 'vitest';
import type { RecordStore } from '../types';
import { filterOpenNowStores } from './openNow';

const store = (id: string, openNow?: boolean, openingHoursSummary?: string): RecordStore => ({
  id,
  name: id,
  address: '1 High St',
  latitude: 51.5,
  longitude: -0.12,
  distanceMeters: 100,
  openNow,
  openingHoursSummary,
});

describe('filterOpenNowStores', () => {
  it('keeps stores with openNow true', () => {
    const stores = [store('a', true), store('b', false), store('c', undefined), store('d', true)];
    const filtered = filterOpenNowStores(stores);
    expect(filtered.map((s) => s.id)).toEqual(['a', 'd']);
  });

  it('evaluates OSM opening hours when openNow is missing', () => {
    const saturdayAfternoon = new Date('2026-07-04T15:46:00');
    const stores = [
      store('open', undefined, 'Mo-Sa 10:00-19:00'),
      store('closed', undefined, 'Mo-Fr 10:00-18:00'),
      store('unknown', undefined, 'by appointment'),
    ];
    const filtered = filterOpenNowStores(stores, saturdayAfternoon);
    expect(filtered.map((s) => s.id)).toEqual(['open']);
  });
});