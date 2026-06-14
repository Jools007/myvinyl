/**
 * Locked-in barcode scanner configuration (scanner-v13).
 *
 * Verified working on iPhone 15 (Jun 2026). Before changing ANY value here, read:
 *   .grok/skills/barcode-scanner/SKILL.md
 *   .grok/skills/barcode-scanner/references/CHANGELOG.md
 *
 * Bump SCANNER_BUILD when deploying scanner changes so prod debug panel confirms rollout.
 */

export const SCANNER_BUILD = 'scanner-v13';

export const SCANNER_CONTAINER_ID = 'barcode-scanner-region';

/** Delay before engine.start — lets modal mount #barcode-scanner-region first. */
export const SCANNER_ENGINE_START_DELAY_MS = 280;

// ─── Frame rates ─────────────────────────────────────────────────────────────
/** Desktop html5-qrcode — initial commit used 12 fps. */
export const SCANNER_FPS_DESKTOP = 12;
/** Mobile native loop — 10 fps keeps CPU headroom on iOS decode. */
export const SCANNER_FPS_MOBILE = 10;
export const SCANNER_MIN_TICK_INTERVAL_MS = 110;

// ─── Mobile native decode loop ───────────────────────────────────────────────
export const SCANNER_DIMENSION_WAIT_MS = 6_000;
export const SCANNER_VIDEO_READY_WAIT_MS = 4_000;
export const SCANNER_CAPTURE_TIMEOUT_MS = 1_500;
export const SCANNER_DECODE_TIMEOUT_MS = 2_000;
export const SCANNER_STALL_THRESHOLD_MS = 3_500;
export const SCANNER_WATCHDOG_MS = 1_000;
export const SCANNER_MAX_IN_FLIGHT = 2;

/** Rotate one region per tick: full → top (sleeve) → center. */
export const SCANNER_DECODE_REGIONS = ['full', 'top', 'center'] as const;
export type ScannerDecodeRegion = (typeof SCANNER_DECODE_REGIONS)[number];

export const SCANNER_STRIP_RATIO = 0.4;
export const SCANNER_STRIP_MIN_HEIGHT_PX = 120;
export const SCANNER_TOP_STRIP_OFFSET_RATIO = 0.06;

// ─── ZXing ───────────────────────────────────────────────────────────────────
/** Downscale above this — 4K frames fail silently on mobile. */
export const SCANNER_MAX_DECODE_DIMENSION = 1440;
/** Portrait frames try 0°, 90°, 270°; landscape tries 0°, 180°. */
export const SCANNER_PORTRAIT_ASPECT_THRESHOLD = 1.15;

// ─── Camera constraints ──────────────────────────────────────────────────────
/**
 * Mobile getUserMedia — rear camera, ideal 1920×1080.
 * NEVER add zoom or focusMode here (breaks autofocus on iOS).
 * Apply focusMode: 'continuous' AFTER stream starts (nativeMobileBarcodeScanner).
 */
export const SCANNER_MOBILE_VIDEO_CONSTRAINTS = {
  facingMode: 'environment' as const,
  width: { ideal: 1920 },
  height: { ideal: 1080 },
};

export const SCANNER_DESKTOP_VIDEO_CONSTRAINTS = {
  facingMode: 'user' as const,
  width: { ideal: 1280 },
  height: { ideal: 720 },
};

/** Post-start boost if track is below 720p. */
export const SCANNER_RESOLUTION_BOOST_MIN_PIXELS = 1280 * 720;
export const SCANNER_RESOLUTION_BOOST_PROFILES = [
  { width: { ideal: 1920 }, height: { ideal: 1080 } },
  { width: { ideal: 1280 }, height: { ideal: 720 } },
] as const;

// ─── Desktop html5-qrcode scan box ───────────────────────────────────────────
export const SCANNER_QRBOX = {
  widthRatio: 0.88,
  heightRatio: 0.28,
  maxWidth: 340,
  maxHeight: 140,
} as const;

/** Cosmetic mobile guide overlay — decode uses full frame on mobile. */
export const SCANNER_GUIDE_OVERLAY = {
  widthRatio: 0.9,
  heightRatio: 0.22,
  minHeightPx: 120,
} as const;

// ─── Architecture flags (do not flip without reading skill) ──────────────────
/** Mobile MUST use nativeMobileBarcodeScanner, NOT html5-qrcode. */
export const SCANNER_MOBILE_USE_NATIVE_PATH = true;
/** BarcodeDetector.detect() can hang on iOS — ZXing only on mobile. */
export const SCANNER_MOBILE_USE_BARCODE_DETECTOR = false;

// ─── Debug UI ────────────────────────────────────────────────────────────────
export const SCANNER_DEBUG_FLUSH_EVERY_N_ATTEMPTS = 10;