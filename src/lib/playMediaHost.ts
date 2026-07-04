/** Keep playback elements in the document — required for reliable iOS Safari audio. */

import { isMobilePlaybackDevice } from './playbackDevice';

const AUDIO_ROOT_ID = 'play-audio-root';

let sharedAudio: HTMLAudioElement | null = null;

export function getAudioMount(): HTMLElement {
  let root = document.getElementById(AUDIO_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = AUDIO_ROOT_ID;
    root.className = `play-dj__audio-root${isMobilePlaybackDevice() ? ' play-dj__audio-root--touch' : ''}`;
    root.setAttribute('aria-hidden', 'true');
    document.body.appendChild(root);
  }
  return root;
}

export function mountAudioElement(audio: HTMLAudioElement): void {
  audio.className = `play-dj__audio-engine${isMobilePlaybackDevice() ? ' play-dj__audio-engine--touch' : ''}`;
  audio.setAttribute('playsinline', '');
  audio.setAttribute('webkit-playsinline', '');
  audio.preload = 'auto';
  const root = getAudioMount();
  if (audio.parentElement !== root) {
    root.replaceChildren(audio);
  }
}

/** One persistent <audio> for the session — iOS background play breaks if the node is removed. */
export function acquireSharedAudioElement(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = document.createElement('audio');
    mountAudioElement(sharedAudio);
  }
  return sharedAudio;
}

export function releaseSharedAudioPlayback(): void {
  if (!sharedAudio) return;
  sharedAudio.pause();
  sharedAudio.removeAttribute('src');
  sharedAudio.load();
}

/** @deprecated Prefer releaseSharedAudioPlayback — only for full teardown tests. */
export function unmountAudioElement(audio: HTMLAudioElement | null): void {
  if (!audio) return;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  if (audio === sharedAudio) {
    audio.remove();
    sharedAudio = null;
    return;
  }
  audio.remove();
}