import { resolvePlayableAudio, type PlayAudioResult } from './resolve';
import { getSpotifyRateLimitRetrySec, isSpotifyRateLimited } from './spotify';

export type PlayAudioHandlerInput = {
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

export type PlayAudioHandlerSuccess = {
  ok: true;
  status: 200;
  data: PlayAudioResult;
};

export type PlayAudioHandlerFailure = {
  ok: false;
  status: 404 | 503;
  error: string;
  retryAfterSec?: number;
};

export type PlayAudioHandlerResult = PlayAudioHandlerSuccess | PlayAudioHandlerFailure;

export async function handlePlayAudio(
  input: PlayAudioHandlerInput
): Promise<PlayAudioHandlerResult> {
  const artist = input.artist.trim();
  const title = input.title.trim();
  if (!artist || !title) {
    return { ok: false, status: 404, error: 'artist and title required' };
  }

  const playback = await resolvePlayableAudio({
    artist,
    title,
    album: input.album?.trim() || undefined,
    albumIndex:
      input.albumIndex != null && !Number.isNaN(input.albumIndex) && input.albumIndex > 0
        ? input.albumIndex
        : undefined,
    spotifyTrackId: input.spotifyTrackId?.trim() || undefined,
    spotifyId: input.spotifyId,
    spotifySecret: input.spotifySecret,
    youtubeApiKey: input.youtubeApiKey,
    excludeVideoIds: input.excludeVideoIds,
  });

  if (playback) {
    return { ok: true, status: 200, data: playback };
  }

  if (isSpotifyRateLimited()) {
    return {
      ok: false,
      status: 503,
      error:
        'No playable audio found right now (Spotify rate-limited). Try again in a few seconds.',
      retryAfterSec: getSpotifyRateLimitRetrySec(),
    };
  }

  return { ok: false, status: 404, error: 'No playable audio found' };
}