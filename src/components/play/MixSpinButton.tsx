import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

export type MixSpinButtonProps = {
  disabled: boolean;
  loading: boolean;
  label?: string;
  onClick: () => void;
};

export function MixSpinButton({
  disabled,
  loading,
  label = 'Spin it',
  onClick,
}: MixSpinButtonProps) {
  return (
    <motion.button
      type="button"
      className="mix-orbit__spin-btn btn-primary"
      disabled={disabled || loading}
      onClick={onClick}
      aria-busy={loading}
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden />
          <span>Cueing…</span>
        </>
      ) : (
        label
      )}
    </motion.button>
  );
}