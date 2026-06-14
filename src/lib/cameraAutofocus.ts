import type { Html5Qrcode } from 'html5-qrcode';
import { isMobilePlaybackDevice } from './playbackDevice';
import {
  SCANNER_DESKTOP_VIDEO_CONSTRAINTS,
  SCANNER_GUIDE_OVERLAY,
  SCANNER_MOBILE_VIDEO_CONSTRAINTS,
  SCANNER_QRBOX,
} from './scannerConfig';

export { SCANNER_QRBOX } from './scannerConfig';

type FocusMode = 'continuous' | 'single-shot';

type TrackConstraint = Record<string, unknown> & {
  focusMode?: FocusMode;
  pointsOfInterest?: Array<{ x: number; y: number }>;
  zoom?: number;
};

export function isScannerMobile(): boolean {
  return isMobilePlaybackDevice();
}

/**
 * Desktop decode region — initial commit used 88%×28% capped at 340×140.
 */
export function computeQrbox(viewfinderWidth: number, viewfinderHeight: number) {
  return {
    width: Math.min(Math.floor(viewfinderWidth * SCANNER_QRBOX.widthRatio), SCANNER_QRBOX.maxWidth),
    height: Math.min(
      Math.floor(viewfinderHeight * SCANNER_QRBOX.heightRatio),
      SCANNER_QRBOX.maxHeight
    ),
  };
}

/** Cosmetic guide overlay only — decode uses full frame when qrbox is omitted. */
export function computeGuideFrameOverlay(viewfinderWidth: number, viewfinderHeight: number) {
  return {
    width: Math.floor(viewfinderWidth * SCANNER_GUIDE_OVERLAY.widthRatio),
    height: Math.max(
      SCANNER_GUIDE_OVERLAY.minHeightPx,
      Math.floor(viewfinderHeight * SCANNER_GUIDE_OVERLAY.heightRatio)
    ),
  };
}

export function canUseNativeBarcodeDetector(): boolean {
  if (typeof window === 'undefined') return false;
  return 'BarcodeDetector' in window;
}

/** Camera profiles to try in order (desktop: webcam first; mobile: rear first). */
export function getScannerCameraCandidates(): MediaTrackConstraints[] {
  if (isScannerMobile()) {
    return [{ facingMode: 'environment' }, { facingMode: 'user' }];
  }
  return [{ facingMode: 'user' }, { facingMode: 'environment' }];
}

/**
 * Minimal constraints — avoid forced 2× zoom (blurs 1D barcodes on desktop).
 * Initial working build did not apply zoom/focus advanced constraints.
 */
/** Mobile: rear camera + resolution ideal — no zoom/focus in advanced (breaks AF on iOS). */
export function buildScannerMobileVideoConstraints(): MediaTrackConstraints {
  return { ...SCANNER_MOBILE_VIDEO_CONSTRAINTS };
}

export function buildScannerVideoConstraints(): MediaTrackConstraints | undefined {
  if (isScannerMobile()) {
    return buildScannerMobileVideoConstraints();
  }
  return { ...SCANNER_DESKTOP_VIDEO_CONSTRAINTS };
}

function getVideoElement(regionId: string): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>(`#${regionId} video`);
}

function getVideoTrack(regionId: string): MediaStreamTrack | null {
  const video = getVideoElement(regionId);
  const stream = video?.srcObject;
  if (!(stream instanceof MediaStream)) return null;
  return stream.getVideoTracks()[0] ?? null;
}

async function applyTrackConstraint(
  scanner: Html5Qrcode,
  regionId: string,
  constraint: TrackConstraint
): Promise<boolean> {
  try {
    await scanner.applyVideoConstraints({ advanced: [constraint as MediaTrackConstraintSet] });
    return true;
  } catch {
    const track = getVideoTrack(regionId);
    if (!track) return false;
    try {
      await track.applyConstraints({ advanced: [constraint as MediaTrackConstraintSet] });
      return true;
    } catch {
      return false;
    }
  }
}

async function enableContinuousAutofocus(
  scanner: Html5Qrcode,
  regionId: string
): Promise<void> {
  await applyTrackConstraint(scanner, regionId, { focusMode: 'continuous' });
}

/** Mobile only — desktop webcams rarely support optical zoom and it hurts decode. */
export async function enableScannerEnhancements(
  scanner: Html5Qrcode,
  regionId: string
): Promise<void> {
  if (!isScannerMobile()) return;
  await enableContinuousAutofocus(scanner, regionId);
}

export function normalizeTapPoint(
  video: HTMLVideoElement,
  clientX: number,
  clientY: number
): { x: number; y: number } {
  const rect = video.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, rect.width ? (clientX - rect.left) / rect.width : 0.5)),
    y: Math.min(1, Math.max(0, rect.height ? (clientY - rect.top) / rect.height : 0.5)),
  };
}

/** Desktop only — single-shot POI focus locks mobile cameras at the wrong distance. */
export async function applyTapToFocus(
  scanner: Html5Qrcode,
  regionId: string,
  clientX: number,
  clientY: number
): Promise<void> {
  if (isScannerMobile()) return;

  const video = getVideoElement(regionId);
  if (!video) return;

  const point = normalizeTapPoint(video, clientX, clientY);
  const applied = await applyTrackConstraint(scanner, regionId, {
    focusMode: 'single-shot',
    pointsOfInterest: [point],
  });

  if (!applied) {
    await applyTrackConstraint(scanner, regionId, { focusMode: 'single-shot' });
  }

  window.setTimeout(() => {
    void enableContinuousAutofocus(scanner, regionId);
  }, 600);
}