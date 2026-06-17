import { describe, expect, it } from 'vitest';
import { fitNotesTextForLines, splitNoteSentences } from './fitThermalLabelNotes';

function mockCtx(charWidth = 7): CanvasRenderingContext2D {
  return {
    measureText(text: string) {
      return { width: text.length * charWidth };
    },
  } as CanvasRenderingContext2D;
}

describe('splitNoteSentences', () => {
  it('splits on sentence boundaries', () => {
    const text =
      '"Do What You Wanna Do" is the debut single. The single reached number one.';
    expect(splitNoteSentences(text)).toEqual([
      '"Do What You Wanna Do" is the debut single.',
      'The single reached number one.',
    ]);
  });
});

describe('fitNotesTextForLines', () => {
  it('keeps complete sentences that fit', () => {
    const ctx = mockCtx();
    const text = 'First sentence about the groove. Second sentence with more detail.';
    const fitted = fitNotesTextForLines(ctx, text, 200, 4);
    expect(fitted).toBe(text);
  });

  it('does not bleed into the next sentence when the first one is too long', () => {
    const ctx = mockCtx();
    const first =
      '"Do What You Wanna Do" is the debut 1977 single by Nassau, Bahamas based group, T-Connection.';
    const second = 'The single reached number one on the disco chart.';
    const text = `${first} ${second}`;
    const fitted = fitNotesTextForLines(ctx, text, 120, 2);
    expect(fitted).not.toContain('The single reached');
    expect(fitted.endsWith('…') || fitted.endsWith('.')).toBe(true);
  });
});