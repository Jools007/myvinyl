import { Html5Qrcode } from 'html5-qrcode';
import {
  VINYL_BARCODE_FORMAT_LABELS,
  vinylBarcodeFormatsForDevice,
} from './barcodeFormats';
import {
  applyTapToFocus,
  buildScannerVideoConstraints,
  canUseNativeBarcodeDetector,
  computeGuideFrameOverlay,
  computeQrbox,
  enableScannerEnhancements,
  getScannerCameraCandidates,
  isScannerMobile,
} from './cameraAutofocus';
import {
  createScannerDebugState,
  logFullFrameConfigured,
  logQrboxConfigured,
  logScannerStart,
  logScannerStopped,
  recordDecodeAttempt,
  recordDecodeRejected,
  recordDecodeSuccess,
  type ScannerDebugSnapshot,
} from './scannerDebug';
import { digitsOnly } from './barcodeLookup';
import { startNativeMobileBarcodeScanner } from './nativeMobileBarcodeScanner';
import {
  SCANNER_BUILD,
  SCANNER_DEBUG_FLUSH_EVERY_N_ATTEMPTS,
  SCANNER_FPS_DESKTOP,
  SCANNER_FPS_MOBILE,
} from './scannerConfig';
import { setScannerSessionActive } from './scannerSession';

export { SCANNER_BUILD, SCANNER_FPS_DESKTOP, SCANNER_FPS_MOBILE } from './scannerConfig';

export type ScannerEnginePhase = 'idle' | 'starting' | 'scanning' | 'error';

export interface ScannerEngineCallbacks {
  onPhase: (phase: ScannerEnginePhase) => void;
  onDebug: (snapshot: ScannerDebugSnapshot) => void;
  onDecode: (normalized: string, raw: string, format: string) => void;
  onError: (message: string) => void;
}

interface ActiveSession {
  id: number;
  containerId: string;
}

/**
 * Camera + decode lifecycle lives outside React so collection re-renders,
 * visibility sync, and effect cleanups cannot tear down a live scanner.
 */
class BarcodeScannerEngine {
  private session: ActiveSession | null = null;
  private nextSessionId = 0;
  private mobileHandle: Awaited<ReturnType<typeof startNativeMobileBarcodeScanner>> | null = null;
  private html5Scanner: Html5Qrcode | null = null;
  private debug = createScannerDebugState();
  private callbacks: ScannerEngineCallbacks | null = null;
  private layoutSynced = false;

  private isActive(sessionId: number): boolean {
    return this.session?.id === sessionId;
  }

  private patchDebug(patch: Partial<ScannerDebugSnapshot>): void {
    this.debug = { ...this.debug, ...patch };
    this.callbacks?.onDebug(this.debug);
  }

  private setDebug(snapshot: ScannerDebugSnapshot): void {
    this.debug = snapshot;
    this.callbacks?.onDebug(snapshot);
  }

  async start(containerId: string, callbacks: ScannerEngineCallbacks): Promise<void> {
    await this.stop();

    const sessionId = ++this.nextSessionId;
    this.session = { id: sessionId, containerId };
    this.callbacks = callbacks;
    this.layoutSynced = false;
    this.debug = createScannerDebugState();
    this.setDebug(this.debug);
    setScannerSessionActive(true);
    callbacks.onPhase('starting');

    try {
      const mobile = isScannerMobile();
      if (mobile) {
        await this.startMobile(sessionId, containerId);
      } else {
        await this.startDesktop(sessionId, containerId);
      }

      if (!this.isActive(sessionId)) return;
      callbacks.onPhase('scanning');
    } catch (err) {
      if (!this.isActive(sessionId)) return;
      const message = err instanceof Error ? err.message : 'Could not start camera';
      callbacks.onError(message);
      callbacks.onPhase('error');
    }
  }

  async stop(): Promise<void> {
    if (this.session) {
      logScannerStopped(this.debug);
    }

    this.nextSessionId += 1;
    this.session = null;
    setScannerSessionActive(false);

    const mobile = this.mobileHandle;
    this.mobileHandle = null;
    if (mobile) {
      try {
        await mobile.stop();
      } catch {
        /* already stopped */
      }
    }

    const html5 = this.html5Scanner;
    this.html5Scanner = null;
    if (html5) {
      try {
        if (html5.isScanning) await html5.stop();
        html5.clear();
      } catch {
        /* already stopped */
      }
    }

    this.callbacks?.onPhase('idle');
  }

  async tapToFocus(containerId: string, clientX: number, clientY: number): Promise<void> {
    const html5 = this.html5Scanner;
    if (!html5?.isScanning) return;
    await applyTapToFocus(html5, containerId, clientX, clientY);
  }

  private updateLayout(containerId: string, videoRes: { width: number; height: number } | null): void {
    const region = document.getElementById(containerId);
    const viewW = region?.clientWidth ?? 0;
    const viewH = region?.clientHeight ?? 0;
    if (viewW < 1 || viewH < 1) return;

    const guide = computeGuideFrameOverlay(viewW, viewH);
    logFullFrameConfigured(viewW, viewH);

    const next = {
      ...this.debug,
      qrbox: guide,
      viewfinder: { width: viewW, height: viewH },
      videoResolution: videoRes ?? this.debug.videoResolution,
    };

    if (!this.layoutSynced) {
      this.layoutSynced = true;
      this.setDebug(next);
      return;
    }

    this.debug = next;
    if (
      videoRes &&
      (this.debug.videoResolution?.width !== videoRes.width ||
        this.debug.videoResolution?.height !== videoRes.height)
    ) {
      this.callbacks?.onDebug(next);
    }
  }

