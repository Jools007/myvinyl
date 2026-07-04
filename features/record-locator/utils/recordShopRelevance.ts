export type RecordShopRelevanceInput = {
  name: string;
  address?: string;
  shop?: string;
  types?: string[];
};

export type RecordShopRelevanceOptions = {
  /** Google text-search hits are noisier — require stronger retail signals. */
  source?: 'osm' | 'google';
};

const KNOWN_RECORD_SHOPS =
  /viniloteka|vinylomania|muzikumas|thelonious|imuzika|buymusic|ragainė|discotag|mint vinetu|phono shop|trolley records|vinilo studija/i;

const RETAIL_PHRASE =
  /record store|record shop|music store|music shop|vinyl shop|vinyl store|muzikos įrašų|parduotuv/i;

const VINYL_NAME =
  /record|vinyl|vinil|plokštel|vinilo|viniloteka|vinylomania|vinilų|plokštelių|phonograph|turntabl|\bLP\b|vinilinių/i;

const EXCLUDE_TEXT =
  /barber|grindų|grindys|flooring|\bfloor(ing)?\b|drabuž|clothing|bibliotek|library|e\.?\s*parduotuv|mastering|įrašų studij|sound studio|recording studio|national library|public institution|\binstitution\b|mailorder|mail order|\bdistro\b/i;

const COFFEE_NAME = /coffee|kavos|kavinė/i;

const STUDIO_NAME = /\bstudio\b/i;

function haystack(input: RecordShopRelevanceInput): string {
  return `${input.name} ${input.address ?? ''}`.trim();
}

function isExcluded(input: RecordShopRelevanceInput): boolean {
  const name = input.name.trim();
  const combined = haystack(input);

  if (!name || EXCLUDE_TEXT.test(combined)) return true;
  if (input.types?.includes('barber_shop')) return true;
  if (COFFEE_NAME.test(name) || input.types?.includes('coffee_shop')) return true;
  if (
    STUDIO_NAME.test(name) &&
    !/\brecord store\b|\bvinyl shop\b|parduotuv/i.test(name) &&
    !KNOWN_RECORD_SHOPS.test(name)
  ) {
    return true;
  }

  if (
    /\brecords\b/i.test(name) &&
    !RETAIL_PHRASE.test(name) &&
    !KNOWN_RECORD_SHOPS.test(name)
  ) {
    return true;
  }

  return false;
}

export function isLikelyRecordShopCandidate(
  input: RecordShopRelevanceInput,
  options?: RecordShopRelevanceOptions
): boolean {
  const name = input.name.trim();
  if (!name || isExcluded(input)) return false;

  const shop = input.shop?.toLowerCase();
  if (shop === 'music' || shop === 'vinyl' || shop === 'hifi') return true;

  if (KNOWN_RECORD_SHOPS.test(name)) return true;
  if (RETAIL_PHRASE.test(name)) return true;

  if (options?.source === 'google') {
    return false;
  }

  if (VINYL_NAME.test(name)) return true;
  if (/\bphono\b/i.test(name)) return true;

  return false;
}