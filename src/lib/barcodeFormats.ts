import { Html5QrcodeSupportedFormats } from 'html5-qrcode';

/**
 * html5-qrcode uses `formatsToSupport` (there is no formatsToDecode API).
 * QR_CODE is intentionally omitted — vinyl records use 1D product barcodes.
 */
export const VINYL_BARCODE_FORMATS: Html5QrcodeSupportedFormats[] = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
];

/** Mobile ZXing is faster with fewer symbologies — vinyl is almost always EAN/UPC. */
export const VINYL_BARCODE_FORMATS_MOBILE: Html5QrcodeSupportedFormats[] = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.CODE_128,
];

export function vinylBarcodeFormatsForDevice(mobile: boolean): Html5QrcodeSupportedFormats[] {
  return mobile ? VINYL_BARCODE_FORMATS_MOBILE : VINYL_BARCODE_FORMATS;
}

export const VINYL_BARCODE_FORMAT_LABELS: Record<string, string> = {
  [Html5QrcodeSupportedFormats.EAN_13]: 'EAN_13',
  [Html5QrcodeSupportedFormats.EAN_8]: 'EAN_8',
  [Html5QrcodeSupportedFormats.UPC_A]: 'UPC_A',
  [Html5QrcodeSupportedFormats.UPC_E]: 'UPC_E',
  [Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION]: 'UPC_EAN_EXTENSION',
  [Html5QrcodeSupportedFormats.CODE_128]: 'CODE_128',
  [Html5QrcodeSupportedFormats.CODE_39]: 'CODE_39',
  [Html5QrcodeSupportedFormats.CODE_93]: 'CODE_93',
  [Html5QrcodeSupportedFormats.ITF]: 'ITF',
  [Html5QrcodeSupportedFormats.CODABAR]: 'CODABAR',
};

export function vinylBarcodeFormatNames(): string[] {
  return VINYL_BARCODE_FORMATS.map((f) => VINYL_BARCODE_FORMAT_LABELS[f] ?? String(f));
}