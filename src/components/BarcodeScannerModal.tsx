import { AnimatePresence, motion } from 'framer-motion';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { AlertCircle, Check, Disc3, Loader2, Scan, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDiscogsRelease, searchDiscogsByBarcode } from '../lib/api';
import type { DiscogsReleaseDetail } from '../lib/api';
import { isPlayableDiscogsTrack } from '../lib/tracks';
import type { DiscogsSearchHit } from '../lib/types';
import { RecordArtwork } from './RecordArtwork';

type ScannerPhase = 'scanning' | 'looking-up' | 'found' | 'not-found' | 'error';

interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  onAddToCollection: (hit: DiscogsSearchHit, release: DiscogsReleaseDetail) => void;
}

const SCANNER_ID = 'barcode-scanner-region';

export function BarcodeScannerModal({
  open,
  onClose,
  onAddToCollection,
}: BarcodeScannerModalProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const [phase, setPhase] = useState<ScannerPhase>('scanning');
  const [barcode, setBarcode] = useState('');
  const [result, setResult] = useState<DiscogsSearchHit | null>(null);
  const [releaseDetail, setReleaseDetail] = useState<DiscogsReleaseDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
      scanner.clear();
    } catch {
      /* scanner may already be stopped */
    }
    scannerRef.current = null;
  }, []);

  const reset = useCallback(() => {
    processingRef.current = false;
    setPhase('scanning');
    setBarcode('');
    setResult(null);
    setReleaseDetail(null);
    setErrorMessage('');
  }, []);

  const handleClose = useCallback(async () => {
    await stopScanner();
    reset();
    onClose();
  }, [onClose, reset, stopScanner]);

  const lookupBarcode = useCallback(
    async (code: string) => {
      if (processingRef.current) return;
      processingRef.current = true;
      setBarcode(code);
      setPhase('looking-up');
      await stopScanner();

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
      }
    },
    [stopScanner]
  );

  const startScanner = useCallback(async () => {
    await stopScanner();
    processingRef.current = false;
    setPhase('scanning');
    setResult(null);
    setReleaseDetail(null);
    setErrorMessage('');

    try {
      const scanner = new Html5Qrcode(SCANNER_ID, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
        ],
        verbose: false,
      });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 12,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const width = Math.min(viewfinderWidth * 0.88, 340);
            const height = Math.min(viewfinderHeight * 0.28, 140);
            return { width, height };
          },
          aspectRatio: 1,
        },
        (decoded) => {
          const normalized = decoded.replace(/\D/g, '');
          if (normalized.length >= 8) {
            void lookupBarcode(normalized);
          }
        },
        () => {}
      );
    } catch (e) {
      setErrorMessage(
        e instanceof Error ? e.message : 'Could not access camera. Check permissions.'
      );
      setPhase('error');
    }
  }, [lookupBarcode, stopScanner]);

  useEffect(() => {
    if (!open) {
      void stopScanner();
      reset();
      return;
    }

    const timer = setTimeout(() => {
      void startScanner();
    }, 280);

    return () => {
      clearTimeout(timer);
      void stopScanner();
    };
  }, [open, reset, startScanner, stopScanner]);

  const handleRetry = () => {
    void startScanner();
  };

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

          <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4">
            <AnimatePresence mode="wait">
              {(phase === 'scanning' || phase === 'looking-up') && (
                <motion.div
                  key="scanner"
                  className="relative w-full max-w-lg"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="scanner-viewport relative overflow-hidden rounded-3xl border border-white/10 bg-black shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
                    <div id={SCANNER_ID} className="scanner-region min-h-[min(62dvh,520px)] w-full" />

                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="scanner-frame relative h-[28%] w-[88%] max-h-[140px] max-w-[340px]">
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
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm">
                        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
                        <p className="text-sm text-white/80">Looking up on Discogs…</p>
                        <p className="font-mono text-xs text-white/50">{barcode}</p>
                      </div>
                    )}
                  </div>

                  <p className="mt-6 text-center text-sm text-white/60">
                    Align the barcode inside the frame
                  </p>
                  <p className="mt-1 text-center text-xs text-white/35">
                    Works with EAN-13, UPC, and standard vinyl barcodes
                  </p>
                </motion.div>
              )}

              {phase === 'found' && result && (
                <motion.div
                  key="found"
                  className="flex w-full max-w-md flex-col items-center px-2"
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
                  className="flex w-full max-w-sm flex-col items-center text-center"
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