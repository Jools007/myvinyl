# Barcode Scanner Changelog

All tunables are in `src/lib/scannerConfig.ts`. Bump `SCANNER_BUILD` on every deploy.

## scanner-v13 (Jun 2026) — CURRENT, VERIFIED iPhone 15

**Status:** Working — decode + Discogs lookup confirmed.

### What shipped
- `barcodeScannerEngine` singleton — camera lifecycle outside React
- `BarcodeScannerModal` thin UI — `useEffect` depends on `open` only
- Mobile: native path, ZXing only, video + ImageCapture alternate ticks
- Regions: full → top → center (one per tick)
- Timeouts: capture 1.5s, decode 2s; watchdog resets `inFlight` + `resetBarcodeDecoder()`
- `scannerConfig.ts` centralizes all constants
- `isScannerSessionActive()` pauses collection visibility sync

### Debug panel expectations
- Build: `scanner-v13`
- Attempts climb steadily (10, 20, 30…)
- Camera: ~1080×1920 (portrait)
- Decoder: `Video + ImageCapture + ZXing`

---

## scanner-v12 — BROKEN

### Symptoms
- Attempts frozen at 1
- Preview flicker
- Scan stops mid-session

### Root causes
1. React `useEffect` cleanup raced with `startScanner` (generation refs insufficient)
2. Six decode attempts per tick → `inFlight` stuck at cap
3. `BarcodeDetector.detect()` possible hang on iOS
4. `setScanDebug` on every layout tick → flicker

### Fix → v13
- Engine owns lifecycle; modal is display-only
- One region per tick; `inFlight` max 2 + watchdog
- No BarcodeDetector on mobile
- Throttled debug updates (every 10 attempts)

---

## scanner-v11 — WORKED (decode)

### What worked
- Video-first capture matching preview
- Top/center/full regions + ZXing rotations on portrait
- 1080×1920 resolution

### What was still fragile
- Scanner logic still in React modal → v12 regressions

---

## scanner-v10 — PARTIAL

- ImageCapture restored, resolution boost → 1080×1920 OK
- Still no reliable decode (wrong capture/decode ordering)

---

## scanner-v9 — REGRESSION

- iOS forced low-res video only → **480×640**
- Too few pixels for 1D barcode decode

### Fix
- Video + ImageCapture alternate; post-start resolution boost

---

## scanner-v8 — WORKED (first reliable mobile decode)

- All mobiles → native path (not gated on `BarcodeDetector`)
- `ImageCapture.grabFrame()` + ZXing
- Not gated on `BarcodeDetector` availability

---

## scanner-v5–v7 — BROKEN on many iPhones

- Native path gated on `BarcodeDetector` — absent on many iOS versions

---

## scanner-v3–v4 / initial commit (7eaf8a8)

- Desktop: html5-qrcode, 12 fps, qrbox 88%×28%
- Mobile: html5-qrcode full frame — unreliable on iOS

### Still valid for desktop
- `SCANNER_FPS_DESKTOP = 12`
- `SCANNER_QRBOX` dimensions