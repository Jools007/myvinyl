/**
 * Tap tempo — aligned with Pioneer DJM / AlphaTheta guidance:
 * tap at least twice on the beat; each further tap refines BPM from tap intervals.
 * @see https://support.alphatheta.com/en-US/articles/4409702438553
 */

export const TAP_BPM_DEFAULTS = {
  /** Pioneer: minimum two taps before BPM is set */
  minTaps: 2,
  /** Reset session if gap exceeds ~2 slow beats */
  maxGapMs: 2500,
  /** Keep enough history for a stable rolling average */
  maxTapsInSession: 24,
  minBpm: 40,
  maxBpm: 200,
} as const;

export type TapBpmComputeResult = {
  bpm: number | null;
  tapCount: number;
  /** Session was reset before applying this tap (long gap) */
  sessionReset: boolean;
};

function intervalsMs(taps: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < taps.length; i++) {
    out.push(taps[i] - taps[i - 1]);
  }
  return out;
}

/** Drop the single worst outlier once we have enough samples. */
function trimmedMeanMs(intervals: number[]): number {
  if (intervals.length === 0) return 0;
  if (intervals.length < 4) {
    return intervals.reduce((a, b) => a + b, 0) / intervals.length;
  }

  const median = [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length / 2)]!;
  const sorted = [...intervals].sort(
    (a, b) => Math.abs(a - median) - Math.abs(b - median)
  );
  const trimmed = sorted.slice(0, -1);
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}

export function formatTapBpm(bpm: number): string {
  return Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(1);
}

export function computeTapBpmFromTimes(
  tapTimesMs: number[],
  options: Partial<typeof TAP_BPM_DEFAULTS> = {}
): TapBpmComputeResult {
  const cfg = { ...TAP_BPM_DEFAULTS, ...options };
  const tapCount = tapTimesMs.length;

  if (tapCount < cfg.minTaps) {
    return { bpm: null, tapCount, sessionReset: false };
  }

  const gaps = intervalsMs(tapTimesMs);
  const avgMs = trimmedMeanMs(gaps);
  if (avgMs <= 0) {
    return { bpm: null, tapCount, sessionReset: false };
  }

  const raw = 60000 / avgMs;
  const bpm = Math.round(raw * 10) / 10;

  if (bpm < cfg.minBpm || bpm > cfg.maxBpm) {
    return { bpm: null, tapCount, sessionReset: false };
  }

  return { bpm, tapCount, sessionReset: false };
}

/** Apply one tap; returns updated tap timeline and BPM. */
export function applyTap(
  previousTaps: number[],
  nowMs: number,
  options: Partial<typeof TAP_BPM_DEFAULTS> = {}
): { taps: number[]; result: TapBpmComputeResult } {
  const cfg = { ...TAP_BPM_DEFAULTS, ...options };
  let sessionReset = false;
  let taps = previousTaps;

  if (taps.length > 0 && nowMs - taps[taps.length - 1]! > cfg.maxGapMs) {
    taps = [];
    sessionReset = true;
  }

  taps = [...taps, nowMs];
  if (taps.length > cfg.maxTapsInSession) {
    taps = taps.slice(-cfg.maxTapsInSession);
  }

  const result = computeTapBpmFromTimes(taps, cfg);
  return { taps, result: { ...result, sessionReset } };
}