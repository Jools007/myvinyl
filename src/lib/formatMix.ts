/** Human-readable BPM / mix copy — avoids float artifacts in the UI. */

export function roundBpm(n: number): number {
  return Math.round(n * 10) / 10;
}

export function formatBpmValue(bpm: number): string {
  const r = roundBpm(bpm);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function formatBpmDelta(delta: number): string {
  const d = roundBpm(delta);
  if (Math.abs(d) < 0.05) return '0';
  return d > 0 ? `+${formatBpmValue(d)}` : formatBpmValue(d);
}

export function formatBpmGap(abs: number): string {
  return formatBpmValue(Math.abs(roundBpm(abs)));
}