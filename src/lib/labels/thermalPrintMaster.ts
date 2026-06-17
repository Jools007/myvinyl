/**
 * M220 40×30 mm thermal print — master settings (locked Jun 2026).
 *
 * Single source of truth for production labels. Typography, spacing, border insets,
 * raster pipeline, and font are defined here and in SPEC_40X30 / THERMAL_PRINT_PIPELINE.
 *
 * Do not reintroduce pipeline switchers or frozen rollback snapshots — change this file
 * intentionally when tuning print quality.
 */
export {
  THERMAL_BORDER_INSET_MM,
  THERMAL_FONT_FAMILY,
  THERMAL_PRINT_PIPELINE,
  THERMAL_PRINT_SUPERSAMPLE,
  borderInsetPx,
  SPEC_40X30,
  type ThermalBorderInsetMm,
} from './thermalLabelSpecs';