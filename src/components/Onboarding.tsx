import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { STARTER_VIBES } from '../lib/vibes';
import type { StarterVibe } from '../lib/types';
import { StarterVibeSelector } from './StarterVibeSelector';

interface OnboardingProps {
  onComplete: (vibe: StarterVibe, loadDemo: boolean) => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [vibe, setVibe] = useState<StarterVibe | undefined>();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg)] p-4">
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-3xl"
      >
        <div className="mb-10 text-center">
          <motion.div
            initial={false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring' }}
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: 'var(--accent-soft)' }}
          >
            <Sparkles className="h-8 w-8 text-[var(--accent)]" />
          </motion.div>
          <h1
            className="text-3xl font-semibold tracking-tight sm:text-4xl"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Welcome to MyVinyl
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[var(--text-secondary)]">
            Your premium crate-digging companion. Pick your starter vibe — we&apos;ll surface the
            right records from your collection.
          </p>
        </div>

        <StarterVibeSelector selected={vibe} onSelect={setVibe} />

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            disabled={!vibe}
            onClick={() => vibe && onComplete(vibe, true)}
            className="btn-primary min-w-[200px] disabled:opacity-40"
          >
            Start with demo collection
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={!vibe}
            onClick={() => vibe && onComplete(vibe, false)}
            className="btn-ghost disabled:opacity-40"
          >
            Empty collection
          </button>
        </div>

        <p className="mt-8 text-center text-xs text-[var(--text-muted)]">
          {STARTER_VIBES.length} vibes · Discogs-powered · Harmonic mixing
        </p>
      </motion.div>
    </div>
  );
}