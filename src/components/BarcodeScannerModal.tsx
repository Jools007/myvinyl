import { AnimatePresence, motion } from 'framer-motion';
import { vinylBarcodeFormatNames } from '../lib/barcodeFormats';
import { digitsOnly } from '../lib/barcodeLookup';
import { AlertCircle, Check, Disc3, Loader2, Scan, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { fetchDiscogsRelease, searchDiscogsByBarcode } from '../lib/api';
import type { DiscogsReleaseDetail } from '../lib/api';
import { canUseNativeBarcodeDetector, isScannerMobile } from '../lib/cameraAutofocus';
import {
  barcodeScannerEngine,
  SCANNER_BUILD,
  SCANNER_FPS_DESKTOP,
  SCANNER_FPS_MOBILE,
  type ScannerEngineCallbacks,
} from '../lib/barcodeScannerEngine';
import {
  SCANNER_CONTAINER_ID,
  SCANNER_DEBUG_FLUSH_EVERY_N_ATTEMPTS,
  SCANNER_ENGINE_START_DELAY_MS,
} from '../lib/scannerConfig';
import { createScannerDebugState, type ScannerDebugSnapshot } from '../lib/scannerDebug';
import { isPlayableDiscogsTrack } from '../lib/tracks';
import type { DiscogsSearchHit } from '../lib/types';
import { RecordArtwork } from './RecordArtwork';

type ScannerPhase = 'scanning' | 'looking-up' | 'found' | 'not-found' | 'error';

interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  onAddToCollection: (hit: DiscogsSearchHit, release: DiscogsReleaseDetail) => void;
}

function shouldFlushDebug(prev: ScannerDebugSnapshot, next: ScannerDebugSnapshot): boolean {
  if (next.attempts <= 1 || next.attempts % SCANNER_DEBUG_FLUSH_EVERY_N_ATTEMPTS === 0) return true;
  if (next.lastError?.startsWith('Recovering')) return true;
  if (!prev.viewfinder && next.viewfinder) return true;
  if (next.videoResolution && !prev.videoResolution) return true;
  if (
    next.videoResolution &&
    prev.videoResolution &&
    (next.videoResolution.width !== prev.videoResolution.width ||
      next.videoResolution.height !== prev.videoResolution.height)
  ) {
    return true;
  }
  return false;
}

