import { useCallback, useLayoutEffect, useState } from 'react';

export interface ThermalPreviewLayout {
  baseW: number;
  baseH: number;
  scale: number;
  displayW: number;
  displayH: number;
}

export interface ThermalPreviewTarget {
  width: number;
  height: number;
}

function measureLabelPx(widthMm: number, heightMm: number): { w: number; h: number } {
  const probe = document.createElement('div');
  probe.style.cssText = `position:fixed;left:-9999px;top:0;width:${widthMm}mm;height:${heightMm}mm;visibility:hidden;pointer-events:none;`;
  document.body.appendChild(probe);
  const w = probe.offsetWidth;
  const h = probe.offsetHeight;
  document.body.removeChild(probe);
  return { w: Math.max(w, 1), h: Math.max(h, 1) };
}

function computeScale(
  baseW: number,
  baseH: number,
  target: ThermalPreviewTarget | null
): number {
  const fallbackW = Math.min(520, Math.max(260, window.innerWidth * 0.38));
  const fallbackH = Math.min(420, Math.max(200, window.innerHeight * 0.34));
  const maxW = Math.max(120, (target?.width ?? fallbackW) - 8);
  const maxH = Math.max(100, (target?.height ?? fallbackH) - 8);
  const byW = maxW / baseW;
  const byH = maxH / baseH;
  const isDesktop = window.innerWidth >= 900;
  const maxScale = isDesktop ? 5.5 : 4;
  return Math.min(maxScale, Math.max(1.2, Math.min(byW, byH)));
}

/** Measure true label mm size in px and pick a scale that fits the target box. */
export function useThermalPreviewLayout(
  widthMm: number,
  heightMm: number,
  target: ThermalPreviewTarget | null
): ThermalPreviewLayout {
  const [layout, setLayout] = useState<ThermalPreviewLayout>({
    baseW: 151,
    baseH: 113,
    scale: 2.35,
    displayW: 355,
    displayH: 266,
  });

  const targetW = target?.width ?? null;
  const targetH = target?.height ?? null;

  const measure = useCallback(() => {
    const { w: baseW, h: baseH } = measureLabelPx(widthMm, heightMm);
    const scale = computeScale(baseW, baseH, target);
    const displayW = Math.round(baseW * scale);
    const displayH = Math.round(baseH * scale);
    setLayout((prev) => {
      if (
        prev.baseW === baseW &&
        prev.baseH === baseH &&
        prev.scale === scale &&
        prev.displayW === displayW &&
        prev.displayH === displayH
      ) {
        return prev;
      }
      return { baseW, baseH, scale, displayW, displayH };
    });
  }, [heightMm, targetH, targetW, widthMm]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [measure]);

  return layout;
}

/** Fit label to an explicit display scale (modal inspect). */
export function layoutForThermalScale(
  widthMm: number,
  heightMm: number,
  scale: number
): ThermalPreviewLayout {
  const { w: baseW, h: baseH } = measureLabelPx(widthMm, heightMm);
  const s = Math.max(1, scale);
  return {
    baseW,
    baseH,
    scale: s,
    displayW: Math.round(baseW * s),
    displayH: Math.round(baseH * s),
  };
}