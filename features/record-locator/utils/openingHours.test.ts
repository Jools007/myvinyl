import { describe, expect, it } from 'vitest';
import { evaluateOsmOpeningHours } from './openingHours';

describe('evaluateOsmOpeningHours', () => {
  it('returns open for 24/7', () => {
    const result = evaluateOsmOpeningHours('24/7');
    expect(result.openNow).toBe(true);
    expect(result.todaySummary).toBe('Open 24 hours');
  });

  it('detects open on Saturday afternoon from weekday + Saturday rules', () => {
    const saturdayAfternoon = new Date('2026-07-04T15:46:00');
    const result = evaluateOsmOpeningHours('Mo-Fr 10:00-18:00; Sa 10:00-17:00', saturdayAfternoon);
    expect(result.openNow).toBe(true);
    expect(result.todaySummary).toMatch(/Sa:/);
  });

  it('detects closed on Sunday when only weekday hours exist', () => {
    const sunday = new Date('2026-07-05T12:00:00');
    const result = evaluateOsmOpeningHours('Mo-Fr 10:00-18:00', sunday);
    expect(result.openNow).toBe(false);
  });

  it('detects closed outside business hours', () => {
    const saturdayEvening = new Date('2026-07-04T20:30:00');
    const result = evaluateOsmOpeningHours('Mo-Sa 10:00-19:00', saturdayEvening);
    expect(result.openNow).toBe(false);
  });

  it('returns empty evaluation for unknown format', () => {
    const result = evaluateOsmOpeningHours('by appointment only');
    expect(result.openNow).toBeUndefined();
  });
});