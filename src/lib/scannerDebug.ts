export interface ScannerDebugSnapshot {
  attempts: number;
  successes: number;
  lastError: string;
  lastRaw: string;
  qrbox: { width: number; height: number } | null;
  viewfinder: { width: number; height: number } | null;
  videoResolution: { width: number; height: number } | null;
  decoder: string;
  fps: number;
  startedAt: number;
}

const LOG_PREFIX = '[BarcodeScanner]';

/** html5-qrcode labels every failed frame "QR code parse error" even for 1D-only mode. */
export function formatScannerDecodeError(message: string): string {
  if (/qr code parse error/i.test(message)) {
    return 'Scanning for barcode… align UPC/EAN in the frame';
  }
  if (/not found/i.test(message)) {
    return 'Scanning for barcode…';
  }
  return message;
}

export function createScannerDebugState(): ScannerDebugSnapshot {
  return {
    attempts: 0,
    successes: 0,
    lastError: '',
    lastRaw: '',
    qrbox: null,
    viewfinder: null,
    videoResolution: null,
    decoder: '',
    fps: 0,
    startedAt: Date.now(),
  };
}

export function logScannerStart(config: {
  fps: number;
  formats: string[];
  useNativeDetector: boolean;
}): void {
  console.info(`${LOG_PREFIX} starting`, {
    ...config,
    decoder: config.useNativeDetector ? 'BarcodeDetector + ZXing' : 'ZXing (1D barcodes only)',
  });
}

export function logQrboxConfigured(
  viewfinderWidth: number,
  viewfinderHeight: number,
  qrbox: { width: number; height: number }
): void {
  console.info(`${LOG_PREFIX} qrbox configured`, {
    viewfinder: { width: viewfinderWidth, height: viewfinderHeight },
    qrbox,
    ratios: {
      width: (qrbox.width / viewfinderWidth).toFixed(3),
      height: (qrbox.height / viewfinderHeight).toFixed(3),
    },
  });
}

export function logFullFrameConfigured(
  viewfinderWidth: number,
  viewfinderHeight: number
): void {
  console.info(`${LOG_PREFIX} full-frame decode`, {
    viewfinder: { width: viewfinderWidth, height: viewfinderHeight },
  });
}

export function recordDecodeAttempt(
  state: ScannerDebugSnapshot,
  errorMessage: string
): ScannerDebugSnapshot {
  const attempts = state.attempts + 1;
  const next = {
    ...state,
    attempts,
    lastError: formatScannerDecodeError(errorMessage),
  };

  if (attempts === 1 || attempts % 25 === 0) {
    console.debug(`${LOG_PREFIX} decode attempt #${attempts}`, {
      message: errorMessage,
      elapsedMs: Date.now() - state.startedAt,
      qrbox: state.qrbox,
    });
  }

  return next;
}

export function recordDecodeSuccess(
  state: ScannerDebugSnapshot,
  raw: string,
  normalized: string
): ScannerDebugSnapshot {
  console.info(`${LOG_PREFIX} barcode detected`, { raw, normalized });
  return {
    ...state,
    successes: state.successes + 1,
    lastRaw: raw,
    lastError: '',
  };
}

export function recordDecodeRejected(
  state: ScannerDebugSnapshot,
  raw: string,
  reason: string
): ScannerDebugSnapshot {
  console.warn(`${LOG_PREFIX} decode rejected`, { raw, reason });
  return {
    ...state,
    lastRaw: raw,
    lastError: reason,
  };
}

export function logScannerStopped(state: ScannerDebugSnapshot): void {
  console.info(`${LOG_PREFIX} stopped`, {
    attempts: state.attempts,
    successes: state.successes,
    elapsedMs: Date.now() - state.startedAt,
  });
}