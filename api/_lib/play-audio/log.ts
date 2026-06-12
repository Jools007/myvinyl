/** Structured console logging for play-audio lookup (grep: [play-audio]). */

export function playAudioLog(
  phase: string,
  detail: Record<string, unknown>
): void {
  const payload = {
    ts: new Date().toISOString(),
    phase,
    ...detail,
  };
  console.log('[play-audio]', JSON.stringify(payload));
}