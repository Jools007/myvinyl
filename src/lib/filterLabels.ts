/** Strip JSON / Postgres array debris from a single scalar token. */
export function cleanFilterToken(text: string): string {
  let s = String(text ?? '').trim();
  if (!s) return '';

  for (let i = 0; i < 8; i++) {
    const next = s
      .replace(/^[\s\[\{\("'\\]+/, '')
      .replace(/[\s\]\}\)"'\\]+$/, '')
      .trim();
    if (next === s) break;
    s = next;
  }

  s = s.replace(/\\"/g, '"').replace(/\\'/g, "'");
  return s.trim();
}

function dedupeTokens(tokens: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    const cleaned = cleanFilterToken(token);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

function salvageQuotedStrings(text: string): string[] {
  const matches = [...text.matchAll(/"((?:\\.|[^"\\])*)"/g)];
  if (matches.length === 0) return [];
  return matches.map((m) => cleanFilterToken(m[1].replace(/\\"/g, '"')));
}

function tryJsonArray(text: string): string[] | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('[')) return null;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.flatMap((item) => parseFilterList(item));
    }
  } catch {
    const quoted = salvageQuotedStrings(trimmed);
    if (quoted.length > 0) return quoted;

    const close = trimmed.lastIndexOf(']');
    if (close > 0) {
      const inner = trimmed.slice(1, close);
      if (inner.includes(',')) {
        return dedupeTokens(inner.split(','));
      }
      const single = cleanFilterToken(inner);
      if (single) return [single];
    }
  }

  return null;
}

function tryPostgresArray(text: string): string[] | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];

  const parts: string[] = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (ch === ',' && !inQuote) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);

  return dedupeTokens(parts);
}

function looksLikeBrokenArrayLiteral(text: string): boolean {
  return (
    /^[\[\{]/.test(text) ||
    /[\]\}]$/.test(text) ||
    /^"+/.test(text) ||
    /"+$/.test(text) ||
    /"\s*,\s*"/.test(text) ||
    /"\]$/.test(text) ||
    /^\["/.test(text)
  );
}

/**
 * Expand any stored filter value into clean individual tokens.
 * Handles JSON arrays, Postgres array literals, comma lists, and corrupted fragments.
 */
export function parseFilterList(raw: unknown): string[] {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => parseFilterList(item));
  }

  const text = String(raw).trim();
  if (!text) return [];

  const json = tryJsonArray(text);
  if (json && json.length > 0) return dedupeTokens(json);

  const postgres = tryPostgresArray(text);
  if (postgres !== null) return postgres;

  const quoted = salvageQuotedStrings(text);
  if (quoted.length > 0) return quoted;

  if (looksLikeBrokenArrayLiteral(text)) {
    const cleaned = cleanFilterToken(text);
    return cleaned ? [cleaned] : [];
  }

  if (text.includes(',') && !looksLikeBrokenArrayLiteral(text)) {
    return dedupeTokens(text.split(','));
  }

  const cleaned = cleanFilterToken(text);
  return cleaned ? [cleaned] : [];
}

/** Normalize a single genre for display and filter matching. */
export function normalizeGenre(raw: unknown): string {
  const tokens = parseFilterList(raw);
  return tokens[0] ?? cleanFilterToken(String(raw ?? ''));
}

/** Normalize condition grades (Mint, NM, VG+, …). */
export function normalizeCondition(raw: unknown): string {
  const tokens = parseFilterList(raw);
  const token = tokens[0] ?? cleanFilterToken(String(raw ?? ''));
  return token;
}

/** Normalize vibe tags the same way as genres. */
export function normalizeVibe(raw: unknown): string {
  return normalizeGenre(raw);
}

/** Normalize plain format strings (no array parsing). */
export function normalizeFormat(raw: unknown): string {
  return cleanFilterToken(String(raw ?? ''));
}

/** @deprecated Use normalizeGenre — kept for existing imports. */
export function normalizeFilterLabel(raw: unknown): string {
  return normalizeGenre(raw);
}

/** @deprecated Use parseFilterList — kept for existing imports. */
export function expandFilterValues(raw: unknown): string[] {
  return parseFilterList(raw);
}