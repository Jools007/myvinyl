import { motion } from 'framer-motion';
import { ExternalLink, Radio } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchLastFmVibeTracks } from '../lib/api';
import { vibeConfig } from '../lib/vibes';
import type { StarterVibe } from '../lib/types';

interface VibeDiscoveryProps {
  vibe: StarterVibe;
}

export function VibeDiscovery({ vibe }: VibeDiscoveryProps) {
  const [tracks, setTracks] = useState<
    { name: string; artist: string; url: string; image?: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const cfg = vibeConfig(vibe);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchLastFmVibeTracks(cfg.lastfmTag, 8)
      .then((t) => {
        if (!cancelled) setTracks(t);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vibe, cfg.lastfmTag]);

  if (loading) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--text-muted)]">
        Loading {cfg.label} picks from Last.fm…
      </div>
    );
  }

  if (!tracks.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5"
    >
      <div className="mb-4 flex items-center gap-2">
        <Radio className="h-4 w-4 text-[var(--violet)]" />
        <h3 className="text-sm font-semibold">Discover {cfg.label} on Last.fm</h3>
      </div>
      <p className="mb-4 text-xs text-[var(--text-secondary)]">
        Add more records to your crate — here&apos;s what&apos;s trending for this vibe.
      </p>
      <ul className="space-y-2">
        {tracks.map((t, i) => (
          <li key={`${t.artist}-${t.name}`}>
            <a
              href={t.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-[var(--bg-hover)]"
            >
              {t.image ? (
                <img src={t.image} alt="" className="h-10 w-10 rounded-lg object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-xs text-[var(--text-muted)]">
                  {i + 1}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.name}</p>
                <p className="truncate text-xs text-[var(--text-muted)]">{t.artist}</p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}