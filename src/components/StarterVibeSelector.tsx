import { motion } from 'framer-motion';
import { STARTER_VIBES } from '../lib/vibes';
import type { StarterVibe } from '../lib/types';

interface StarterVibeSelectorProps {
  selected?: StarterVibe;
  onSelect: (vibe: StarterVibe) => void;
  compact?: boolean;
}

export function StarterVibeSelector({ selected, onSelect, compact }: StarterVibeSelectorProps) {
  return (
    <div className={`grid gap-2 ${compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'}`}>
      {STARTER_VIBES.map((vibe, i) => {
        const active = selected === vibe.id;
        return (
          <motion.button
            key={vibe.id}
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(vibe.id)}
            className={`relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 ${
              active
                ? 'border-transparent shadow-[var(--shadow-lg)]'
                : 'border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)]'
            }`}
            style={
              active
                ? {
                    background: `linear-gradient(135deg, color-mix(in srgb, ${vibe.accent} 18%, var(--bg-elevated)), var(--bg-elevated))`,
                    boxShadow: `0 8px 32px color-mix(in srgb, ${vibe.accent} 25%, transparent)`,
                  }
                : undefined
            }
          >
            {active && (
              <motion.div
                layoutId="vibe-ring"
                className="absolute inset-0 rounded-2xl ring-2"
                style={{ ringColor: vibe.accent } as React.CSSProperties}
              />
            )}
            <span className="text-xl">{vibe.emoji}</span>
            <h4 className="mt-2 text-sm font-semibold">{vibe.label}</h4>
            {!compact && (
              <p className="mt-1 text-[11px] leading-snug text-[var(--text-muted)]">
                {vibe.description}
              </p>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}