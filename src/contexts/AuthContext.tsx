import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthError, Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type AuthResult = { error: AuthError | null };

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function clearLocalAuthSession(): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' });
}

function isStaleSessionError(error: AuthError | null | undefined): boolean {
  if (!error) return false;
  const status = (error as AuthError & { status?: number }).status;
  return status === 401 || status === 403;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const {
          data: { session: storedSession },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          console.warn('[auth] getSession failed; clearing local session', sessionError.message);
          await clearLocalAuthSession();
          if (!mounted) return;
          setSession(null);
          setUser(null);
          setLoading(false);
          return;
        }

        if (storedSession) {
          const {
            data: { user: verifiedUser },
            error: userError,
          } = await supabase.auth.getUser();

          if (userError || !verifiedUser) {
            if (isStaleSessionError(userError)) {
              console.warn('[auth] Stale session removed after /user check');
            }
            await clearLocalAuthSession();
            if (!mounted) return;
            setSession(null);
            setUser(null);
            setLoading(false);
            return;
          }

          if (!mounted) return;
          setSession(storedSession);
          setUser(verifiedUser);
          setLoading(false);
          return;
        }

        if (!mounted) return;
        setSession(null);
        setUser(null);
        setLoading(false);
      } catch (err) {
        console.error('[auth] init failed; clearing local session', err);
        await clearLocalAuthSession().catch(() => undefined);
        if (!mounted) return;
        setSession(null);
        setUser(null);
        setLoading(false);
      }
    };

    void initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error };
    if (!data.session && !data.user) {
      return {
        error: {
          name: 'AuthApiError',
          message: 'Sign-up did not return a user. Check Supabase auth settings.',
        } as AuthError,
      };
    }
    return { error: null };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error };
    if (!data.session) {
      return {
        error: {
          name: 'AuthApiError',
          message:
            'Sign-in succeeded but no session was created. Clear site data for localhost and try again.',
        } as AuthError,
      };
    }
    return { error: null };
  }, []);

  const signOut = useCallback(async (): Promise<AuthResult> => {
    const { error } = await supabase.auth.signOut();
    return { error };
  }, []);

  const value = useMemo(
    () => ({ user, session, loading, signUp, signIn, signOut }),
    [user, session, loading, signUp, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}