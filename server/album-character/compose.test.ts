import { describe, expect, it } from 'vitest';
import { composeCharacterDescription } from './compose';
import { isPressingNotes } from './pressing-notes';

describe('isPressingNotes', () => {
  it('flags sleeve variant copy', () => {
    expect(
      isPressingNotes(
        'U.S. variant, says "Made in the U.S.A." on the top right corner of the back sleeve.'
      )
    ).toBe(true);
  });
});

describe('composeCharacterDescription', () => {
  it('builds musical copy from tags when only genres are available', () => {
    const result = composeCharacterDescription({
      discogsGenres: ['Reggae', 'Roots Reggae', 'Dub'],
    });
    expect(result.description.toLowerCase()).toContain('dub');
    expect(result.description.toLowerCase()).toContain('vibes');
    expect(result.description.toLowerCase()).not.toContain('sleeve');
  });

  it('prefers wikipedia prose for classic albums', () => {
    const result = composeCharacterDescription({
      wikipediaExtract:
        'Heart of the Congos is a roots reggae album by the Congos, produced by Lee "Scratch" Perry at his Black Ark studio with a studio band including Boris Gardiner on bass.',
      musicBrainzTags: ['dub', 'reggae', 'roots reggae'],
    });
    expect(result.description.toLowerCase()).toMatch(/roots reggae|dub/);
    expect(result.description.toLowerCase()).toContain('scratch');
    expect(result.sources).toContain('wikipedia');
  });
});