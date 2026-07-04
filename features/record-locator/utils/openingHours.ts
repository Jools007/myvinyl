const DAY_CODES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;
type DayCode = (typeof DAY_CODES)[number];

const DAY_INDEX: Record<DayCode, number> = {
  Su: 0,
  Mo: 1,
  Tu: 2,
  We: 3,
  Th: 4,
  Fr: 5,
  Sa: 6,
};

type TimeRange = { startMinutes: number; endMinutes: number };

type DayRule = {
  days: number[];
  ranges: TimeRange[];
  closed: boolean;
};

function parseTime(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function expandDayToken(token: string): number[] {
  const trimmed = token.trim();
  if (!trimmed) return [];

  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .flatMap((part) => expandDayToken(part))
      .filter((day, index, all) => all.indexOf(day) === index);
  }

  const rangeMatch = trimmed.match(/^([A-Za-z]{2})-([A-Za-z]{2})$/);
  if (rangeMatch) {
    const start = rangeMatch[1] as DayCode;
    const end = rangeMatch[2] as DayCode;
    if (!(start in DAY_INDEX) || !(end in DAY_INDEX)) return [];
    const days: number[] = [];
    let cursor = DAY_INDEX[start];
    const endIndex = DAY_INDEX[end];
    for (let guard = 0; guard < 7; guard += 1) {
      days.push(cursor);
      if (cursor === endIndex) break;
      cursor = (cursor + 1) % 7;
    }
    return days;
  }

  const code = trimmed as DayCode;
  return code in DAY_INDEX ? [DAY_INDEX[code]] : [];
}

function parseDayRules(raw: string): DayRule[] {
  const rules: DayRule[] = [];
  const segments = raw
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    if (/^(off|closed)$/i.test(segment)) continue;

    const offMatch = segment.match(/^([A-Za-z0-9,\-]+)\s+(off|closed)$/i);
    if (offMatch) {
      rules.push({
        days: expandDayToken(offMatch[1]),
        ranges: [],
        closed: true,
      });
      continue;
    }

    const match = segment.match(/^([A-Za-z0-9,\-]+)\s+(.+)$/);
    if (!match) continue;

    const days = expandDayToken(match[1]);
    const timePart = match[2].trim();
    if (!days.length) continue;

    if (/^(off|closed)$/i.test(timePart)) {
      rules.push({ days, ranges: [], closed: true });
      continue;
    }

    const ranges: TimeRange[] = [];
    for (const rangeToken of timePart.split(',').map((part) => part.trim())) {
      const rangeMatch = rangeToken.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
      if (!rangeMatch) continue;
      const startMinutes = parseTime(rangeMatch[1]);
      const endMinutes = parseTime(rangeMatch[2]);
      if (startMinutes == null || endMinutes == null) continue;
      ranges.push({ startMinutes, endMinutes });
    }

    if (ranges.length) {
      rules.push({ days, ranges, closed: false });
    }
  }

  return rules;
}

function minutesNow(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function isOpenAt(rules: DayRule[], date: Date): boolean | undefined {
  const day = date.getDay();
  const now = minutesNow(date);
  const dayRules = rules.filter((rule) => rule.days.includes(day));
  if (dayRules.length === 0) {
    return rules.length > 0 ? false : undefined;
  }

  let sawClosed = false;
  let sawOpenRange = false;
  for (const rule of dayRules) {
    if (rule.closed) {
      sawClosed = true;
      continue;
    }
    for (const range of rule.ranges) {
      sawOpenRange = true;
      if (range.endMinutes > range.startMinutes) {
        if (now >= range.startMinutes && now < range.endMinutes) return true;
      } else if (now >= range.startMinutes || now < range.endMinutes) {
        return true;
      }
    }
  }

  if (sawClosed && !sawOpenRange) return false;
  if (sawOpenRange) return false;
  return undefined;
}

function todaySummary(rules: DayRule[], date: Date): string | undefined {
  const day = date.getDay();
  const code = DAY_CODES[day];
  const dayRules = rules.filter((rule) => rule.days.includes(day));
  if (!dayRules.length) return undefined;

  const closed = dayRules.some((rule) => rule.closed && rule.ranges.length === 0);
  if (closed) return `${code}: Closed`;

  const ranges = dayRules.flatMap((rule) => rule.ranges);
  if (!ranges.length) return undefined;

  const formatted = ranges
    .map((range) => {
      const start = formatMinutes(range.startMinutes);
      const end = formatMinutes(range.endMinutes);
      return `${start}–${end}`;
    })
    .join(', ');

  return `${code}: ${formatted}`;
}

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export type OpeningHoursEvaluation = {
  openNow?: boolean;
  todaySummary?: string;
};

export function evaluateOsmOpeningHours(
  raw: string | undefined,
  date: Date = new Date()
): OpeningHoursEvaluation {
  if (!raw?.trim()) return {};
  const normalized = raw.trim();

  if (/^24\s*\/\s*7$/i.test(normalized)) {
    return { openNow: true, todaySummary: 'Open 24 hours' };
  }

  const rules = parseDayRules(normalized);
  if (!rules.length) return {};

  return {
    openNow: isOpenAt(rules, date),
    todaySummary: todaySummary(rules, date),
  };
}

export function applyOpeningHoursToStore<T extends { openingHoursSummary?: string; openNow?: boolean }>(
  store: T,
  date: Date = new Date()
): T {
  if (store.openNow != null || !store.openingHoursSummary) return store;
  const evaluated = evaluateOsmOpeningHours(store.openingHoursSummary, date);
  return {
    ...store,
    openNow: evaluated.openNow ?? store.openNow,
    openingHoursSummary: evaluated.todaySummary ?? store.openingHoursSummary,
  };
}