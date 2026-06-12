import type { Html5Qrcode } from 'html5-qrcode';

type FocusMode = 'continuous' | 'single-shot';

type TrackConstraint = Record<string, unknown> & {
  focusMode?: FocusMode;
  pointsOfInterest?: Array<{ x: number; y: number }>;
  zoom?: number;
};

export const SCANNER_ZOOM_IDEAL = 2;

/**
 * Wide, short scan region for horizontal 1D vinyl barcodes (EAN-13 / UPC).
 * Ratios are shared by html5-qrcode qrbox and the on-screen frame overlay.
 */
export const SCANNER_QRBOX = {
  widthRatio: 0.94,
  heightRatio: 0.2,
} as const;

/**
 * Decode region sized from the live viewfinder — no max caps so the visual
 * frame and html5-qrcode scan box stay pixel-aligned.
 */
export function computeQrbox(viewfinderWidth: number, viewfinderHeight: number) {
  return {
    width: Math.floor(viewfinderWidth * SCANNER_QRBOX.widthRatio),
    height: Math.floor(viewfinderHeight * SCANNER_QRBOX.heightRatio),
  };
}

/** High-resolution rear camera with optical zoom and continuous autofocus. */
export function buildScannerVideoConstraints(): MediaTrackConstraints {
  return {
    facingMode: 'environment',
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    zoom: { ideal: SCANNER_ZOOM_IDEAL },
    focusMode: { ideal: 'continuous' },
    advanced: [
      { focusMode: 'continuous' },
      { zoom: SCANNER_ZOOM_IDEAL },
    ],
  } as unknown as MediaTrackConstraints;
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

async function enableOpticalZoom(scanner: Html5Qrcode, regionId: string): Promise<void> {
  try {
    const zoom = scanner.getRunningTrackCameraCapabilities().zoomFeature();
    if (zoom.isSupported()) {
      const target = Math.min(SCANNER_ZOOM_IDEAL, zoom.max());
      await zoom.apply(Math.max(zoom.min(), target));
      return;
    }
  } catch {
    /* fall through */
  }

  await applyTrackConstraint(scanner, regionId, { zoom: SCANNER_ZOOM_IDEAL });
  try {
    await scanner.applyVideoConstraints({
      zoom: { ideal: SCANNER_ZOOM_IDEAL },
    } as unknown as MediaTrackConstraints);
  } catch {
    /* device may not support zoom */
  }
}

/** Autofocus and optical zoom after html5-qrcode starts the camera. */
export async function enableScannerEnhancements(
  scanner: Html5Qrcode,
  regionId: string
): Promise<void> {
  await enableContinuousAutofocus(scanner, regionId);
  await enableOpticalZoom(scanner, regionId);

  window.setTimeout(() => {
    void enableContinuousAutofocus(scanner, regionId);
    void enableOpticalZoom(scanner, regionId);
  }, 400);
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

/** Tap-to-focus at a point, then restore continuous autofocus. */
export async function applyTapToFocus(
  scanner: Html5Qrcode,
  regionId: string,
  clientX: number,
  clientY: number
): Promise<void> {
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