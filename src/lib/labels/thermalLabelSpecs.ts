import type { LabelPrintProfileId } from '../labelProfiles';
import type { LabelTitleLayout } from '../types';

/** Design tokens per physical label size (203 DPI Phomemo M-series). */
export type ThermalLabelSpecId = '40x30' | '40x80';

export interface ThermalLabelTypography {
  display: number;
  title: number;
  /** Single-line "80 BPM · 9B KEY" row */
  statInline: number;
  vibes: number;
  notes: number;
  rail: number;
  brand: number;
}

export interface ThermalLabelSpec {
  id: ThermalLabelSpecId;
  widthMm: number;
  heightMm: number;
  pxPerMm: number;
  margins: { top: number; right: number; bottom: number; left: number };
  stackGap: number;
  footerZone: number;
  type: ThermalLabelTypography;
  layoutVariant: 'compact' | 'tall';
  zones: {
    vibesMax: number;
    notesMaxLines: number;
  };
}

const PX_PER_MM = 8;

/** Hi-res capture/render factor before 1-bit downsample. */
export const THERMAL_PRINT_SUPERSAMPLE = 8;

/**
 * Locked M220 40×30 pipeline — best print clarity (Jun 2026). Do not regress.
 * - Canvas vector render @ 8× supersample
 * - Label-native 40-byte raster (not 72-byte head padding)
 * - Ink threshold 185, density 5
 */
export const THERMAL_PRINT_PIPELINE = {
  renderer: 'canvas' as const,
  rasterMode: 'label-native' as const,
  supersample: THERMAL_PRINT_SUPERSAMPLE,
  inkThreshold: 185,
  density: 5,
};

const FONT_FAMILY = '"DM Sans", system-ui, -apple-system, sans-serif';

export const THERMAL_FONT_FAMILY = FONT_FAMILY;

export const SPEC_40X30: ThermalLabelSpec = {
  id: '40x30',
  widthMm: 40,
  heightMm: 30,
  pxPerMm: PX_PER_MM,
  margins: { top: 0.28, right: 0.5, bottom: 0.28, left: 0.5 },
  /** Uniform vertical gap between stacked sections (mm). */
  stackGap: 0.2,
  /** Reserved height for pinned footer rule + meta (mm). */
  footerZone: 2.05,
  type: {
    display: 3.5,
    title: 2.8,
    statInline: 2.15,
    vibes: 1.35,
    notes: 1.55,
    rail: 0.9,
    brand: 0.95,
  },
  layoutVariant: 'compact',
  zones: {
    vibesMax: 3,
    notesMaxLines: 5,
  },
};

export const SPEC_40X80: ThermalLabelSpec = {
  id: '40x80',
  widthMm: 40,
  heightMm: 80,
  pxPerMm: PX_PER_MM,
  margins: { top: 2.0, right: 1.5, bottom: 1.5, left: 1.5 },
  stackGap: 0.35,
  footerZone: 2.5,
  type: {
    display: 3.5,
    title: 2.8,
    statInline: 2.15,
    vibes: 1.35,
    notes: 1.55,
    rail: 0.9,
    brand: 0.95,
  },
  layoutVariant: 'tall',
  zones: {
    vibesMax: 3,
    notesMaxLines: 4,
  },
};

export const THERMAL_LABEL_SPECS: Record<ThermalLabelSpecId, ThermalLabelSpec> = {
  '40x30': SPEC_40X30,
  '40x80': SPEC_40X80,
};

const PROFILE_SPEC: Partial<Record<LabelPrintProfileId, ThermalLabelSpecId>> = {
  'phomemo-40x30': '40x30',
  'phomemo-40x80': '40x80',
};

export function getThermalLabelSpec(profileId: LabelPrintProfileId): ThermalLabelSpec {
  const specId = PROFILE_SPEC[profileId] ?? '40x30';
  return THERMAL_LABEL_SPECS[specId];
}

export function getThermalLabelSpecBySize(widthMm: number, heightMm: number): ThermalLabelSpec {
  if (widthMm === 40 && heightMm >= 70) return SPEC_40X80;
  return SPEC_40X30;
}

export function specPreviewZoom(spec: ThermalLabelSpec): number {
  return spec.heightMm <= 35 ? 2.35 : 2;
}

export function identityLinePlan(
  layout: LabelTitleLayout
): Array<{ role: 'display' | 'title'; maxLines: number }> {
  if (layout === 'album-only') {
    return [{ role: 'display', maxLines: 2 }];
  }
  if (layout === 'album-artist') {
    return [
      { role: 'display', maxLines: 1 },
      { role: 'title', maxLines: 2 },
    ];
  }
  return [
    { role: 'display', maxLines: 2 },
    { role: 'title', maxLines: 1 },
  ];
}