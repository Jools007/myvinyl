import { acquireSharedAudioElement } from './playMediaHost';
import { isIOSDevice } from './playbackDevice';
import {
  type PlaybackMediaSessionMeta,
  updatePlaybackMediaSession,
  updatePlaybackPositionState,
} from './playbackMediaSession';

/** Tiny silent MP3 — played inside the user-gesture stack to unlock iOS audio. */
const SILENT_MP3 =
  'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD//////////////////////////////////////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAAAB/0MAAAAAAAA=';

let audioContext: AudioContext | null = null;
let mediaElementSource: MediaElementAudioSourceNode | null = null;
let iosPrimed = false;

function ensureAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || !isIOSDevice()) return null;
  if (!audioContext) {
    const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioContext = new Ctx();
  }
  return audioContext;
}

function wireSharedAudioToContext(ctx: AudioContext, audio: HTMLAudioElement): void {
  if (mediaElementSource) return;
  try {
    mediaElementSource = ctx.createMediaElementSource(audio);
    mediaElementSource.connect(ctx.destination);
  } catch {
    /* element may already be wired */
  }
}

/** Call synchronously from a tap/click — before any await. */
export function primeIOSAudioSession(meta: PlaybackMediaSessionMeta): void {
  if (!isIOSDevice()) return;

  updatePlaybackMediaSession(meta, 'playing');
  updatePlaybackPositionState(30, 0);

  const ctx = ensureAudioContext();
  if (!ctx) return;

  void ctx.resume();

  const audio = acquireSharedAudioElement();
  wireSharedAudioToContext(ctx, audio);

  if (iosPrimed) return;
  iosPrimed = true;

  audio.loop = true;
  audio.muted = false;
  audio.src = SILENT_MP3;
  audio.load();
  void audio.play().catch(() => {});
}

export function isIOSPlaybackPrimed(): boolean {
  return iosPrimed;
}

/** Swap from silent prime buffer to the real Spotify preview URL. */
export function armIOSSpotifyPreview(previewUrl: string): HTMLAudioElement {
  const audio = acquireSharedAudioElement();
  const ctx = ensureAudioContext();
  if (ctx) {
    void ctx.resume();
    wireSharedAudioToContext(ctx, audio);
  }
  audio.loop = false;
  audio.muted = false;
  audio.src = previewUrl;
  audio.load();
  return audio;
}

export function shouldResumePlaybackAfterHiddenPause(): boolean {
  return isIOSDevice() && typeof document !== 'undefined' && document.hidden;
}