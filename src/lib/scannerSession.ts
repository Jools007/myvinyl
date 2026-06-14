/** True while the barcode scanner modal owns the camera — pauses background collection sync. */
let scannerSessionActive = false;

export function setScannerSessionActive(active: boolean): void {
  scannerSessionActive = active;
}

export function isScannerSessionActive(): boolean {
  return scannerSessionActive;
}