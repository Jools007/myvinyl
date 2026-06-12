import { useCallback, useEffect, useRef, useState } from 'react';

const TAP_WINDOW_MS = 3000;
const MIN_TAPS = 4;
const MAX_TAP_GAP_MS = 2000;

export type TapBpmState = {
  bpm: number | null;
  tapCount: number;
  isActive: boolean;
};

export function useTapBpm() {
  const tapsRef = useRef<number[]>([]);
  const [state, setState] = useState<TapBpmState>({
    bpm: null,
    tapCount: 0,
    isActive: false,
  });

  const reset = useCallback(() => {
    tapsRef.current = [];
    setState({ bpm: null, tapCount: 0, isActive: false });
  }, []);

  const tap = useCallback(() => {
    const now = Date.now();
    const taps = tapsRef.current.filter((t) => now - t < TAP_WINDOW_MS);
    if (taps.length > 0 && now - taps[taps.length - 1] > MAX_TAP_GAP_MS) {
      taps.length = 0;
    }
    taps.push(now);
    tapsRef.current = taps;

    if (taps.length < MIN_TAPS) {
      setState({ bpm: null, tapCount: taps.length, isActive: true });
      return;
    }

    const intervals: number[] = [];
    for (let i = 1; i < taps.length; i++) {
      intervals.push(taps[i] - taps[i - 1]);
    }
    const recent = intervals.slice(-(MIN_TAPS - 1));
    const avgMs = recent.reduce((a, b) => a + b, 0) / recent.length;
    const bpm = Math.round(60000 / avgMs);

    setState({
      bpm: bpm >= 60 && bpm <= 200 ? bpm : null,
      tapCount: taps.length,
      isActive: true,
    });
  }, []);

  useEffect(() => {
    if (!state.isActive || state.tapCount === 0) return;
    const id = window.setTimeout(() => {
      if (Date.now() - (tapsRef.current.at(-1) ?? 0) >= TAP_WINDOW_MS) {
        setState((s) => ({ ...s, isActive: false }));
      }
    }, TAP_WINDOW_MS + 50);
    return () => window.clearTimeout(id);
  }, [state.isActive, state.tapCount]);

  return { ...state, tap, reset };
}