export function BarcodeScannerModal({
  open,
  onClose,
  onAddToCollection,
}: BarcodeScannerModalProps) {
  const processingRef = useRef(false);
  const [phase, setPhase] = useState<ScannerPhase>('scanning');
  const [barcode, setBarcode] = useState('');
  const [result, setResult] = useState<DiscogsSearchHit | null>(null);
  const [releaseDetail, setReleaseDetail] = useState<DiscogsReleaseDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [focusPulse, setFocusPulse] = useState<{ x: number; y: number } | null>(null);
  const [scanDebug, setScanDebug] = useState<ScannerDebugSnapshot>(createScannerDebugState);
  const scanDebugRef = useRef<ScannerDebugSnapshot>(createScannerDebugState());

  const reset = useCallback(() => {
    processingRef.current = false;
    setPhase('scanning');
    setBarcode('');
    setResult(null);
    setReleaseDetail(null);
    setErrorMessage('');
    setFocusPulse(null);
    const freshDebug = createScannerDebugState();
    scanDebugRef.current = freshDebug;
    setScanDebug(freshDebug);
  }, []);

  const lookupBarcode = useCallback(async (code: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setBarcode(code);
    setPhase('looking-up');
    await barcodeScannerEngine.stop();

    try {
      const results = await searchDiscogsByBarcode(code);
      if (results.length === 0) {
        setPhase('not-found');
        return;
      }
      const hit = results[0];
      const release = await fetchDiscogsRelease(hit.id);
      setResult(hit);
      setReleaseDetail(release);
      setPhase('found');
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Lookup failed');
      setPhase('error');
    } finally {
      processingRef.current = false;
    }
  }, []);

  const lookupBarcodeRef = useRef(lookupBarcode);
  lookupBarcodeRef.current = lookupBarcode;

  const engineCallbacksRef = useRef<ScannerEngineCallbacks>({
    onPhase: () => undefined,
    onDebug: () => undefined,
    onDecode: () => undefined,
    onError: () => undefined,
  });

  engineCallbacksRef.current = {
    onPhase: (enginePhase) => {
      if (enginePhase === 'starting' || enginePhase === 'scanning') {
        setPhase('scanning');
      }
    },
    onDebug: (snapshot) => {
      const prev = scanDebugRef.current;
      scanDebugRef.current = snapshot;
      if (shouldFlushDebug(prev, snapshot)) {
        setScanDebug(snapshot);
      }
    },
    onDecode: (normalized, raw) => {
      console.info('[BarcodeScanner] accepted decode', { raw, normalized: digitsOnly(raw) });
      void lookupBarcodeRef.current(normalized);
    },
    onError: (message) => {
      setErrorMessage(message);
      setPhase('error');
    },
  };

  const beginScan = useCallback(() => {
    void barcodeScannerEngine.start(SCANNER_CONTAINER_ID, engineCallbacksRef.current);
  }, []);

  const handleClose = useCallback(async () => {
    await barcodeScannerEngine.stop();
    reset();
    onClose();
  }, [onClose, reset]);

  useEffect(() => {
    if (!open) {
      void barcodeScannerEngine.stop();
      reset();
      return;
    }

    processingRef.current = false;
    const timer = window.setTimeout(beginScan, SCANNER_ENGINE_START_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      void barcodeScannerEngine.stop();
    };
  }, [open, beginScan, reset]);

  const handleRetry = () => {
    reset();
    beginScan();
  };

  const handleTapToFocus = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (phase !== 'scanning') return;

      const rect = event.currentTarget.getBoundingClientRect();
      setFocusPulse({
        x: ((event.clientX - rect.left) / rect.width) * 100,
        y: ((event.clientY - rect.top) / rect.height) * 100,
      });
      window.setTimeout(() => setFocusPulse(null), 700);

      void barcodeScannerEngine.tapToFocus(SCANNER_CONTAINER_ID, event.clientX, event.clientY);
    },
    [phase]
  );

  const mobile = isScannerMobile();
  const scanFps = mobile ? SCANNER_FPS_MOBILE : SCANNER_FPS_DESKTOP;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="barcode-scanner fixed inset-0 z-[200] flex flex-col bg-[#050506]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="relative z-20 flex items-center justify-between px-4 py-4 sm:px-6">
            <button
              type="button"
              onClick={() => void handleClose()}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 backdrop-blur-md transition hover:bg-white/10"
              aria-label="Close scanner"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-white/90">
              <Scan className="h-4 w-4 text-[var(--accent)]" />
              <span className="text-sm font-medium tracking-wide">Scan barcode</span>
            </div>
            <div className="w-10" />
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-0 sm:px-4">
            <AnimatePresence mode="wait">
              {(phase === 'scanning' || phase === 'looking-up') && (
                <motion.div
                  key="scanner"
                  layout={false}
                  className="relative flex h-full w-full max-w-none flex-col sm:max-w-lg"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="scanner-viewport relative min-h-0 flex-1 overflow-hidden bg-black sm:rounded-3xl sm:border sm:border-white/10 sm:shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
                    <div
                      id={SCANNER_CONTAINER_ID}
                      className={`scanner-region h-full min-h-[min(72dvh,640px)] w-full${mobile ? ' scanner-region--mobile' : ''}`}
                    />

                    {!mobile && (
                      <button
                        type="button"
                        className="scanner-tap-focus absolute inset-0 z-10 cursor-crosshair touch-manipulation"
                        onPointerDown={handleTapToFocus}
                        aria-label="Tap anywhere to focus camera"
                      />
                    )}

                    {focusPulse && (
                      <span
                        className="scanner-focus-pulse pointer-events-none absolute z-20"
                        style={{ left: `${focusPulse.x}%`, top: `${focusPulse.y}%` }}
                        aria-hidden
                      />
                    )}

                    <div className="pointer-events-none absolute inset-0 z-[11] flex items-center justify-center">
                      <div
                        className="scanner-frame relative"
                        style={
                          scanDebug.qrbox
                            ? {
                                width: `${scanDebug.qrbox.width}px`,
                                height: `${scanDebug.qrbox.height}px`,
                              }
                            : undefined
                        }
                      >
                        <span className="scanner-corner scanner-corner--tl" />
                        <span className="scanner-corner scanner-corner--tr" />
                        <span className="scanner-corner scanner-corner--bl" />
                        <span className="scanner-corner scanner-corner--br" />
                        <motion.div
                          className="scanner-line absolute left-3 right-3 h-0.5 rounded-full bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent"
                          animate={{ top: ['12%', '88%', '12%'] }}
                          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                        />
                      </div>
                    </div>

                    {phase === 'looking-up' && (
                      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm">
                        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
                        <p className="text-sm text-white/80">Looking up on Discogs…</p>
                        <p className="font-mono text-xs text-white/50">{barcode}</p>
                      </div>
                    )}
                  </div>

                  <p className="mt-4 px-6 text-center text-sm text-white/60 sm:mt-6">
                    {mobile
                      ? 'Hold the barcode 8–12 in (20–30 cm) away — move slowly closer until lines look sharp'
                      : 'Hold the record at a comfortable distance — align the barcode in the frame'}
                  </p>
                  <p className="mt-1 px-6 text-center text-xs font-medium text-white/50">
                    {mobile
                      ? 'Align UPC/EAN in the guide · hold steady 8–12 in away'
                      : 'Tap anywhere to focus'}
                  </p>

                  <div className="scanner-debug mt-3 px-4 font-mono text-[10px] leading-relaxed text-white/40 sm:px-6">
                    <p>
                      Scan attempts: {scanDebug.attempts}
                      {scanDebug.attempts > 0 ? ' (decoder active)' : ' (waiting for first frame…)'}
                    </p>
                    {scanDebug.viewfinder ? (
                      <p>
                        {mobile
                          ? `Guide: ${scanDebug.qrbox?.width ?? '?'}×${scanDebug.qrbox?.height ?? '?'}px · View: ${scanDebug.viewfinder.width}×${scanDebug.viewfinder.height}px · Camera: ${scanDebug.videoResolution?.width ?? '?'}×${scanDebug.videoResolution?.height ?? '?'} · ${scanFps} fps`
                          : `Scan box: ${scanDebug.qrbox?.width ?? '?'}×${scanDebug.qrbox?.height ?? '?'}px · Viewfinder: ${scanDebug.viewfinder.width}×${scanDebug.viewfinder.height}px · ${scanFps} fps`}
                        {' · '}
                        {scanDebug.decoder ||
                          (mobile
                            ? 'Video + ImageCapture + ZXing'
                            : canUseNativeBarcodeDetector()
                              ? 'BarcodeDetector + ZXing'
                              : 'ZXing 1D')}
                      </p>
                    ) : null}
                    <p>Build: {SCANNER_BUILD} · Formats: {vinylBarcodeFormatNames().join(', ')}</p>
                    {scanDebug.lastError ? <p>Last decode: {scanDebug.lastError}</p> : null}
                    {scanDebug.lastRaw ? <p>Last raw: {scanDebug.lastRaw}</p> : null}
                  </div>
                </motion.div>
              )}

              {phase === 'found' && result && (
                <motion.div
                  key="found"
                  className="flex w-full max-w-md flex-col items-center px-2 py-4"
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                  <motion.div
                    className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--teal-soft)]"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22, delay: 0.1 }}
                  >
                    <Check className="h-6 w-6 text-[var(--teal)]" strokeWidth={2.5} />
                  </motion.div>
                  <p className="mb-6 text-xs font-medium uppercase tracking-[0.25em] text-[var(--teal)]">
                    Release found
                  </p>

                  <motion.div
                    className="w-full overflow-hidden rounded-3xl border border-white/10 bg-[var(--bg-elevated)] p-6 shadow-[var(--shadow-lg)]"
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15, duration: 0.45 }}
                  >
                    <div className="mx-auto mb-5 w-48">
                      <RecordArtwork
                        src={result.cover ?? result.thumb}
                        title={`${result.artist} — ${result.title}`}
                        size="lg"
                        className="aspect-square w-full shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
                      />
                    </div>

                    <h2
                      className="text-center text-xl font-semibold leading-tight tracking-tight text-[var(--text)]"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {result.title}
                    </h2>
                    <p className="mt-1.5 text-center text-base text-[var(--text-secondary)]">
                      {result.artist}
                    </p>
                    {result.year && (
                      <p className="mt-3 text-center font-mono text-sm text-[var(--text-muted)]">
                        {result.year}
                      </p>
                    )}
                    {releaseDetail?.tracklist && releaseDetail.tracklist.length > 0 && (
                      <p className="mt-2 text-center text-xs text-[var(--teal)]">
                        {releaseDetail.tracklist.filter(isPlayableDiscogsTrack).length} tracks loaded
                      </p>
                    )}

                    {(result.genre?.length || result.style?.length) ? (
                      <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                        {[...(result.genre ?? []), ...(result.style ?? [])].slice(0, 4).map((g) => (
                          <span key={g} className="tag-pill">
                            {g}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </motion.div>

                  <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => releaseDetail && onAddToCollection(result, releaseDetail)}
                      disabled={!releaseDetail}
                      className="btn-primary flex-1 py-3.5 text-sm disabled:opacity-50"
                    >
                      <Disc3 className="h-4 w-4" />
                      Add to Collection
                    </button>
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="btn-ghost flex-1 justify-center border-white/10 py-3.5 text-sm text-white/70 hover:text-white"
                    >
                      Scan another
                    </button>
                  </div>
                </motion.div>
              )}

              {(phase === 'not-found' || phase === 'error') && (
                <motion.div
                  key="error"
                  className="flex w-full max-w-sm flex-col items-center px-2 py-4 text-center"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
                    <AlertCircle className="h-7 w-7 text-amber-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">
                    {phase === 'not-found' ? 'No release found' : 'Something went wrong'}
                  </h3>
                  <p className="mt-2 text-sm text-white/55">
                    {phase === 'not-found'
                      ? `Discogs has no vinyl release matching barcode ${barcode}.`
                      : errorMessage}
                  </p>
                  <div className="mt-8 flex w-full flex-col gap-3">
                    <button type="button" onClick={handleRetry} className="btn-primary w-full py-3.5">
                      Try again
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleClose()}
                      className="btn-ghost w-full justify-center border-white/10 py-3 text-sm text-white/60"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}