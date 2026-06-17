export { diffThermalLabelSurfaces, type SurfaceQcDelta } from './surfaceCompare';
export { assertThermalLabelPrintable, surfaceFromCanvas, validateThermalLabelCanvas } from './qcFromCanvas';
export {
  QC_40X30_THRESHOLDS,
  QC_THRESHOLDS_BY_SPEC,
  marginsToPx,
  type ThermalLabelQcThresholds,
} from './thresholds';
export { analyzeThermalLabelSurface, runThermalLabelQc, type RgbaSurface } from './thermalLabelQc';
export {
  ThermalLabelQcError,
  type QcCheckResult,
  type ThermalLabelQcMetrics,
  type ThermalLabelQcReport,
} from './types';
export { QC_FIXTURE_RECORDS, type QcFixtureId } from './fixtures/records';