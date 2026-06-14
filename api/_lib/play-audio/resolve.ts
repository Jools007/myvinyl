import { withTimeout } from './timeout';
import { isCompilationAlbum, knownStudioAlbumsForArtist } from './studio';
import { playAudioLog } from './log';
import {
  pickSpotifyPreviewLoose,
  resolveSpotifyPlayPreview,
  type SpotifyTrackAudio,
} from './spotify';
import {
  albumSearchVariants,
  artistSearchVariants,
  titleSearchVariants,
} from './track-title';
import { searchYouTubeForTrack, type YouTubeVideoMatch } from './youtube';

const SPOTIFY_PASS_MS = 6_000;
/** InnerTube search + embed checks often exceed 12s — keep headroom so hits are not dropped. */
const YOUTUBE_PASS_MS = 18_000;

export type PlayAudioResult =
  | {
      source: 'spotify';
      previewUrl: string;
      spotifyTrackId?: string;
      durationSec: number;
    }
  | {
      source: 'youtube';
      videoId: string;
      videoTitle?: string;
    };

export type PlayAudioContext = {
  artist: string;
  title: string;
  album?: string;
  albumIndex?: number;
  spotifyTrackId?: string;
  spotifyId?: string;
  spotifySecret?: string;
  youtubeApiKey?: string;
  excludeVideoIds?: string[];
};

function albumsForSpotifyLookup(ctx: PlayAudioContext): (string | undefined)[] {
  const out: (string | undefined)[] = [];
  const seen = new Set<string>();
  const push = (raw?: string) => {
    const key = (raw ?? '').trim().toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(raw?.trim() || undefined);
  };

  if (ctx.album?.trim()) {
    for (const al of albumSearchVariants(ctx.album)) push(al);
  }

  if (!ctx.album || isCompilationAlbum(ctx.album)) {
    for (const studio of knownStudioAlbumsForArtist(ctx.artist).slice(0, 2)) {
      push(studio);
    }
  }

  return out;
}

async function trySpotify(
  ctx: PlayAudioContext,
  artist: string,
  title: string,
  album?: string,
  mode: 'loose' | 'full' = 'loose'
): Promise<SpotifyTrackAudio | null> {
  if (!ctx.spotifyId || !ctx.spotifySecret) return null;

  if (mode === 'loose') {
    return withTimeout(
      pickSpotifyPreviewLoose(
        ctx.spotifyId,
        ctx.spotifySecret,
        artist,
        title,
        album,
        2
      ),
      SPOTIFY_PASS_MS,
      null
    );
  }

  return withTimeout(
    resolveSpotifyPlayPreview(ctx.spotifyId, ctx.spotifySecret, artist, title, album, {
      fetchRetries: 2,
      spotifyTrackId: ctx.spotifyTrackId,
      albumIndex: ctx.albumIndex,
    }),
    SPOTIFY_PASS_MS,
    null
  );
}

async function tryYouTube(
  ctx: PlayAudioContext,
  artist: string,
  title: string
): Promise<YouTubeVideoMatch | null> {
  return withTimeout(
    searchYouTubeForTrack(
      artist,
      title,
      ctx.album,
      ctx.youtubeApiKey,
      ctx.excludeVideoIds ?? []
    ),
    YOUTUBE_PASS_MS,
    null
  );
}

function toSpotifyResult(audio: SpotifyTrackAudio): PlayAudioResult {
  return {
    source: 'spotify',
    previewUrl: audio.previewUrl!,
    spotifyTrackId: audio.spotifyTrackId,
    durationSec: 30,
  };
}

function toYouTubeResult(hit: YouTubeVideoMatch): PlayAudioResult {
  return {
    source: 'youtube',
    videoId: hit.videoId,
    videoTitle: hit.title,
  };
}

/** Resolve when the first task returns a non-null result (or all finish). */
async function raceAudioResults(
  tasks: (() => Promise<PlayAudioResult | null>)[]
): Promise<PlayAudioResult | null> {
  if (!tasks.length) return null;

  return new Promise((resolve) => {
    let pending = tasks.length;
    let settled = false;

    const finish = (value: PlayAudioResult | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    for (const task of tasks) {
      task()
        .then((value) => {
          if (value) finish(value);
          else if (--pending === 0) finish(null);
        })
        .catch(() => {
          if (--pending === 0) finish(null);
        });
    }
  });
}

/**
 * Find playable audio — tries many artist/title variants on Spotify and YouTube.
 */
export async function resolvePlayableAudio(
  ctx: PlayAudioContext
): Promise<PlayAudioResult | null> {
  const artist = ctx.artist.trim();
  const title = ctx.title.trim();
  if (!artist || !title) return null;

  const artists = artistSearchVariants(artist);
  const titles = titleSearchVariants(title);
  const albums = albumsForSpotifyLookup({ ...ctx, artist, title });

  playAudioLog('start', {
    artist,
    title,
    album: ctx.album ?? null,
    titleVariants: titles,
    artistVariants: artists,
    albumPasses: albums,
  });

  // Fast path: enrichment already pinned the Spotify track id
  if (ctx.spotifyTrackId?.trim() && ctx.spotifyId && ctx.spotifySecret) {
    const direct = await trySpotify(ctx, artist, title, ctx.album, 'full');
    if (direct?.previewUrl) {
      playAudioLog('done', { source: 'spotify', phase: 'track-id' });
      return toSpotifyResult(direct);
    }
    const yt = await tryYouTube(ctx, artist, title);
    if (yt) {
      playAudioLog('done', { source: 'youtube', phase: 'track-id-youtube' });
      return toYouTubeResult(yt);
    }
  }

  // Phase 1: primary strings — return as soon as Spotify OR YouTube succeeds
  const primary = await raceAudioResults([
    () =>
      trySpotify(ctx, artist, title, ctx.album, 'loose').then((r) =>
        r?.previewUrl ? toSpotifyResult(r) : null
      ),
    () => tryYouTube(ctx, artist, title).then((r) => (r ? toYouTubeResult(r) : null)),
  ]);
  if (primary) {
    playAudioLog('done', { source: primary.source, phase: 'primary-race' });
    return primary;
  }

  // Phase 2: all title × artist variants (loose Spotify + YouTube)
  for (const a of artists) {
    for (const t of titles) {
      if (a === artist && t === title) continue;

      const variant = await raceAudioResults([
        () =>
          trySpotify(ctx, a, t, ctx.album, 'loose').then((r) =>
            r?.previewUrl ? toSpotifyResult(r) : null
          ),
        () => tryYouTube(ctx, a, t).then((r) => (r ? toYouTubeResult(r) : null)),
      ]);
      if (variant) {
        playAudioLog('done', {
          source: variant.source,
          phase: 'variant-race',
          artist: a,
          title: t,
        });
        return variant;
      }
    }
  }

  // Phase 3: album-scoped Spotify (release + studio compilations)
  for (const album of albums) {
    for (const a of artists) {
      for (const t of titles) {
        const sp = await trySpotify(ctx, a, t, album, 'loose');
        if (sp?.previewUrl) {
          playAudioLog('done', {
            source: 'spotify',
            phase: 'album-loose',
            artist: a,
            title: t,
            album: album ?? null,
          });
          return toSpotifyResult(sp);
        }
        const full = await trySpotify(ctx, a, t, album, 'full');
        if (full?.previewUrl) {
          playAudioLog('done', {
            source: 'spotify',
            phase: 'album-full',
            artist: a,
            title: t,
            album: album ?? null,
          });
          return toSpotifyResult(full);
        }
      }
    }
  }

  playAudioLog('miss', { artist, title, album: ctx.album ?? null });
  return null;
}