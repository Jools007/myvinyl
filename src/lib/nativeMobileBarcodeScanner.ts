import { buildScannerMobileVideoConstraints } from './cameraAutofocus';
import {
  SCANNER_CAPTURE_TIMEOUT_MS,
  SCANNER_DECODE_TIMEOUT_MS,
  SCANNER_DECODE_REGIONS,
  SCANNER_DIMENSION_WAIT_MS,
  SCANNER_MAX_IN_FLIGHT,
  SCANNER_MIN_TICK_INTERVAL_MS,
  SCANNER_RESOLUTION_BOOST_MIN_PIXELS,
  SCANNER_RESOLUTION_BOOST_PROFILES,
  SCANNER_STALL_THRESHOLD_MS,
  SCANNER_STRIP_MIN_HEIGHT_PX,
  SCANNER_STRIP_RATIO,
  SCANNER_TOP_STRIP_OFFSET_RATIO,
  SCANNER_VIDEO_READY_WAIT_MS,
  SCANNER_WATCHDOG_MS,
  type ScannerDecodeRegion,
} from './scannerConfig';
import { decodeBarcodeFromImageSource, resetBarcodeDecoder } from './zxingCanvasDecoder';

const LOG_PREFIX = '[BarcodeScanner]';

type CaptureMethod = 'video' | 'imagecapture';

const REGION_LABELS: Record<ScannerDecodeRegion, string> = {
  full: 'Scanning full frame…',
  top: 'Scanning top strip…',
  center: 'Scanning center strip…',
};

export interface NativeMobileScannerCallbacks {
  onDecode: (text: string, format: string) => boolean | void;
  onAttempt: (strategy: 'full' | 'strip') => void;
  onMetrics?: (metrics: {
    width: number;
    height: number;
    captureMethod: CaptureMethod;
    decoder: string;
  }) => void;
  onStatus?: (message: string) => void;
  onStall?: () => void;
}

export interface NativeMobileScannerHandle {
  stop: () => Promise<void>;
  getVideoResolution: () => { width: number; height: number } | null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), ms)),
  ]);
}

function getTrackFrameSize(stream: MediaStream): { width: number; height: number } | null {
  const track = stream.getVideoTracks()[0];
  if (!track) return null;
  const { width, height } = track.getSettings();
  if (typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0) {
    return { width, height };
  }
  return null;
}

function getVideoFrameSize(video: HTMLVideoElement): { width: number; height: number } | null {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return { width: video.videoWidth, height: video.videoHeight };
  }
  return null;
}

async function waitForFrameMetrics(
  video: HTMLVideoElement,
  stream: MediaStream
): Promise<{ width: number; height: number } | null> {
  const deadline = Date.now() + SCANNER_DIMENSION_WAIT_MS;
  while (Date.now() < deadline) {
    const fromVideo = getVideoFrameSize(video);
    if (fromVideo) return fromVideo;
    const fromTrack = getTrackFrameSize(stream);
    if (fromTrack) return fromTrack;
    await new Promise((r) => window.setTimeout(r, 100));
  }
  return null;
}

async function waitForVideoReady(video: HTMLVideoElement): Promise<boolean> {
  const deadline = Date.now() + SCANNER_VIDEO_READY_WAIT_MS;
  while (Date.now() < deadline) {
    if (
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.videoWidth > 0 &&
      video.videoHeight > 0
    ) {
      return true;
    }
    await new Promise((r) => window.setTimeout(r, 50));
  }
  return video.videoWidth > 0 && video.videoHeight > 0;
}

async function enableContinuousAutofocus(stream: MediaStream): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  try {
    await track.applyConstraints({
      advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
    });
  } catch {
    /* optional */
  }
}

async function boostCameraResolution(stream: MediaStream): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track) return;

  const before = track.getSettings();
  const beforePixels = (before.width ?? 0) * (before.height ?? 0);
  if (beforePixels >= SCANNER_RESOLUTION_BOOST_MIN_PIXELS) return;

  for (const profile of SCANNER_RESOLUTION_BOOST_PROFILES) {
    try {
      await track.applyConstraints(profile);
      const next = track.getSettings();
      if ((next.width ?? 0) * (next.height ?? 0) > beforePixels) {
        console.info(`${LOG_PREFIX} boosted camera resolution`, {
          before: { width: before.width, height: before.height },
          after: { width: next.width, height: next.height },
        });
        return;
      }
    } catch {
      /* optional */
    }
  }
}