  private handleRawDecode(raw: string, format: string, sessionId: number): boolean {
    if (!this.isActive(sessionId)) return false;

    const normalized = digitsOnly(raw);
    const next = recordDecodeSuccess(this.debug, raw, normalized);
    this.patchDebug({ ...next, lastError: `Detected as ${format}` });
    if (normalized.length < 8) {
      const rejected = recordDecodeRejected(
        this.debug,
        raw,
        `Only ${normalized.length} digits after normalization (need 8+)`
      );
      this.patchDebug(rejected);
      return false;
    }

    this.callbacks?.onDecode(normalized, raw, format);
    return true;
  }

  private async startMobile(sessionId: number, containerId: string): Promise<void> {
    const formats = vinylBarcodeFormatsForDevice(true);
    const formatNames = formats.map((f) => VINYL_BARCODE_FORMAT_LABELS[f] ?? String(f));

    this.setDebug({
      ...createScannerDebugState(),
      fps: SCANNER_FPS_MOBILE,
      decoder: 'Video + ImageCapture + ZXing',
    });

    console.info('[BarcodeScanner] init', {
      build: SCANNER_BUILD,
      path: 'native-mobile',
      formats: formatNames,
    });

    logScannerStart({
      fps: SCANNER_FPS_MOBILE,
      formats: formatNames,
      useNativeDetector: false,
    });

    const native = await startNativeMobileBarcodeScanner(containerId, SCANNER_FPS_MOBILE, {
      onDecode: (text, format) => this.handleRawDecode(text, format, sessionId),
      onAttempt: (strategy) => {
        if (!this.isActive(sessionId)) return;
        const next = recordDecodeAttempt(
          this.debug,
          strategy === 'strip' ? 'Scanning center strip…' : 'Scanning full frame…'
        );
        this.debug = next;
        if (next.attempts === 1 || next.attempts % SCANNER_DEBUG_FLUSH_EVERY_N_ATTEMPTS === 0) {
          this.callbacks?.onDebug(next);
        }
      },
      onMetrics: (metrics) => {
        if (!this.isActive(sessionId)) return;
        this.patchDebug({ decoder: metrics.decoder });
        this.updateLayout(containerId, { width: metrics.width, height: metrics.height });
      },
      onStatus: (status) => {
        if (!this.isActive(sessionId)) return;
        this.patchDebug({ lastError: status });
      },
      onStall: () => {
        if (!this.isActive(sessionId)) return;
        console.warn('[BarcodeScanner] decode loop stalled — recovering');
        this.patchDebug({ lastError: 'Recovering scanner…' });
      },
    });

    if (!this.isActive(sessionId)) {
      await native.stop();
      return;
    }

    this.mobileHandle = native;
    this.updateLayout(containerId, native.getVideoResolution());
  }

  private async startDesktop(sessionId: number, containerId: string): Promise<void> {
    const formats = vinylBarcodeFormatsForDevice(false);
    const formatNames = formats.map((f) => VINYL_BARCODE_FORMAT_LABELS[f] ?? String(f));
    const useNativeDetector = canUseNativeBarcodeDetector();

    this.setDebug({
      ...createScannerDebugState(),
      fps: SCANNER_FPS_DESKTOP,
    });

    console.info('[BarcodeScanner] init', {
      build: SCANNER_BUILD,
      path: 'html5-qrcode',
      formats: formatNames,
      useNativeDetector,
    });

    logScannerStart({
      fps: SCANNER_FPS_DESKTOP,
      formats: formatNames,
      useNativeDetector,
    });

    const scanner = new Html5Qrcode(containerId, {
      formatsToSupport: formats,
      useBarCodeDetectorIfSupported: useNativeDetector,
      experimentalFeatures: { useBarCodeDetectorIfSupported: useNativeDetector },
      verbose: false,
    });

    const onDecode = (decoded: string, result: { result: { format?: { formatName?: string } } }) => {
      if (!this.isActive(sessionId)) return;
      const formatName = result.result.format?.formatName ?? 'unknown';
      this.handleRawDecode(decoded, formatName, sessionId);
    };

    const onDecodeError = (errorMessage: string) => {
      if (!this.isActive(sessionId)) return;
      const next = recordDecodeAttempt(this.debug, errorMessage);
      this.debug = next;
      if (next.attempts === 1 || next.attempts % 25 === 0) {
        this.callbacks?.onDebug(next);
      }
    };

    const scanConfig = {
      fps: SCANNER_FPS_DESKTOP,
      aspectRatio: 1,
      videoConstraints: buildScannerVideoConstraints(),
      qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
        const box = computeQrbox(viewfinderWidth, viewfinderHeight);
        logQrboxConfigured(viewfinderWidth, viewfinderHeight, box);
        this.patchDebug({
          qrbox: box,
          viewfinder: { width: viewfinderWidth, height: viewfinderHeight },
        });
        return box;
      },
    };

    let started = false;
    let lastError: unknown;
    for (const camera of getScannerCameraCandidates()) {
      try {
        await scanner.start(camera, scanConfig, onDecode, onDecodeError);
        started = true;
        break;
      } catch (err) {
        lastError = err;
        try {
          if (scanner.isScanning) await scanner.stop();
        } catch {
          /* ignore */
        }
      }
    }

    if (!started) {
      throw lastError instanceof Error
        ? lastError
        : new Error('Could not start camera — check permissions and try again');
    }

    if (!this.isActive(sessionId)) {
      try {
        if (scanner.isScanning) await scanner.stop();
        scanner.clear();
      } catch {
        /* ignore */
      }
      return;
    }

    this.html5Scanner = scanner;
    await enableScannerEnhancements(scanner, containerId);
  }
}

export const barcodeScannerEngine = new BarcodeScannerEngine();