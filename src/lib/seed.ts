import { generateId } from './storage';
import { createPrimaryTrack } from './tracks';
import type { VinylRecord } from './types';

function demo(
  partial: Omit<VinylRecord, 'id' | 'addedAt' | 'tracks'> & {
    bpm?: number;
    camelotKey?: string;
    vibeTags?: string[];
  }
): VinylRecord {
  const { bpm, camelotKey, vibeTags, ...release } = partial;
  return {
    ...release,
    id: generateId(),
    addedAt: new Date().toISOString(),
    tracks: [
      createPrimaryTrack(release.title, {
        bpm,
        camelotKey,
        vibeTags: vibeTags ?? [],
      }),
    ],
  };
}

export const DEMO_RECORDS: VinylRecord[] = [
  demo({
    artist: 'Daft Punk',
    title: 'Discovery',
    year: '2001',
    bpm: 123,
    camelotKey: '8B',
    genres: ['House', 'Electronic'],
    vibeTags: ['Uplifting', 'Melodic'],
    condition: 'NM',
    notes: 'Perfect opener for a soulful house set.',
  }),
  demo({
    artist: 'Moodymann',
    title: 'Silentintroduction',
    year: '1997',
    bpm: 124,
    camelotKey: '7A',
    genres: ['Deep House', 'Detroit'],
    vibeTags: ['Deep', 'Late-night', 'Soulful'],
    condition: 'VG+',
  }),
  demo({
    artist: 'Miles Davis',
    title: 'Kind of Blue',
    year: '1959',
    bpm: 92,
    camelotKey: '3A',
    genres: ['Jazz', 'Modal'],
    vibeTags: ['Late-night', 'Warm-up'],
    condition: 'VG+',
  }),
  demo({
    artist: 'Derrick May',
    title: 'Innovator',
    year: '1998',
    bpm: 128,
    camelotKey: '8A',
    genres: ['Techno', 'Detroit'],
    vibeTags: ['Hypnotic', 'Peak-time'],
    condition: 'NM',
    lastPlayedAt: new Date(Date.now() - 3600000).toISOString(),
  }),
  demo({
    artist: 'Aretha Franklin',
    title: 'I Never Loved a Man',
    year: '1967',
    bpm: 88,
    camelotKey: '5B',
    genres: ['Soul', 'R&B'],
    vibeTags: ['Groovy', 'Sunset'],
    condition: 'VG',
  }),
  demo({
    artist: 'Floating Points',
    title: 'Promises',
    year: '2021',
    bpm: 72,
    camelotKey: '2A',
    genres: ['Ambient', 'Jazz'],
    vibeTags: ['Deep', 'Melodic'],
    condition: 'Mint',
  }),
];