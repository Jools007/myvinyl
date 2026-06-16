import type { ThermalLabelSpecId } from './labels/thermalLabelSpecs';

/** Label output targets for the Labels page. */
export type LabelPrintProfileId = 'sheet-2in' | 'phomemo-40x30' | 'phomemo-40x80';

export interface LabelPrintProfile {
  id: LabelPrintProfileId;
  name: string;
  description: string;
  widthMm: number;
  heightMm: number;
  thermal: boolean;
  /** Design spec — see thermalLabelSpecs.ts */
  specId?: ThermalLabelSpecId;
}

export const LABEL_PRINT_PROFILES: LabelPrintProfile[] = [
  {
    id: 'phomemo-40x30',
    name: 'Phomemo 40×30 mm',
    description: 'Small square thermal labels (M220)',
    widthMm: 40,
    heightMm: 30,
    thermal: true,
    specId: '40x30',
  },
  {
    id: 'phomemo-40x80',
    name: 'Phomemo 40×80 mm',
    description: 'Tall thermal labels (M220) — switch roll after 40×30',
    widthMm: 40,
    heightMm: 80,
    thermal: true,
    specId: '40x80',
  },
  {
    id: 'sheet-2in',
    name: 'Sheet 2.125″',
    description: 'Browser print on letter/A4 sticker sheets',
    widthMm: 54,
    heightMm: 54,
    thermal: false,
  },
];

const STORAGE_KEY = 'myvinyl:label-print-profile';

export function loadLabelPrintProfile(): LabelPrintProfileId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'phomemo-40x30' || raw === 'phomemo-40x80' || raw === 'sheet-2in') {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return 'phomemo-40x30';
}

export function saveLabelPrintProfile(id: LabelPrintProfileId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function getLabelPrintProfile(id: LabelPrintProfileId): LabelPrintProfile {
  return LABEL_PRINT_PROFILES.find((p) => p.id === id) ?? LABEL_PRINT_PROFILES[0];
}

/** Pixels per mm at 203 DPI (Phomemo M-series). */
export const THERMAL_PX_PER_MM = 8;

export function thermalLabelPixels(widthMm: number, heightMm: number): { width: number; height: number } {
  return {
    width: Math.round(widthMm * THERMAL_PX_PER_MM),
    height: Math.round(heightMm * THERMAL_PX_PER_MM),
  };
}