function prepareVideoElement(video: HTMLVideoElement): void {
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');
  video.className = 'native-scanner-video';
}

function drawRegionStrip(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  width: number,
  height: number,
  region: 'top' | 'center'
): HTMLCanvasElement {
  const stripH = Math.max(SCANNER_STRIP_MIN_HEIGHT_PX, Math.floor(height * SCANNER_STRIP_RATIO));
  const sy =
    region === 'top'
      ? Math.max(0, Math.floor(height * SCANNER_TOP_STRIP_OFFSET_RATIO))
      : Math.floor((height - stripH) / 2);
  canvas.width = width;
  canvas.height = stripH;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, sy, width, stripH, 0, 0, width, stripH);
  return canvas;
}

async function decodeZxing(
  source: CanvasImageSource,
  width: number,
  height: number
): Promise<string | null> {
  return withTimeout(
    new Promise<string | null>((resolve) => {
      window.setTimeout(() => {
        try {
          resolve(decodeBarcodeFromImageSource(source, width, height));
        } catch {
          resolve(null);
        }
      }, 0);
    }),
    SCANNER_DECODE_TIMEOUT_MS
  );
}

export async function startNativeMobileBarcodeScanner(
  containerId: string,
  fps: number,
  callbacks: NativeMobileScannerCallbacks
): Promise<NativeMobileScannerHandle> {
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error('Scanner container not found');
  }

  container.replaceChildren();

  const video = document.createElement('video');
  prepareVideoElement(video);

  const stream = await navigator.mediaDevices.getUserMedia({
    video: buildScannerMobileVideoConstraints(),
    audio: false,
  });

  video.srcObject = stream;
  container.appendChild(video);

  try {
    await video.play();
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    throw err instanceof Error ? err : new Error('Could not start camera preview');
  }

  await waitForVideoReady(video);
  await enableContinuousAutofocus(stream);
  await boostCameraResolution(stream);

  const decoderLabel = 'Video + ImageCapture + ZXing';
  const hasImageCapture = typeof ImageCapture !== 'undefined';
  const track = stream.getVideoTracks()[0];
  const imageCapture = hasImageCapture && track ? new ImageCapture(track) : null;

  const initialMetrics = (await waitForFrameMetrics(video, stream)) ?? getTrackFrameSize(stream);
  if (initialMetrics) {
    callbacks.onMetrics?.({
      width: initialMetrics.width,
      height: initialMetrics.height,
      captureMethod: 'video',
      decoder: decoderLabel,
    });
  }

  const fullCanvas = document.createElement('canvas');
  const regionCanvas = document.createElement('canvas');
  const fullCtx = fullCanvas.getContext('2d', { willReadFrequently: true });
  const regionCtx = regionCanvas.getContext('2d', { willReadFrequently: true });
  if (!fullCtx || !regionCtx) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('Could not create decode canvas');
  }

  let running = true;
  let regionIndex = 0;
  let tickIndex = 0;
  let inFlight = 0;
  let lastAttemptAt = Date.now();
  let lastMetrics = initialMetrics ?? { width: 0, height: 0 };
  const intervalMs = Math.max(SCANNER_MIN_TICK_INTERVAL_MS, Math.floor(1000 / fps));

  console.info(`${LOG_PREFIX} mobile scanner active`, {
    build: 'v13',
    fps,
    intervalMs,
    decoder: decoderLabel,
    initialMetrics,
  });

  const captureFromVideo = async (): Promise<ImageBitmap | null> => {
    const size = getVideoFrameSize(video) ?? getTrackFrameSize(stream);
    if (!size) return null;
    fullCanvas.width = size.width;
    fullCanvas.height = size.height;
    fullCtx.imageSmoothingEnabled = false;
    fullCtx.drawImage(video, 0, 0, size.width, size.height);
    return createImageBitmap(fullCanvas);
  };

  const captureFrame = async (): Promise<{ bitmap: ImageBitmap; method: CaptureMethod } | null> => {
    const useImageCapture = imageCapture && tickIndex % 2 === 1;
    tickIndex += 1;

    const capture = async (): Promise<{ bitmap: ImageBitmap; method: CaptureMethod } | null> => {
      if (useImageCapture) {
        try {
          const bitmap = await imageCapture.grabFrame();
          if (bitmap.width > 0 && bitmap.height > 0) {
            return { bitmap, method: 'imagecapture' };
          }
          bitmap.close();
        } catch (err) {
          console.debug(`${LOG_PREFIX} grabFrame failed`, err);
        }
      }

      const videoBitmap = await captureFromVideo();
      return videoBitmap ? { bitmap: videoBitmap, method: 'video' } : null;
    };

    return withTimeout(capture(), SCANNER_CAPTURE_TIMEOUT_MS);
  };

  const tryDecodeRegion = async (
    bitmap: ImageBitmap,
    region: ScannerDecodeRegion
  ): Promise<string | null> => {
    let source: CanvasImageSource = bitmap;
    let w = bitmap.width;
    let h = bitmap.height;

    if (region === 'top') {
      drawRegionStrip(regionCtx, regionCanvas, bitmap, bitmap.width, bitmap.height, 'top');
      source = regionCanvas;
      w = regionCanvas.width;
      h = regionCanvas.height;
    } else if (region === 'center') {
      drawRegionStrip(regionCtx, regionCanvas, bitmap, bitmap.width, bitmap.height, 'center');
      source = regionCanvas;
      w = regionCanvas.width;
      h = regionCanvas.height;
    }

    return decodeZxing(source, w, h);
  };

  const tick = async () => {
    if (!running || inFlight >= SCANNER_MAX_IN_FLIGHT) return;

    inFlight += 1;
    const region = SCANNER_DECODE_REGIONS[regionIndex % SCANNER_DECODE_REGIONS.length];
    regionIndex += 1;

    let captured: { bitmap: ImageBitmap; method: CaptureMethod } | null = null;
    try {
      captured = await captureFrame();
      if (!captured) {
        callbacks.onStatus?.('Waiting for camera frame…');
        return;
      }

      const { bitmap, method } = captured;
      lastAttemptAt = Date.now();
      callbacks.onAttempt(region === 'center' ? 'strip' : 'full');
      callbacks.onStatus?.(REGION_LABELS[region]);

      if (bitmap.width !== lastMetrics.width || bitmap.height !== lastMetrics.height) {
        lastMetrics = { width: bitmap.width, height: bitmap.height };
        callbacks.onMetrics?.({
          width: bitmap.width,
          height: bitmap.height,
          captureMethod: method,
          decoder: decoderLabel,
        });
      }

      const text = await tryDecodeRegion(bitmap, region);
      if (text) {
        console.info(`${LOG_PREFIX} mobile decode`, { raw: text, region, method });
        const accepted = callbacks.onDecode(text, 'zxing');
        if (accepted !== false) {
          running = false;
        }
      }
    } catch (err) {
      if (running && err instanceof Error) {
        console.debug(`${LOG_PREFIX} tick error`, err.message);
      }
    } finally {
      captured?.bitmap.close();
      inFlight = Math.max(0, inFlight - 1);
    }
  };

  const decodeTimer = window.setInterval(() => {
    void tick();
  }, intervalMs);

  const watchdog = window.setInterval(() => {
    if (!running) return;

    const stalledFor = Date.now() - lastAttemptAt;
    if (stalledFor < SCANNER_STALL_THRESHOLD_MS) return;

    callbacks.onStall?.();
    resetBarcodeDecoder();
    lastAttemptAt = Date.now();
    inFlight = 0;

    if (video.paused) {
      void video.play().catch(() => undefined);
    }

    const mediaTrack = stream.getVideoTracks()[0];
    if (mediaTrack?.readyState === 'ended') {
      running = false;
      callbacks.onStatus?.('Camera interrupted — tap Try again');
      return;
    }

    void tick();
  }, SCANNER_WATCHDOG_MS);

  return {
    getVideoResolution: () => {
      if (lastMetrics.width > 0) return lastMetrics;
      return getVideoFrameSize(video) ?? getTrackFrameSize(stream);
    },
    stop: async () => {
      running = false;
      window.clearInterval(decodeTimer);
      window.clearInterval(watchdog);
      video.pause();
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      container.replaceChildren();
    },
  };
}