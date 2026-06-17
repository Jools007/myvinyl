import type { ThermalLabelSpecId } from '../thermalLabelSpecs';

export type QcSeverity = 'error' | 'warn';

export interface QcCheckResult {
  id: string;
  pass: boolean;
  severity: QcSeverity;
  message: string;
  value?: number;
  threshold?: number | string;
}

export interface ThermalLabelQcMetrics {
  width: number;
  height: number;
  inkPixels: number;
  border: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  contentBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null;
  coreInkPixels: number;
  coreInkDarkRatio: number;
}

export interface ThermalLabelQcReport {
  specId: ThermalLabelSpecId;
  pass: boolean;
  checks: QcCheckResult[];
  metrics: ThermalLabelQcMetrics;
}

export class ThermalLabelQcError extends Error {
  readonly report: ThermalLabelQcReport;

  constructor(report: ThermalLabelQcReport) {
    const failed = report.checks.filter((c) => !c.pass && c.severity === 'error');
    const summary = failed.map((c) => c.message).join('; ');
    super(summary || 'Thermal label QC failed');
    this.name = 'ThermalLabelQcError';
    this.report = report;
  }
}