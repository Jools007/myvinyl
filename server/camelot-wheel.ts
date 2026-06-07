/** Camelot codes one step on the wheel (for estimated key variety). */
const WHEEL_NEIGHBORS: Record<string, string[]> = {
  '1A': ['12A', '2A', '1B'],
  '2A': ['1A', '3A', '2B'],
  '3A': ['2A', '4A', '3B'],
  '4A': ['3A', '5A', '4B'],
  '5A': ['4A', '6A', '5B'],
  '6A': ['5A', '7A', '6B'],
  '7A': ['6A', '8A', '7B'],
  '8A': ['7A', '9A', '8B'],
  '9A': ['8A', '10A', '9B'],
  '10A': ['9A', '11A', '10B'],
  '11A': ['10A', '12A', '11B'],
  '12A': ['11A', '1A', '12B'],
  '1B': ['12B', '2B', '1A'],
  '2B': ['1B', '3B', '2A'],
  '3B': ['2B', '4B', '3A'],
  '4B': ['3B', '5B', '4A'],
  '5B': ['4B', '6B', '5A'],
  '6B': ['5B', '7B', '6A'],
  '7B': ['6B', '8B', '7A'],
  '8B': ['7B', '9B', '8A'],
  '9B': ['8B', '10B', '9A'],
  '10B': ['9B', '11B', '10A'],
  '11B': ['10B', '12B', '11A'],
  '12B': ['11B', '1B', '12A'],
};

export function hashTrackSeed(artist: string, title: string): number {
  const s = `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Pick a harmonically related estimated key — stable per track, varied across an album. */
export function pickEstimatedCamelotFromPool(
  baseKey: string,
  artist: string,
  title: string,
  usedKeys: string[] = []
): string {
  const base = baseKey.match(/^\d{1,2}[AB]$/i)?.[0].toUpperCase();
  if (!base) return baseKey;

  const pool = [base, ...(WHEEL_NEIGHBORS[base] ?? [])];
  const start = hashTrackSeed(artist, title) % pool.length;

  for (let i = 0; i < pool.length; i++) {
    const key = pool[(start + i) % pool.length];
    const repeats = usedKeys.filter((k) => k.toUpperCase() === key).length;
    if (repeats === 0) return key;
  }

  for (let i = 0; i < pool.length; i++) {
    const key = pool[(start + i) % pool.length];
    if (usedKeys.filter((k) => k.toUpperCase() === key).length < 2) return key;
  }

  return pool[start];
}