/** Detect collector / pressing copy — not musical character. */

const PRESSING_SIGNALS = [
  /\bvariant\b/i,
  /\bsleeve\b/i,
  /\bbarcode\b/i,
  /\bmatrix\b/i,
  /\bpressing\b/i,
  /\breissue\b/i,
  /\blimited edition\b/i,
  /\bmade in\b/i,
  /\bback (cover|sleeve)\b/i,
  /\btop (right|left) corner\b/i,
  /\binsert\b/i,
  /\bobi\b/i,
  /\bsticker\b/i,
  /\bwhite label\b/i,
  /\bpromo\b/i,
  /\btest pressing\b/i,
  /\bcountry\b/i,
  /\beu version\b/i,
  /\bu\.?s\.? variant\b/i,
];

export function isPressingNotes(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const hits = PRESSING_SIGNALS.filter((re) => re.test(trimmed)).length;
  if (hits >= 2) return true;
  if (hits === 1 && trimmed.length < 220) return true;
  return false;
}