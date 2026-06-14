/** Playback quirks on phones/tablets — keep free of React for use in plain classes. */

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function isMobilePlaybackDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return isIOSDevice() || /Android/i.test(navigator.userAgent);
}

export function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

/** YouTube IFrame API rejects 127.0.0.1 / [::1] origins — use localhost in dev. */
export function isLoopbackIpHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === '127.0.0.1' || host === '[::1]';
}

export function redirectLoopbackToLocalhost(): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  if (!isLoopbackIpHost()) return;
  const url = new URL(window.location.href);
  url.hostname = 'localhost';
  window.location.replace(url.toString());
}

/** iOS: enablejsapi embed; localhost desktop: plain iframe (see playbackConfig). */
export function shouldUseSimpleYouTubeEmbed(): boolean {
  return isIOSDevice() || isLocalDevHost();
}

export function canAutoplayFromLoad(immediate: { source: string; previewUrl?: string } | null): boolean {
  if (!isMobilePlaybackDevice()) return true;
  if (!immediate) return false;
  return immediate.source === 'spotify' && Boolean(immediate.previewUrl?.trim());
}