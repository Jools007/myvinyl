import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyTap,
  formatTapBpm,
  TAP_BPM_DEFAULTS,
  type TapBpmComputeResult,
} from '../lib/tapBpm';

export type TapBpmState = {
  bpm: number | null;
  /** Formatted for display (1 decimal when needed) */
  bpmLabel: string | null;
  tapCount: number;
  isActive: boolean;
};

export function useTapBpm() {
  const tapsRef = useRef<number[]>([]);
  const [state, setState] = useState<TapBpmState>({
    bpm: null,
    bpmLabel: null,
    tapCount: 0,
    isActive: false,
  });

  const syncFromResult = useCallback((result: TapBpmComputeResult) => {
    setState({
      bpm: result.bpm,
      bpmLabel: result.bpm != null ? formatTapBpm(result.bpm) : null,
      tapCount: result.tapCount,
      isActive: true,
    });
  }, []);

  const reset = useCallback(() => {
    tapsRef.current = [];
    setState({ bpm: null, bpmLabel: null, tapCount: 0, isActive: false });
  }, []);

  const tap = useCallback(() => {
    const now = performance.now();
    const { taps, result } = applyTap(tapsRef.current, now);
    tapsRef.current = taps;
    syncFromResult(result);
  }, [syncFromResult]);

  const setBpm = useCallback((bpm: number) => {
    const rounded = Math.round(bpm * 10) / 10;
    if (rounded < TAP_BPM_DEFAULTS.minBpm || rounded > TAP_BPM_DEFAULTS.maxBpm) return;
    setState((s) => ({
      ...s,
      bpm: rounded,
      bpmLabel: formatTapBpm(rounded),
      isActive: true,
      tapCount: Math.max(s.tapCount, TAP_BPM_DEFAULTS.minTaps),
    }));
  }, []);

  useEffect(() => {
    if (!state.isActive || state.tapCount === 0) return;
    const id = window.setTimeout(() => {
      const last = tapsRef.current.at(-1) ?? 0;
      if (performance.now() - last >= TAP_BPM_DEFAULTS.maxGapMs) {
        setState((s) => ({ ...s, isActive: false }));
      }
    }, TAP_BPM_DEFAULTS.maxGapMs + 50);
    return () => window.clearTimeout(id);
  }, [state.isActive, state.tapCount]);

  return { ...state, tap, setBpm, reset };
}