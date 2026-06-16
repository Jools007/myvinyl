/** Phomemo BLE constants (from phomymo, MIT license). */
export const PHOMEMO_BLE = {
  SERVICE_UUID: 0xff00,
  WRITE_CHAR_UUID: 0xff02,
  NOTIFY_CHAR_UUID: 0xff03,
  ALT_SERVICE_UUIDS: [
    0xff00,
    0xffe0,
    0xae30,
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    '0000ff00-0000-1000-8000-00805f9b34fb',
  ] as (number | string)[],
  CHUNK_SIZE: 128,
  CHUNK_DELAY_MS: 20,
} as const;

/** M220 uses m-series protocol, 203 DPI (phomymo printers.json). */
export const M220_CONFIG = {
  /** Full print head width in bytes (72mm printable @ 8 px/mm). */
  headWidthBytes: 72,
  dpi: 203,
  /** M220 die-cut rolls are right-aligned on the 72mm head (phomymo default). */
  headAlignment: 'right' as const,
  feedDots: 48,
  /** Mid-high density — 7 over-burns small type on 40×30 mm labels. */
  density: 5,
};