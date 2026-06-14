import { formatBpmValue, roundBpm } from './formatMix';

export const BPM_INPUT_MIN = 40;
export const BPM_INPUT_MAX = 200;

/** Parse user input to one decimal place, or null if invalid/empty. */
export function parseBpmInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, '.');
  if (!trimmed) return null;
  if (!/^\d{1,3}(\.\d{0,1})?$/.test(trimmed)) return null;

  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;

  const rounded = roundBpm(n);
  if (rounded < BPM_INPUT_MIN || rounded > BPM_INPUT_MAX) return null;
  return rounded;
}

export function formatBpmInputValue(bpm: number): string {
  return formatBpmValue(bpm);
}