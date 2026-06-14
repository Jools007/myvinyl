/** Keep playback elements in the document — required for reliable iOS Safari audio. */

import { isMobilePlaybackDevice } from './playbackDevice';

const AUDIO_ROOT_ID = 'play-audio-root';

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
  const root = getAudioMount();
  if (audio.parentElement !== root) {
    root.replaceChildren(audio);
  }
}

export function unmountAudioElement(audio: HTMLAudioElement | null): void {
  if (!audio) return;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  audio.remove();
}