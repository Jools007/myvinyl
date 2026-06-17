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
  it('keeps rich wikipedia prose for famous albums', () => {
    const result = composeCharacterDescription({
      artist: 'Bill Withers',
      album: 'Still Bill',
      wikipediaExtract:
        'Still Bill is the second studio album by American soul singer-songwriter and producer Bill Withers. The album was released in May 1, 1972 through Sussex Records. The album was recorded and produced by Withers with musicians from the Watts 103rd Street Rhythm Band. The rhythmic music produced for the record features soul, funk, and blues sounds, backing lyrics that explore themes of human nature, emotion, and sex from a middle-class male perspective.',
      musicBrainzTags: ['soul', 'funk', 'r&b'],
    });
    expect(result.description.length).toBeGreaterThan(120);
    expect(result.description).toMatch(/Bill Withers/i);
    expect(result.description).toMatch(/soul|funk|blues/i);
    expect(result.description).not.toMatch(/characterful vibes/i);
  });

  it('builds tag fallback only when no prose exists', () => {
    const result = composeCharacterDescription({
      artist: 'Various',
      album: 'Ram Raiders (Volume One)',
      year: '2000',
      discogsGenres: ['Electronic', 'Drum n Bass'],
    });
    expect(result.description.toLowerCase()).toContain('drum n bass');
    expect(result.description.toLowerCase()).not.toContain('sleeve');
  });

  it('prefers wikipedia over tag shorthand when both exist', () => {
    const result = composeCharacterDescription({
      wikipediaExtract:
        'Heart of the Congos is a roots reggae album by the Congos, produced by Lee "Scratch" Perry at his Black Ark studio with a studio band including Boris Gardiner on bass and Ernest Ranglin on guitar.',
      musicBrainzTags: ['dub', 'reggae', 'roots reggae'],
    });
    expect(result.description).toMatch(/roots reggae|Black Ark|Perry/i);
    expect(result.description).not.toMatch(/deep vibes$/i);
  });
});