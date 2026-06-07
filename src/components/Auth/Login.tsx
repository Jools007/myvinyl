import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { MyVinylBrandMark } from '../MyVinylBrandMark';

type AuthMode = 'signIn' | 'signUp';

export function Login() {
  const { loading, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const resetFeedback = () => {
    setError(null);
    setMessage(null);
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    resetFeedback();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetFeedback();

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Email and password are required.');
      return;
    }

    setSubmitting(true);
    const { error: authError } =
      mode === 'signIn'
        ? await signIn(trimmedEmail, password)
        : await signUp(trimmedEmail, password);
    setSubmitting(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (mode === 'signUp') {
      setMessage('Account created. Check your email to confirm your account, then sign in.');
      setMode('signIn');
      setPassword('');
    }
  };

  if (loading) {
    return (
      <div className="login-screen">
        <LoginBrand />
        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="login-screen">
      <LoginBrand />
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        className="login-screen__card w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-8 shadow-[var(--shadow-lg)]"
      >
        <div className="mb-8 text-center">
          <h1
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {mode === 'signIn' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {mode === 'signIn'
              ? 'Sign in to sync your vinyl collection.'
              : 'Sign up to save your crate across devices.'}
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-[var(--bg-subtle)] p-1">
          <button
            type="button"
            onClick={() => switchMode('signIn')}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              mode === 'signIn'
                ? 'bg-[var(--bg-elevated)] text-[var(--text)] shadow-[var(--shadow)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => switchMode('signUp')}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              mode === 'signUp'
                ? 'bg-[var(--bg-elevated)] text-[var(--text)] shadow-[var(--shadow)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            Sign up
          </button>
        </div>

        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div>
            <label
              htmlFor="auth-email"
              className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]"
            >
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              className="input-field w-full"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <div>
            <label
              htmlFor="auth-password"
              className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]"
            >
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              className="input-field w-full"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              minLength={6}
              required
            />
          </div>

          {error && (
            <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
              {error}
            </p>
          )}

          {message && (
            <p className="rounded-xl border border-[var(--accent-soft)] bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--text-secondary)]">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {mode === 'signIn' ? 'Signing in…' : 'Creating account…'}
              </>
            ) : mode === 'signIn' ? (
              'Sign in'
            ) : (
              'Create account'
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function LoginBrand() {
  return (
    <div className="login-brand">
      <MyVinylBrandMark className="login-brand__mark" size={56} />
      <span className="login-brand__wordmark" style={{ fontFamily: 'var(--font-display)' }}>
        MyVinyl
      </span>
    </div>
  );
}