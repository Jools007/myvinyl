import { ChevronDown, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  cleanAlbumText,
  fetchAlbumDescription,
  fetchDiscogsRelease,
} from '../lib/api';
import type { VinylRecord } from '../lib/types';

export type AboutReleaseSource = Pick<
  VinylRecord,
  'id' | 'artist' | 'title' | 'discogsId' | 'notes'
>;

async function resolveAboutDescription(source: AboutReleaseSource): Promise<string> {
  const fromNotes = cleanAlbumText(source.notes);
  if (fromNotes) return fromNotes;

  let discogsNotes: string | undefined;

  if (source.discogsId) {
    try {
      const release = await fetchDiscogsRelease(source.discogsId);
      discogsNotes = release.notes;
      const fromDiscogs = cleanAlbumText(discogsNotes);
      if (fromDiscogs) return fromDiscogs;
    } catch {
      /* try Last.fm next */
    }
  }

  try {
    return await fetchAlbumDescription(source.artist, source.title, discogsNotes);
  } catch {
    return '';
  }
}

function truncatePreview(text: string, max = 72): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trim()}…`;
}

export function AboutReleaseSection({
  source,
  className = '',
}: {
  source: AboutReleaseSource;
  className?: string;
}) {
  const notesFirst = cleanAlbumText(source.notes);
  const [text, setText] = useState(notesFirst);
  const [loading, setLoading] = useState(!notesFirst);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const immediate = cleanAlbumText(source.notes);
    setText(immediate);

    if (immediate) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const resolved = await resolveAboutDescription(source);
      if (cancelled) return;
      setText(resolved);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [source.id, source.artist, source.title, source.discogsId, source.notes]);

  const hasText = text.trim().length > 0;

  const summaryLine = loading
    ? 'Loading description…'
    : hasText
      ? truncatePreview(text)
      : 'No description available yet.';

  return (
    <section
      className={`about-release-section ${className}`.trim()}
      aria-label="About this release"
    >
      <button
        type="button"
        className="about-release-section__toggle"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-controls={`record-about-${source.id}`}
      >
        <span className="about-release-section__toggle-copy min-w-0">
          <span className="about-release-section__heading">About this release</span>
          {!expanded ? (
            <span className="about-release-section__preview">
              {loading ? (
                <>
                  <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden />
                  {summaryLine}
                </>
              ) : (
                summaryLine
              )}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={`about-release-section__chevron h-3.5 w-3.5 shrink-0 ${
            expanded ? 'about-release-section__chevron--open' : ''
          }`}
          aria-hidden
        />
      </button>

      <div
        id={`record-about-${source.id}`}
        className={`about-release-section__panel ${
          expanded ? 'about-release-section__panel--open' : ''
        }`}
      >
        {loading ? (
          <p className="about-release-section__placeholder">
            <Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" aria-hidden />
            Loading description…
          </p>
        ) : hasText ? (
          <p className="about-release-section__text">{text}</p>
        ) : (
          <p className="about-release-section__placeholder">
            No description available yet.
          </p>
        )}
      </div>
    </section>
  );
}