---
name: barcode-scanner
description: >
  Fix, debug, or change the MyVinyl mobile/desktop barcode scanner. Use when the user
  mentions barcode scanner, scan barcode, scanner broken, decoder active, scan attempts
  stuck, iOS camera, ImageCapture, ZXing, html5-qrcode, scanner-v13, or BarcodeScannerModal.
  Load BEFORE touching scanner code. All tunables live in src/lib/scannerConfig.ts.
  Run /barcode-scanner when investigating regressions.
---

# MyVinyl Barcode Scanner (scanner-v13)

**Prod:** https://myvinyl-nine.vercel.app  
**Deploy:** `cd /Users/juliangallagher/my-vinyl && vercel deploy --prod --yes`  
**Config source of truth:** `src/lib/scannerConfig.ts` — change values there only, then bump `SCANNER_BUILD`.

## Architecture (do not break)

```
BarcodeScannerModal.tsx     → thin UI only; useEffect depends on `open` only
barcodeScannerEngine.ts     → singleton; owns camera start/stop outside React
nativeMobileBarcodeScanner  → mobile path: getUserMedia + video loop + ZXing
zxingCanvasDecoder.ts       → HybridBinarizer + GlobalHistogramBinarizer, rotations
cameraAutofocus.ts          → constraints, desktop qrbox, tap-to-focus
scannerSession.ts           → pauses useCollection visibility sync while scanning
scannerConfig.ts            → ALL magic numbers and architecture flags
```

### Mobile path (verified iPhone 15)

- **Native path only** — never html5-qrcode on mobile (`SCANNER_MOBILE_USE_NATIVE_PATH`)
- **ZXing only** — never `BarcodeDetector` on mobile (`SCANNER_MOBILE_USE_BARCODE_DETECTOR`)
- **Capture:** video every even tick, `ImageCapture.grabFrame()` every odd tick
- **Decode regions:** rotate `full` → `top` → `center` (one region per tick)
- **Resolution:** ideal 1920×1080 in getUserMedia; boost after start if <720p
- **No zoom** in constraints; `focusMode: continuous` applied after stream starts

### Desktop path

- html5-qrcode at 12 fps, qrbox 88%×28% capped 340×140
- `BarcodeDetector` when available; tap-to-focus enabled

## Debug panel (on-device)

Confirm rollout: **`Build: scanner-v13`**

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Attempts stuck at 0 | Container not mounted / camera permission | Check `#barcode-scanner-region` exists before engine.start; 280ms delay |
| Attempts stuck at 1 | Decode loop wedged / React tore down camera | Engine must own lifecycle; check `inFlight` cap + watchdog; no BarcodeDetector on mobile |
| Camera 480×640 | Low-res constraints or video-only path without boost | Use `SCANNER_MOBILE_VIDEO_CONSTRAINTS`; ensure `boostCameraResolution` runs |
| Decoder active, no decode | Wrong path (html5-qrcode), zoom, or 4K frames | Native path + downscale 1440px + rotations |
| Flicker / scan stops | React effect re-runs on re-render | Modal effect deps = `[open]` only; `isScannerSessionActive()` in useCollection |
| Hang after long scan | ZXing reader wedged on iOS | `resetBarcodeDecoder()` on stall watchdog |

## Fix workflow

1. Read `references/CHANGELOG.md` for past regressions (v8–v13).
2. Read `src/lib/scannerConfig.ts` — do not scatter new constants elsewhere.
3. Reproduce on phone; note: attempts count, camera resolution, last decode message.
4. Change one thing at a time; bump `SCANNER_BUILD` to `scanner-v14` etc.
5. `npm run build` then `vercel deploy --prod --yes`.
6. Hard-refresh phone; confirm new build string in debug panel.

## Hard rules (learned from regressions)

| Never do on mobile | Why |
|--------------------|-----|
| html5-qrcode | iOS portrait + close range fails silently |
| `BarcodeDetector.detect()` | Can hang indefinitely on iOS |
| `focusMode` / `zoom` in initial getUserMedia | Breaks autofocus at barcode distance |
| 2× zoom | Blurs 1D barcodes |
| Narrow qrbox decode region | Sleeve barcodes miss the box |
| Scanner logic in React useEffect with many deps | Collection re-render stops camera |
| 6 parallel decode regions per tick | `inFlight` stuck at cap |

## Key files

| File | Role |
|------|------|
| `src/lib/scannerConfig.ts` | All tunables — edit here first |
| `src/lib/barcodeScannerEngine.ts` | Session id, start/stop, desktop/mobile routing |
| `src/lib/nativeMobileBarcodeScanner.ts` | Capture loop, timeouts, watchdog |
| `src/lib/zxingCanvasDecoder.ts` | Decode, downscale, rotations, `resetBarcodeDecoder` |
| `src/components/BarcodeScannerModal.tsx` | UI phases, engine callbacks, throttled debug |
| `src/hooks/useCollection.ts` | `isScannerSessionActive()` guard on visibilitychange |

## References

- `references/CHANGELOG.md` — version history and what broke each build
- `references/ARCHITECTURE.md` — detailed flow diagram and callback contracts