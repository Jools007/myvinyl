/** Normalize scanned product codes for Discogs barcode search (UPC/EAN variants). */

export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** UPC-A 12-digit → Discogs "text" barcode format: 1-5-5-1 with spaces. */
export function formatUpcAForDiscogs(digits: string): string | null {
  if (digits.length !== 12) return null;
  return `${digits[0]} ${digits.slice(1, 6)} ${digits.slice(6, 11)} ${digits[11]}`;
}

export function barcodeLookupVariants(raw: string): string[] {
  const trimmed = raw.trim();
  const digits = digitsOnly(trimmed);
  const variants: string[] = [];

  const push = (value: string) => {
    const v = value.trim();
    if (v && !variants.includes(v)) variants.push(v);
  };

  if (trimmed) push(trimmed);
  if (digits) push(digits);

  if (digits.length === 12) {
    push(`0${digits}`);
    const spaced = formatUpcAForDiscogs(digits);
    if (spaced) push(spaced);
  }

  if (digits.length === 13 && digits.startsWith('0')) {
    push(digits.slice(1));
    const inner = digits.slice(1);
    if (inner.length === 12) {
      const spaced = formatUpcAForDiscogs(inner);
      if (spaced) push(spaced);
    }
  }

  if (digits.length === 8) push(digits);

  return variants;
}

export function isPlausibleVinylBarcode(digits: string, formatName?: string): boolean {
  const len = digits.length;
  if (formatName?.includes('EAN_8') || formatName?.includes('UPC_E')) {
    return len === 6 || len === 8;
  }
  return len === 8 || len === 12 || len === 13;
}